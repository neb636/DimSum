import { chmodSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const ATTEMPTS = 3;

/** Claude Code's own state file, which holds per-folder trust: $CLAUDE_CONFIG_DIR/.claude.json, else ~/.claude.json. */
function claudeStateFile(): string {
  const custom = process.env.CLAUDE_CONFIG_DIR;
  return custom ? path.join(custom, ".claude.json") : path.join(homedir(), ".claude.json");
}

/**
 * Records that the person trusts `folder`, as Claude Code does when they answer its folder-trust prompt. Only that
 * one key changes. A missing or unreadable file is left alone, so Claude asks as it would have.
 *
 * Claude replaces this file without a lock, so a running Claude may write it while this runs. Right before the
 * rename the file is read again; if it changed, the edit starts over from the new contents, and after a few tries it
 * gives up rather than replace someone else's write. What's left is the instant between that check and the rename,
 * the same race Claude's own sessions have with each other.
 */
export function acceptClaudeFolderTrust(folder: string): void {
  const file = claudeStateFile();
  try {
    const key = realpathSync(folder);
    for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
      const original = readFileSync(file, "utf8");
      const state = JSON.parse(original) as { projects?: Record<string, Record<string, unknown>> };
      if (!state || typeof state !== "object" || Array.isArray(state)) return;
      const projects = state.projects && typeof state.projects === "object" ? state.projects : (state.projects = {});
      const project = projects[key] && typeof projects[key] === "object" ? projects[key] : (projects[key] = {});
      if (project.hasTrustDialogAccepted === true) return;
      project.hasTrustDialogAccepted = true;
      const temporary = `${file}.dimsum-${process.pid}-${Date.now()}-${attempt}.tmp`;
      try {
        writeFileSync(temporary, JSON.stringify(state, null, 2), { mode: 0o600 });
        chmodSync(temporary, statSync(file).mode & 0o777);
        if (readFileSync(file, "utf8") !== original) { unlinkSync(temporary); continue; }
        renameSync(temporary, file);
        return;
      } catch (error) {
        try { unlinkSync(temporary); } catch { /* already gone */ }
        throw error;
      }
    }
  } catch { /* Claude asks in the terminal instead. */ }
}
