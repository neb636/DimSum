import type { Preferences, ThemePreference } from "../../shared/models";
import { useWorkbenchStore } from "./workbench-store";

export const defaultPreferences: Preferences = {
  theme: "system",
  terminal: { fontFamily: "system", fontSize: 13 },
  editor: { fontFamily: "system", fontSize: 13, syntaxTheme: "gatito" },
  composer: { hiddenMenus: [] },
};

export const FONT_SIZE_RANGE = { min: 9, max: 24 } as const;

/** Monospace fonts offered for code surfaces. `system` is the app's own mono stack; others fall back to it when missing. */
export const monoFonts: { id: string; label: string; family?: string }[] = [
  { id: "system", label: "System (SF Mono)" },
  { id: "menlo", label: "Menlo", family: "Menlo" },
  { id: "monaco", label: "Monaco", family: "Monaco" },
  { id: "jetbrains-mono", label: "JetBrains Mono", family: "JetBrains Mono" },
  { id: "fira-code", label: "Fira Code", family: "Fira Code" },
  { id: "cascadia-code", label: "Cascadia Code", family: "Cascadia Code" },
  { id: "source-code-pro", label: "Source Code Pro", family: "Source Code Pro" },
  { id: "ibm-plex-mono", label: "IBM Plex Mono", family: "IBM Plex Mono" },
  { id: "hack", label: "Hack", family: "Hack" },
  { id: "pt-mono", label: "PT Mono", family: "PT Mono" },
  { id: "courier-new", label: "Courier New", family: "Courier New" },
];

/**
 * Syntax themes for the dark code surfaces, after the VS Code themes they are named for. Each id is a
 * `[data-syntax-theme]` palette in `theme/syntax-themes.css`. An id not listed here shows the default: that includes
 * `dimsum-dark`, which every profile saved while it was the only theme, so those profiles move to the new default.
 */
export const syntaxThemes: { id: string; label: string; description: string }[] = [
  { id: "gatito", label: "Gatito", description: "Calm pastels on slate. The default." },
  { id: "one-dark-pro", label: "One Dark Pro", description: "Atom's One Dark, as kept by One Dark Pro." },
  { id: "dracula", label: "Dracula", description: "Vivid pinks, greens and purples on violet-grey." },
  { id: "tokyo-night", label: "Tokyo Night", description: "Cool blues and purples on deep navy." },
  { id: "night-owl", label: "Night Owl", description: "Tuned for night-time reading, on midnight blue." },
  { id: "one-monokai", label: "One Monokai", description: "Monokai's colours on One Dark's background." },
  { id: "dimsum", label: "DimSum", description: "DimSum's original palette, after Xcode's dark theme." },
];

/** The syntax theme an id names, or the default when it names none. */
export function syntaxThemeId(id: string): string {
  return syntaxThemes.some((theme) => theme.id === id) ? id : defaultPreferences.editor.syntaxTheme;
}

const systemMono = () => getComputedStyle(document.documentElement).getPropertyValue("--wb-font-mono").trim() || "monospace";

/** The CSS font stack for a font id. */
export function monoFontStack(id: string): string {
  const family = monoFonts.find((font) => font.id === id)?.family;
  return family ? `"${family}", ${systemMono()}` : systemMono();
}

/** Whether a font is installed: text set in it measures differently from the generic families it would fall back to. */
let probe: CanvasRenderingContext2D | null | undefined;
export function isFontInstalled(family: string | undefined): boolean {
  if (!family) return true;
  probe ??= document.createElement("canvas").getContext("2d");
  if (!probe) return true;
  const sample = "mmmmmmmmmlli10OoIl";
  return ["monospace", "serif", "sans-serif"].some((generic) => {
    probe!.font = `72px ${generic}`;
    const fallback = probe!.measureText(sample).width;
    probe!.font = `72px "${family}", ${generic}`;
    return probe!.measureText(sample).width !== fallback;
  });
}

function merged(stored: Preferences | undefined): Preferences {
  return {
    theme: stored?.theme ?? defaultPreferences.theme,
    terminal: { ...defaultPreferences.terminal, ...stored?.terminal },
    editor: { ...defaultPreferences.editor, ...stored?.editor, syntaxTheme: syntaxThemeId(stored?.editor?.syntaxTheme ?? "") },
    composer: { ...defaultPreferences.composer, ...stored?.composer },
  };
}

export function getPreferences(): Preferences {
  return merged(useWorkbenchStore.getState().preferences);
}

/** The person's preferences, defaults filled in. */
export function usePreferences(): Preferences {
  const stored = useWorkbenchStore((state) => state.preferences);
  return merged(stored);
}

/** Replaces one section of the preferences (or the theme). */
export function updatePreferences(patch: Partial<Preferences>): void {
  useWorkbenchStore.setState((state) => ({ preferences: { ...merged(state.preferences), ...patch } }));
}

/**
 * Keeps the window in step with the preferences: the theme goes to the main process (so native controls follow too)
 * and the editor's font and syntax theme to the root, where the code theme reads them. A theme change crossfades the
 * whole window.
 */
export function applyPreferences(): () => void {
  let theme: ThemePreference | undefined;
  let editorKey = "";
  const apply = () => {
    const preferences = getPreferences();
    const key = `${preferences.editor.fontFamily}:${preferences.editor.fontSize}:${preferences.editor.syntaxTheme}`;
    if (key !== editorKey) {
      editorKey = key;
      const root = document.documentElement.style;
      root.setProperty("--wb-editor-font-family", monoFontStack(preferences.editor.fontFamily));
      root.setProperty("--wb-editor-font-size", `${preferences.editor.fontSize}px`);
      document.documentElement.dataset.syntaxTheme = preferences.editor.syntaxTheme;
    }
    // Main applied the saved theme before the window opened; until the state loads, the default would undo it.
    if (!useWorkbenchStore.getState().isHydrated || preferences.theme === theme) return;
    const first = theme === undefined;
    theme = preferences.theme;
    const change = () => window.workbench.app.setTheme(preferences.theme).catch(() => undefined);
    if (first || !document.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) { void change(); return; }
    // The new appearance arrives as a media-query change once main has switched; the transition waits for it. A window
    // that draws no frames (hidden) never starts the transition, so the theme then changes without it.
    let started = false;
    document.startViewTransition(async () => {
      started = true;
      const scheme = matchMedia("(prefers-color-scheme: dark)");
      const changed = new Promise<void>((resolve) => { scheme.addEventListener("change", () => resolve(), { once: true }); setTimeout(resolve, 250); });
      await change();
      await changed;
    });
    setTimeout(() => { if (!started) void change(); }, 200);
  };
  apply();
  return useWorkbenchStore.subscribe((state, previous) => { if (state.preferences !== previous.preferences || state.isHydrated !== previous.isHydrated) apply(); });
}
