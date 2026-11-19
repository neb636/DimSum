import { useEffect } from "react";
import { create } from "zustand";
import type { ExtensionContext } from "@dimsum/sdk";
import type { Workspace } from "../../../shared/models";
import { isFilesWorkspace } from "../../../shared/files-workspace";
import { repositoryOf } from "../../../shared/workspace-tree";
import { services } from "../../core/services";
import { reloadConfig } from "../../core/config-layers";
import { useWorkbenchStore } from "../../state/workbench-store";

/**
 * Worktrees: other checkouts of a workspace's repository, each a workspace of its own listed under the repository
 * (see `Workspace.parentId`). Creating and listing them goes through the source-control provider, so a folder can
 * have worktrees only where its source control has the idea.
 */

/** Whether each folder's source control can make worktrees; asked once per folder. */
const useSupport = create<Record<string, boolean>>(() => ({}));
const asked = new Set<string>();

function ask(path: string): void {
  if (!path || asked.has(path)) return;
  asked.add(path);
  void window.workbench.sourceControl.detect(path)
    .then((supported) => useSupport.setState({ [path]: supported }))
    .catch(() => useSupport.setState({ [path]: false }));
}

/** True once the folder is known to support worktrees; false while unknown. */
export function supportsWorktrees(workspace: Workspace | undefined): boolean {
  if (!workspace || isFilesWorkspace(workspace)) return false;
  ask(workspace.path);
  return Boolean(useSupport.getState()[workspace.path]);
}

export function useWorktreeSupport(workspace: Workspace | undefined): boolean {
  const path = workspace && !isFilesWorkspace(workspace) ? workspace.path : "";
  useEffect(() => ask(path), [path]);
  return useSupport((state) => Boolean(path && state[path]));
}

/** The repository the New worktree dialog is open for. */
export const useWorktreeDialog = create<{ repositoryId?: string }>(() => ({}));

/** The repository the Manage worktrees dialog is open for. */
export const useWorktreeManager = create<{ repositoryId?: string }>(() => ({}));

export type WorktreeOpening = "agent" | "terminal" | null;

function repositoryFor(workspaceId: string): Workspace {
  const { workspaces } = useWorkbenchStore.getState();
  const workspace = workspaces.find((item) => item.id === workspaceId);
  if (!workspace || isFilesWorkspace(workspace)) throw new Error("Choose a workspace folder for the worktree.");
  return repositoryOf(workspaces, workspace);
}

/** Shows the worktree workspace and wakes the tab it opened with. */
function show(workspaceId: string): void {
  const workspace = useWorkbenchStore.getState().workspaces.find((item) => item.id === workspaceId);
  if (workspace?.activeViewId) void services.commands.execute("view.activate", { workspaceId, viewId: workspace.activeViewId });
  else void services.commands.execute("workspace.select", workspaceId);
}

/**
 * Creates a worktree of `workspaceId`'s repository on a new `branch`, from `base` (a `BaseBranch.ref`; the
 * repository's default branch without one), and lists it under the repository. Returns the new workspace's id.
 */
export async function createWorktree({ workspaceId, branch, base, open = "agent", moveViewId }: {
  workspaceId: string;
  branch: string;
  base?: string;
  /** The tab it opens with; null for none. */
  open?: WorktreeOpening;
  /**
   * A tab to move into the worktree instead (a session starting there), its `cwd` set to the worktree. It moves in the
   * same update that lists the worktree, so it stays on screen throughout.
   */
  moveViewId?: string;
}): Promise<{ workspaceId: string; path: string }> {
  const repository = repositoryFor(workspaceId);
  const { sourceControl } = window.workbench;
  const from = base ?? (await sourceControl.baseBranches(repository.path)).defaultRef;
  const created = await sourceControl.createWorktree(repository.path, branch, from);
  const store = useWorkbenchStore.getState();
  const id = store.addWorkspace(created.path, { parentId: repository.id, name: created.branch, initialView: moveViewId ? null : open });
  if (moveViewId) store.transferView(moveViewId, id, { cwd: created.path });
  else show(id);
  return { workspaceId: id, path: created.path };
}

const samePath = (a: string, b: string) => a.replace(/[\\/]+$/, "") === b.replace(/[\\/]+$/, "");

/**
 * Lists one of the repository's existing checkouts (from `sourceControl.worktrees`) under it. One already open as a
 * workspace of its own becomes this worktree, keeping its tabs.
 */
export async function openWorktree(workspaceId: string, path: string, branch?: string): Promise<string> {
  const repository = repositoryFor(workspaceId);
  const standalone = useWorkbenchStore.getState().workspaces.find((item) => !isFilesWorkspace(item) && !item.parentId && item.id !== repository.id && samePath(item.path, path));
  const granted = await window.workbench.sourceControl.openWorktree(repository.path, path, Boolean(standalone));
  const store = useWorkbenchStore.getState();
  if (standalone) {
    store.adoptWorktree(standalone.id, repository.id);
    // Its personal layer is the repository's from now on; what was read before came from its own folder.
    reloadConfig(standalone.path);
  }
  const id = standalone?.id ?? store.addWorkspace(granted, { parentId: repository.id, ...(branch ? { name: branch } : {}), initialView: null });
  show(id);
  return id;
}

/** The workspace showing the checkout at `path` (a worktree of the repository, or a folder opened on its own), if any. */
export function workspaceAt(repositoryId: string, path: string): Workspace | undefined {
  return useWorkbenchStore.getState().workspaces.find((item) => !isFilesWorkspace(item) && item.id !== repositoryId
    && (item.parentId === repositoryId || !item.parentId) && samePath(item.path, path));
}

/**
 * Deletes one of the repository's worktrees from disk, keeping its branch. A worktree open in the sidebar is closed
 * first, stopping its sessions and terminals, so nothing is left running in a folder that is gone. The person has
 * already confirmed; `force` also loses uncommitted changes.
 */
export async function removeWorktree(repositoryId: string, path: string, force: boolean): Promise<void> {
  const repository = repositoryFor(repositoryId);
  const open = workspaceAt(repository.id, path);
  if (open) {
    for (const view of open.views) {
      if (!await services.commands.execute<boolean>("view.close", { workspaceId: open.id, viewId: view.id, confirmed: true })) {
        throw new Error(`A tab in ${open.name} was kept open.`);
      }
    }
    useWorkbenchStore.getState().removeWorkspace(open.id);
  }
  await window.workbench.sourceControl.removeWorktree(repository.path, path, force);
}

export function registerWorktrees(ctx: ExtensionContext): void {
  ctx.commands.register<{ workspaceId: string }>("worktree.new", ({ workspaceId }) => {
    useWorktreeManager.setState({ repositoryId: undefined });
    useWorktreeDialog.setState({ repositoryId: repositoryFor(workspaceId).id });
  });
  ctx.commands.register<{ workspaceId: string }>("worktree.manage", ({ workspaceId }) => {
    useWorktreeDialog.setState({ repositoryId: undefined });
    useWorktreeManager.setState({ repositoryId: repositoryFor(workspaceId).id });
  });
  ctx.commands.register<{ workspaceId: string; branch: string; base?: string; open?: WorktreeOpening }>("worktree.create",
    async (args) => (await createWorktree(args)).workspaceId);
}
