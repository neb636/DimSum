import { useContextMenu } from "../ui/ContextMenu";
import { viewActions, workspaceActions } from "../features/views/view-actions";
import { useState } from "react";
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

/** A repository's own checkout has a row of its own, beside its worktrees; this is that row's key. */
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

function Chevron({ isExpanded, hasChildItems, name }: { isExpanded: boolean; hasChildItems: boolean; name: string }) {
  return hasChildItems
    ? <AriaButton slot="chevron" className={`tree-chevron ${isExpanded ? "is-expanded" : ""}`} aria-label={isExpanded ? `Collapse ${name}` : `Expand ${name}`}><ChevronRightIcon size={11} /></AriaButton>
    : <span className="tree-chevron-spacer" />;
}

function SessionRows({ workspace, isCurrent, statuses, menu }: { workspace: Workspace; isCurrent: boolean; statuses: ViewStatuses; menu: ContextMenuController }) {
  return sidebarViews(workspace).map((view: WorkbenchView) => {
    const status = viewStatus(view, statuses);
    return <TreeItem key={view.id} id={view.id} textValue={view.title}
      className={`session-row ${isCurrent && workspace.activeViewId === view.id ? "is-current" : ""}`} {...menu.bind(() => viewActions(workspace, view))}>
      <TreeItemContent>
        <div className="session-row-content">
          <span className={`status-dot tone-${status?.tone ?? "idle"} ${status?.unseen ? "is-unseen" : ""}`} aria-hidden="true" />
          <span className="session-copy">
            <span className="session-title">{view.title}</span>
            <small>{[status?.label, status?.detail].filter(Boolean).join(" · ")}</small>
          </span>
          {menu.overflow(viewActions(workspace, view), view.title)}
        </div>
      </TreeItemContent>
    </TreeItem>;
  });
}

/** Local or one worktree: its own tabs, listed with its sessions under it. */
function CheckoutRow({ workspace, isLocal, isActive, statuses, menu }: { workspace: Workspace; isLocal: boolean; isActive: boolean; statuses: ViewStatuses; menu: ContextMenuController }) {
  const sessions = sidebarViews(workspace);
  const label = isLocal ? "Local" : workspace.name;
  return <TreeItem id={isLocal ? `${LOCAL}${workspace.id}` : workspace.id} textValue={label} hasChildItems={sessions.length > 0}
    className={`checkout-row ${isActive ? "is-active" : ""}`} {...menu.bind(() => workspaceActions(workspace))}>
    <TreeItemContent>
      {({ isExpanded, hasChildItems }) => <div className="checkout-row-content">
        <Chevron isExpanded={isExpanded} hasChildItems={hasChildItems} name={label} />
        <span className="checkout-icon">{isLocal ? <FolderIcon size={13} /> : <BranchIcon size={13} />}</span>
        <span className="workspace-copy">
          <strong title={isLocal ? workspace.path : `${workspace.name} · ${workspace.path}`}>{label}</strong>
          <small>{plural(sessions.length, "session")}<WorkspaceMeta workspace={workspace} /></small>
        </span>
        {workspace.views.length > 0 && <span className="count-badge" aria-label={plural(workspace.views.length, "open view")}>{workspace.views.length}</span>}
        {menu.overflow(workspaceActions(workspace), label)}
      </div>}
    </TreeItemContent>
    <SessionRows workspace={workspace} isCurrent={isActive} statuses={statuses} menu={menu} />
  </TreeItem>;
}

function WorkspaceRow({ workspace, worktrees, activeWorkspaceId, statuses, menu }: {
  workspace: Workspace;
  worktrees: Workspace[];
  activeWorkspaceId?: string;
  statuses: ViewStatuses;
  menu: ContextMenuController;
}) {
  const supported = useWorktreeSupport(workspace);
  // A repository lists its own checkout as Local beside its worktrees; any other folder lists its sessions directly.
  const grouped = !isFilesWorkspace(workspace) && (supported || worktrees.length > 0);
  const checkouts = [workspace, ...worktrees];
  const sessions = grouped ? checkouts.reduce((count, item) => count + sidebarViews(item).length, 0) : sidebarViews(workspace).length;
  const isActive = checkouts.some((item) => item.id === activeWorkspaceId);
  const opened = workspace.views.length + worktrees.reduce((count, item) => count + item.views.length, 0);
  return <TreeItem id={workspace.id} textValue={workspace.name} hasChildItems={grouped || sidebarViews(workspace).length > 0}
    className={`workspace-row ${isActive ? "is-active" : ""}`} {...menu.bind(() => workspaceActions(workspace))}>
    <TreeItemContent>
      {({ isExpanded, hasChildItems }) => <div className="workspace-row-content">
        <Chevron isExpanded={isExpanded} hasChildItems={hasChildItems} name={workspace.name} />
        <span className="workspace-icon">{workspace.icon ? <img src={workspace.icon} alt="" draggable={false} /> : isFilesWorkspace(workspace) ? <FileIcon size={15} /> : <FolderIcon size={15} />}</span>
        <span className="workspace-copy">
          <strong>{workspace.name}</strong>
          {isFilesWorkspace(workspace)
            ? <small>Opened on their own</small>
            : grouped
              ? <small>{[worktrees.length ? plural(worktrees.length, "worktree") : "", plural(sessions, "session")].filter(Boolean).join(" · ")}</small>
              : <small>{plural(sessions, "session")}<WorkspaceMeta workspace={workspace} /></small>}
        </span>
        {grouped
          ? <IconButton label="New worktree" className="workspace-add-worktree" onPress={() => void services.commands.execute("worktree.new", { workspaceId: workspace.id })}><PlusIcon size={13} /></IconButton>
          : <span className="count-badge">{opened}</span>}
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
    if (workspace) return workspaceActions(workspace);
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
