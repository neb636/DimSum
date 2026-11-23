import type { Workspace } from "../../../shared/models";
import { services } from "../../core/services";
import type { DestructiveConfirmation } from "../../ui/confirm";
import { BranchIcon, FolderIcon } from "../../ui/icons";

/** "2 agent sessions · 1 terminal", in view registration order. */
function viewSummary(workspaces: Workspace[]): string {
  const views = workspaces.flatMap((workspace) => workspace.views);
  const parts = services.views.list(workspaces[0]?.id).flatMap((definition) => {
    const count = views.filter((view) => view.type === definition.id).length;
    const label = definition.label.toLowerCase();
    return count ? [`${count} ${count === 1 ? label : `${label}s`}`] : [];
  });
  return parts.length ? parts.join(" · ") : "Nothing open";
}

/** `worktrees`: the workspace's own worktrees, which go with it. */
export function workspaceRemoveConfirmation(workspace: Workspace, worktrees: Workspace[] = []): DestructiveConfirmation {
  const open = workspace.views.length + worktrees.reduce((count, item) => count + item.views.length, 0);
  const stopping = open
    ? <>{open === 1 ? "its open view" : `its ${open} open views`}, <strong>stopping any running sessions and terminals</strong></>
    : undefined;
  if (workspace.parentId) {
    const kept = workspace.unused
      ? <>Nothing has been done in it yet, so if it still has no changes, commits or agent conversations, its <strong>folder and branch are deleted</strong>. Otherwise they stay on disk.</>
      : <>Its folder and branch stay on disk: reopen it with <strong>New worktree ▸ Existing worktrees</strong>.</>;
    return {
      title: "Close worktree",
      message: "Are you sure you want to close the following worktree?",
      warning: <><strong>Warning:</strong> {stopping ? <>Closing the worktree closes {stopping}, and forgets its layout.</> : <>The worktree is <strong>removed from the sidebar</strong>.</>} {kept}</>,
      subject: { icon: <BranchIcon size={20} />, name: workspace.name, detail: viewSummary([workspace]), meta: workspace.path },
      confirmLabel: "Yes, Close Worktree",
      // Nothing worth keeping on disk goes, so this is a caution, not a deletion.
      tone: "caution",
    };
  }
  const alsoWorktrees = worktrees.length ? <> and {worktrees.length === 1 ? "its worktree" : `its ${worktrees.length} worktrees`}</> : null;
  return {
    title: "Remove workspace",
    message: "Are you sure you want to remove the following workspace?",
    warning: <><strong>Warning:</strong> This action <strong>cannot be undone</strong>. {stopping
      ? <>Removing the workspace{alsoWorktrees} closes {stopping}, and forgets its layout.</>
      : <>The workspace{alsoWorktrees} and its layout are <strong>removed from the workbench</strong>.</>} {worktrees.length
      ? worktrees.some((item) => item.unused) ? "Worktrees nothing was done in are deleted with their branches; no other folder on disk is." : "No folder on disk is deleted."
      : "The folder on disk is not deleted."}</>,
    subject: {
      icon: workspace.icon ? <img src={workspace.icon} alt="" draggable={false} /> : <FolderIcon size={20} />,
      name: workspace.name,
      detail: [worktrees.length ? `${worktrees.length} ${worktrees.length === 1 ? "worktree" : "worktrees"}` : "", viewSummary([workspace, ...worktrees])].filter(Boolean).join(" · "),
      meta: workspace.path,
    },
    confirmLabel: "Yes, Remove Workspace",
  };
}
