import type { PersistedState } from "../shared/models";
import type { PromptOptionDefinition } from "../shared/prompt-options";
import type { DimsumSettings } from "../shared/dimsum";
import { readLayers, writeLayer } from "./config-layers";

/** The workspaces that are worktrees in `state` but weren't in the state as it was saved (`saved`). */
export function newlyAdopted(saved: unknown, state: PersistedState): PersistedState["workspaces"] {
  const before = new Map(((saved as { workspaces?: unknown } | null)?.workspaces as { id?: unknown; parentId?: unknown }[] | undefined ?? [])
    .map((item) => [item?.id, item?.parentId]));
  return state.workspaces.filter((item) => item.parentId !== undefined && before.get(item.id) !== item.parentId);
}

/**
 * A workspace that becomes a worktree reads its repository's personal (`.local`) files from then on. What it kept in
 * its own is added to the repository's once, when it is adopted: instructions by id (the repository's own win) and
 * turned-off extensions. Its files are left where they are. Best effort: a file that can't be read or written is skipped.
 */
export async function mergeAdoptedPersonalFiles(state: PersistedState, adopted: PersistedState["workspaces"]): Promise<void> {
  for (const worktree of adopted) {
    const repository = state.workspaces.find((item) => item.id === worktree.parentId);
    if (!repository?.path || !worktree.path) continue;
    try {
      const own = (await readLayers("instructions", worktree.path)).local;
      const theirs = (await readLayers("instructions", repository.path)).local;
      const adding = own?.status === "ok" ? (own.value as { instructions: PromptOptionDefinition[] }).instructions : [];
      if (adding.length && theirs?.status !== "invalid") {
        const existing = theirs?.status === "ok" ? (theirs.value as { instructions: PromptOptionDefinition[] }).instructions : [];
        const ids = new Set(existing.map((option) => option.id));
        const added = adding.filter((option) => !ids.has(option.id));
        if (added.length) await writeLayer("instructions", "local", repository.path, { version: 1, instructions: [...existing, ...added] }, theirs?.hash ?? null);
      }
      const ownSettings = (await readLayers("settings", worktree.path)).local;
      const theirSettings = (await readLayers("settings", repository.path)).local;
      const off = ownSettings?.status === "ok" ? (ownSettings.value as DimsumSettings).extensions?.disabled ?? [] : [];
      if (off.length && theirSettings?.status !== "invalid") {
        const current = theirSettings?.status === "ok" ? theirSettings.value as DimsumSettings : { version: 1 as const };
        const disabled = [...new Set([...(current.extensions?.disabled ?? []), ...off])];
        if (disabled.length !== (current.extensions?.disabled ?? []).length) {
          await writeLayer("settings", "local", repository.path, { ...current, extensions: { ...current.extensions, disabled } }, theirSettings?.hash ?? null);
        }
      }
    } catch (error) {
      console.warn("Could not carry a worktree's personal settings over to its repository.", String(error));
    }
  }
}
