import { Radio, RadioGroup } from "react-aria-components";
import type { ThemePreference } from "../../../shared/models";
import { monoFontStack, syntaxThemes, updatePreferences, usePreferences } from "../../state/preferences";
import { CheckIcon, FileIcon, PaletteIcon, TerminalIcon } from "../../ui/icons";
import { FontSelect, FontSizeField, SettingsCard, SettingsRow } from "./settings-ui";

const themes: { id: ThemePreference; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "System" },
];

/** A miniature of the window: sidebar card, tab strip and a few bento cards. */
function WindowSketch({ tone }: { tone: "light" | "dark" }) {
  return <div className={`theme-sketch is-${tone}`} aria-hidden="true">
    <span className="theme-sketch-lights"><i /><i /><i /></span>
    <span className="theme-sketch-sidebar"><i /><i /><i /></span>
    <span className="theme-sketch-main">
      <span className="theme-sketch-tabs"><i /><i /></span>
      <span className="theme-sketch-grid"><i /><i /><i /><i /></span>
      <span className="theme-sketch-composer" />
    </span>
  </div>;
}

function ThemePreview({ theme }: { theme: ThemePreference }) {
  if (theme !== "system") return <div className="theme-preview"><WindowSketch tone={theme} /></div>;
  return <div className="theme-preview is-split"><WindowSketch tone="light" /><WindowSketch tone="dark" /></div>;
}

/** A few lines of code in the editor's font, coloured by the syntax theme. */
function CodeSample({ fontFamily, fontSize }: { fontFamily: string; fontSize: number }) {
  return <pre className="code-sample" style={{ fontFamily: monoFontStack(fontFamily), fontSize }} aria-hidden="true">
    <span className="syntax-comment">{"// Greets each guest by name"}</span>{"\n"}
    <span className="syntax-keyword">export function</span> <span className="syntax-function">greet</span>(guests: <span className="syntax-type">string</span>[]) {"{"}{"\n"}
    {"  "}<span className="syntax-keyword">return</span> guests.<span className="syntax-property">map</span>((name) =&gt; <span className="syntax-string">`Hello, ${"{"}name{"}"}`</span>).<span className="syntax-property">slice</span>(<span className="syntax-number">0</span>, <span className="syntax-number">12</span>);{"\n"}
    {"}"}
  </pre>;
}

export function AppearanceSettings() {
  const preferences = usePreferences();
  const { terminal, editor } = preferences;
  return <div className="settings-stack">
    <SettingsCard title="Theme" description="Light, dark, or whichever macOS is using. Terminals and the file editor stay dark." icon={<PaletteIcon size={16} />}>
      <RadioGroup aria-label="Theme" className="theme-options" orientation="horizontal" value={preferences.theme}
        onChange={(theme) => updatePreferences({ theme: theme as ThemePreference })}>
        {themes.map((theme) => <Radio key={theme.id} value={theme.id} className="theme-option">
          <ThemePreview theme={theme.id} />
          <span className="theme-option-label"><span className="radio-mark" aria-hidden="true"><CheckIcon size={10} /></span>{theme.label}</span>
        </Radio>)}
      </RadioGroup>
    </SettingsCard>

    <SettingsCard title="Terminal" description="Terminals and agent sessions." icon={<TerminalIcon size={16} />}>
      <SettingsRow label="Font"><FontSelect label="Terminal font" value={terminal.fontFamily} onChange={(fontFamily) => updatePreferences({ terminal: { ...terminal, fontFamily } })} /></SettingsRow>
      <SettingsRow label="Size"><FontSizeField label="Terminal font size" value={terminal.fontSize} onChange={(fontSize) => updatePreferences({ terminal: { ...terminal, fontSize } })} /></SettingsRow>
      <pre className="terminal-sample" style={{ fontFamily: monoFontStack(terminal.fontFamily), fontSize: terminal.fontSize }} aria-hidden="true">
        <span className="terminal-sample-prompt">~/acme-api</span> <span className="terminal-sample-branch">main</span> $ npm test{"\n"}
        <span className="terminal-sample-pass">✓</span> 42 passing <span className="terminal-sample-muted">(1.3s)</span>
      </pre>
    </SettingsCard>

    <SettingsCard title="File editor" description="Files opened in a tab, and commit diffs." icon={<FileIcon size={16} />}>
      <SettingsRow label="Font"><FontSelect label="Editor font" value={editor.fontFamily} onChange={(fontFamily) => updatePreferences({ editor: { ...editor, fontFamily } })} /></SettingsRow>
      <SettingsRow label="Size"><FontSizeField label="Editor font size" value={editor.fontSize} onChange={(fontSize) => updatePreferences({ editor: { ...editor, fontSize } })} /></SettingsRow>
      <SettingsRow label="Syntax theme" help="More themes are on the way." />
      <RadioGroup aria-label="Syntax theme" className="syntax-options" value={editor.syntaxTheme} onChange={(syntaxTheme) => updatePreferences({ editor: { ...editor, syntaxTheme } })}>
        {syntaxThemes.map((theme) => <Radio key={theme.id} value={theme.id} className="syntax-option">
          <CodeSample fontFamily={editor.fontFamily} fontSize={editor.fontSize} />
          <span className="theme-option-label"><span className="radio-mark" aria-hidden="true"><CheckIcon size={10} /></span>{theme.label}<small>{theme.description}</small></span>
        </Radio>)}
      </RadioGroup>
    </SettingsCard>
  </div>;
}
