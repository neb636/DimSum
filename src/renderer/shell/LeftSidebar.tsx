import { useContextMenu } from "../ui/ContextMenu";
import { viewActions, workspaceActions } from "../features/views/view-actions";
import { useState, type ReactNode } from "react";
import { Button as AriaButton, Tree, TreeItem, TreeItemContent, type Key } from "react-aria-components";
import type { WorkbenchView, Workspace } from "../../shared/models";
import { services } from "../core/services";
import { useContributions } from "../core/registry";
import { useViewStatuses, viewStatus, type ViewStatus } from "../core/view-status";
import { useWorkbenchStore } from "../state/workbench-store";
import { IconButton } from "../ui/controls";
import { BranchIcon, ChevronRightIcon, FileIcon, FolderIcon, PlusIcon, SidebarLeftIcon } from "../ui/icons";
import { isFilesWorkspace } from "../../shared/files-workspace";
import { worktreesOf } from "../../shared/workspace-tree";
import { useWorktreeSupport } from "../features/worktrees/worktrees";

type ViewStatuses = Record<string, ViewStatus>;
type ContextMenuController = ReturnType<typeof useContextMenu>;

/** A repository with worktrees lists its own checkout as Local, beside them; this is that row's key. */
const LOCAL = "local:";

function sidebarViews(workspace: Workspace) {
  return workspace.views.filter((view) => services.views.of(view)?.listInSidebar);
}

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

function WorkspaceMeta({ workspace }: { workspace: Workspace }) {
  return <>{services.widgets.forSlot("sidebar.workspace.meta", workspace.id).map((widget) => {
    const Widget = widget.component;
    return <Widget key={widget.id} workspaceId={workspace.id} />;
  })}</>;
}

/**
 * A row's icon, which becomes its expand/collapse chevron while the row is hovered or focused, so the tree spends no
 * width on a separate chevron column.
 */
function TreeToggle({ isExpanded, hasChildItems, name, className, children }: { isExpanded: boolean; hasChildItems: boolean; name: string; className: string; children: ReactNode }) {
  return <span className={`tree-toggle ${className} ${hasChildItems ? "has-chevron" : ""}`}>
    <span className="tree-toggle-icon">{children}</span>
    {hasChildItems && <AriaButton slot="chevron" className={`tree-toggle-chevron ${isExpanded ? "is-expanded" : ""}`} aria-label={isExpanded ? `Collapse ${name}` : `Expand ${name}`}><ChevronRightIcon size={12} /></AriaButton>}
  </span>;
}

/**
 * What a collapsed row hides: how many sessions, marked when one of them has news the person hasn't seen. An expanded
 * row shows its sessions, so it says nothing.
 */
function Hidden({ sessions, statuses }: { sessions: WorkbenchView[]; statuses: ViewStatuses }) {
  if (!sessions.length) return null;
  const unseen = sessions.some((view) => viewStatus(view, statuses)?.unseen);
  return <span className={`tree-hidden ${unseen ? "is-unseen" : ""}`} aria-label={`${plural(sessions.length, "session")}${unseen ? ", with updates" : ""}`}>
    {unseen && <span className="status-dot is-unseen" aria-hidden="true" />}{sessions.length}
  </span>;
}

/** One line per session: its status dot, title and status; the status's detail is in the tooltip. */
function SessionRows({ workspace, isCurrent, statuses, menu }: { workspace: Workspace; isCurrent: boolean; statuses: ViewStatuses; menu: ContextMenuController }) {
  return sidebarViews(workspace).map((view: WorkbenchView) => {
    const status = viewStatus(view, statuses);
    const summary = [status?.label, status?.detail].filter(Boolean).join(" · ");
    return <TreeItem key={view.id} id={view.id} textValue={view.title}
      className={`session-row ${isCurrent && workspace.activeViewId === view.id ? "is-current" : ""}`} {...menu.bind(() => viewActions(workspace, view))}>
      <TreeItemContent>
        <div className="session-row-content" title={summary ? `${view.title}\n${summary}` : view.title}>
          <span className="tree-icon"><span className={`status-dot tone-${status?.tone ?? "idle"} ${status?.unseen ? "is-unseen" : ""}`} aria-hidden="true" /></span>
          <span className="session-title">{view.title}</span>
          {status?.label && <small className="session-status">{status.label}</small>}
          {menu.overflow(viewActions(workspace, view), view.title)}
        </div>
      </TreeItemContent>
    </TreeItem>;
  });
}

/** Local or one worktree, with its sessions under it. */
function CheckoutRow({ workspace, isLocal, isActive, statuses, menu }: { workspace: Workspace; isLocal: boolean; isActive: boolean; statuses: ViewStatuses; menu: ContextMenuController }) {
  const sessions = sidebarViews(workspace);
  const label = isLocal ? "Local" : workspace.name;
  return <TreeItem id={isLocal ? `${LOCAL}${workspace.id}` : workspace.id} textValue={label} hasChildItems={sessions.length > 0}
    className={`checkout-row ${isActive ? "is-active" : ""}`} {...menu.bind(() => workspaceActions(workspace, isLocal))}>
    <TreeItemContent>
      {({ isExpanded, hasChildItems }) => <div className="checkout-row-content" title={workspace.path}>
        <TreeToggle isExpanded={isExpanded} hasChildItems={hasChildItems} name={label} className="tree-icon">{isLocal ? <FolderIcon size={13} /> : <BranchIcon size={13} />}</TreeToggle>
        <span className="tree-label">
          <strong>{label}</strong>
          {/* Local's branch; a worktree is named after its own. */}
          {isLocal && <small><WorkspaceMeta workspace={workspace} /></small>}
        </span>
        {!isExpanded && <Hidden sessions={sessions} statuses={statuses} />}
        {menu.overflow(workspaceActions(workspace, isLocal), label)}
      </div>}
    </TreeItemContent>
    <SessionRows workspace={workspace} isCurrent={isActive} statuses={statuses} menu={menu} />
  </TreeItem>;
}

/**
 * A workspace folder. Once a repository has worktrees in the sidebar, it lists Local (its own folder) beside them, each
 * with its sessions; until then, like any other folder, it lists its sessions directly.
 */
function WorkspaceRow({ workspace, worktrees, activeWorkspaceId, statuses, menu }: {
  workspace: Workspace;
  worktrees: Workspace[];
  activeWorkspaceId?: string;
  statuses: ViewStatuses;
  menu: ContextMenuController;
}) {
  const files = isFilesWorkspace(workspace);
  const canBranch = useWorktreeSupport(workspace) && !files;
  const grouped = !files && worktrees.length > 0;
  const checkouts = [workspace, ...worktrees];
  const sessions = checkouts.flatMap(sidebarViews);
  const isActive = checkouts.some((item) => item.id === activeWorkspaceId);
  return <TreeItem id={workspace.id} textValue={workspace.name} hasChildItems={grouped || sessions.length > 0}
    className={`workspace-row ${isActive ? "is-active" : ""}`} {...menu.bind(() => workspaceActions(workspace))}>
    <TreeItemContent>
      {({ isExpanded, hasChildItems }) => <div className="workspace-row-content" title={files ? "Files opened on their own" : workspace.path}>
        <TreeToggle isExpanded={isExpanded} hasChildItems={hasChildItems} name={workspace.name} className="workspace-icon">{workspace.icon ? <img src={workspace.icon} alt="" draggable={false} /> : files ? <FileIcon size={14} /> : <FolderIcon size={14} />}</TreeToggle>
        <span className="tree-label">
          <strong>{workspace.name}</strong>
          {/* Grouped, the branch is on Local's row. */}
          {!files && !grouped && <small><WorkspaceMeta workspace={workspace} /></small>}
        </span>
        {!isExpanded && <Hidden sessions={sessions} statuses={statuses} />}
        {canBranch && <IconButton label="New worktree" className="row-action is-pinned" onPress={() => void services.commands.execute("worktree.new", { workspaceId: workspace.id })}><PlusIcon size={13} /></IconButton>}
        {menu.overflow(workspaceActions(workspace), workspace.name)}
      </div>}
    </TreeItemContent>
    {grouped
      ? checkouts.map((item) => <CheckoutRow key={item.id} workspace={item} isLocal={item === workspace} isActive={item.id === activeWorkspaceId} statuses={statuses} menu={menu} />)
      : <SessionRows workspace={workspace} isCurrent={isActive} statuses={statuses} menu={menu} />}
  </TreeItem>;
}

export function LeftSidebar({ onCollapse }: { onCollapse: () => void }) {
  useContributions();
  const menu = useContextMenu("Workspace and view actions");
  const stored = useWorkbenchStore((state) => state.workspaces);
  // Worktrees are listed under their repository; files opened on their own sit below every folder workspace.
  const folderWorkspaces = stored.filter((item) => !isFilesWorkspace(item) && !item.parentId);
  const workspaces = [...folderWorkspaces, ...stored.filter(isFilesWorkspace)];
  const folders = folderWorkspaces.length;
  const activeWorkspaceId = useWorkbenchStore((state) => state.activeWorkspaceId ?? state.workspaces[0]?.id);
  const statuses = useViewStatuses();
  const [collapsed, setCollapsed] = useState<Set<Key>>(new Set());
  // Every row that can hold others: workspaces, and each repository's Local and worktree rows.
  const parents = [...workspaces.map((item) => item.id), ...folderWorkspaces.map((item) => `${LOCAL}${item.id}`), ...stored.filter((item) => item.parentId).map((item) => item.id)];
  const expanded = new Set<Key>(parents.filter((id) => !collapsed.has(id)));
  const workspaceOf = (key: Key | null | undefined) => {
    const id = String(key ?? "");
    return stored.find((item) => item.id === (id.startsWith(LOCAL) ? id.slice(LOCAL.length) : id));
  };
  const select = (key: Key) => {
    const id = String(key);
    const workspace = workspaceOf(key);
    if (workspace && !id.startsWith(LOCAL) && !workspace.parentId) {
      // A repository's row keeps whichever of its checkouts is already showing.
      const active = stored.find((item) => item.id === activeWorkspaceId);
      void services.commands.execute("workspace.select", active?.parentId === workspace.id ? active.id : workspace.id);
      return;
    }
    if (workspace) {
      if (workspace.activeViewId) void services.commands.execute("view.activate", { workspaceId: workspace.id, viewId: workspace.activeViewId });
      else void services.commands.execute("workspace.select", workspace.id);
      return;
    }
    const owner = stored.find((item) => item.views.some((view) => view.id === id));
    if (owner) void services.commands.execute("view.activate", { workspaceId: owner.id, viewId: id });
  };

  return <aside className="sidebar-card left-sidebar" aria-label="Workspaces sidebar" onKeyDown={menu.bind((target) => {
    const key = target.closest("[role=row]")?.getAttribute("data-key");
    const workspace = workspaceOf(key);
    if (workspace) return workspaceActions(workspace, Boolean(key?.startsWith(LOCAL)));
    const owner = stored.find((w) => w.views.some((v) => v.id === key));
    const view = owner?.views.find((v) => v.id === key);
    return owner && view ? viewActions(owner, view) : [];
  }).onKeyDown}>
    {menu.overlay}
    <div className="sidebar-titlebar">
      <IconButton label="Hide sidebar" onPress={onCollapse}><SidebarLeftIcon size={16} /></IconButton>
    </div>
    <div className="sidebar-section-header">
      <span>Workspaces <span className="count-muted">{folders}</span></span>
      <IconButton label="Add workspace" onPress={() => void services.commands.execute("workspace.add")}><PlusIcon size={15} /></IconButton>
    </div>
    <Tree aria-label="Workspaces" className="workspace-tree" expandedKeys={expanded}
      onExpandedChange={(keys) => setCollapsed(new Set(parents.filter((id) => !keys.has(id))))}
      onAction={select}>
      {workspaces.map((workspace) => <WorkspaceRow key={workspace.id} workspace={workspace} worktrees={worktreesOf(stored, workspace.id)}
        activeWorkspaceId={activeWorkspaceId} statuses={statuses} menu={menu} />)}
    </Tree>
    {folders === 0 && <p className="sidebar-empty">Local folders you add will appear here.</p>}
    <nav className="sidebar-footer" aria-label="App">
      {services.widgets.forSlot("sidebar.footer", activeWorkspaceId).map((widget) => {
        const Widget = widget.component;
        return <Widget key={widget.id} workspaceId={activeWorkspaceId} />;
      })}
    </nav>
  </aside>;
}
