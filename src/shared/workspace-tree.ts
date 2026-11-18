import type { Workspace } from "./models";

/**
 * A workspace may have worktrees: other checkouts of the same repository, each a workspace of its own (with its own
 * folder and tabs) whose `parentId` names the repository's workspace. Worktrees DimSum creates live beside the
 * repository, in `<repository>-worktrees/<name>`.
 */
export const WORKTREE_SUFFIX = "-worktrees";

/** The repository a workspace belongs to: its parent, or itself. */
export function repositoryOf<T extends Pick<Workspace, "id" | "parentId">>(workspaces: readonly T[], workspace: T): T;
export function repositoryOf<T extends Pick<Workspace, "id" | "parentId">>(workspaces: readonly T[], workspace: T | undefined): T | undefined;
export function repositoryOf<T extends Pick<Workspace, "id" | "parentId">>(workspaces: readonly T[], workspace: T | undefined): T | undefined {
  if (!workspace?.parentId) return workspace;
  return workspaces.find((item) => item.id === workspace.parentId) ?? workspace;
}

/** The id under which settings shared by a repository and its worktrees (personas, stored instructions) are kept. */
export function repositoryIdOf(workspaces: readonly Pick<Workspace, "id" | "parentId">[], workspaceId: string): string;
export function repositoryIdOf(workspaces: readonly Pick<Workspace, "id" | "parentId">[], workspaceId: string | undefined): string | undefined;
export function repositoryIdOf(workspaces: readonly Pick<Workspace, "id" | "parentId">[], workspaceId: string | undefined): string | undefined {
  if (!workspaceId) return workspaceId;
  const workspace = workspaces.find((item) => item.id === workspaceId);
  return workspace ? repositoryOf(workspaces, workspace).id : workspaceId;
}

/** A repository's worktrees, in the order they were opened. */
export function worktreesOf<T extends Pick<Workspace, "parentId">>(workspaces: readonly T[], repositoryId: string): T[] {
  return workspaces.filter((item) => item.parentId === repositoryId);
}

function trimSeparators(path: string): string {
  return path.replace(/[\\/]+$/, "");
}

/** `<repository>-worktrees/<name>` → `name` when `path` is exactly such a folder. */
export function worktreeNameIn(repositoryPath: string, path: string): string | undefined {
  const base = `${trimSeparators(repositoryPath)}${WORKTREE_SUFFIX}`;
  const target = trimSeparators(path);
  if (!target.startsWith(base) || !/[\\/]/.test(target.charAt(base.length))) return undefined;
  const name = target.slice(base.length + 1);
  return name && !/[\\/]/.test(name) ? name : undefined;
}

/** The folder a new worktree for `branch` gets. The main process decides; this mirrors it for display. */
export function worktreeFolderPreview(repositoryPath: string, branch: string): string {
  return `${trimSeparators(repositoryPath)}${WORKTREE_SUFFIX}/${branch.replace(/[^A-Za-z0-9._-]+/g, "-")}`;
}

/** A fresh branch name; two made in the same minute must not collide. */
export function suggestedBranch(): string {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  return `wb/session-${stamp}-${Math.random().toString(36).slice(2, 6)}`;
}
