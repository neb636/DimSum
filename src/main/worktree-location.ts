import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { APP_HOME_DIR, WORKTREES_DIR } from "../shared/app-identity";
import { WORKTREE_SUFFIX } from "../shared/workspace-tree";

/** `~/dimsum/worktrees`: where new worktrees are created. `DIMSUM_WORKTREES` moves it (QA, profiles). */
export function worktreesHome(): string {
  return process.env.DIMSUM_WORKTREES ? path.resolve(process.env.DIMSUM_WORKTREES) : path.join(os.homedir(), APP_HOME_DIR, WORKTREES_DIR);
}

/**
 * Where a repository's new worktrees go: `~/dimsum/worktrees/<name>-<id>`. The id is a short hash of the repository's real
 * path, so two repositories with the same name get different folders, and the folder is known from the path alone.
 */
export function worktreeContainer(canonicalRepository: string): string {
  const name = path.basename(canonicalRepository).replace(/[^A-Za-z0-9._-]+/g, "-") || "repository";
  return path.join(worktreesHome(), `${name}-${createHash("sha256").update(canonicalRepository).digest("hex").slice(0, 8)}`);
}

/** Where worktrees were created before they moved to `~/dimsum/worktrees`: beside the repository, in `<repository>-worktrees/`. */
export function legacyWorktreeContainer(repository: string): string {
  return `${path.resolve(repository)}${WORKTREE_SUFFIX}`;
}

/** The real path, or the resolved one when it doesn't exist (yet). */
export function realOrResolved(folder: string): string {
  try { return realpathSync(folder); } catch { return path.resolve(folder); }
}
