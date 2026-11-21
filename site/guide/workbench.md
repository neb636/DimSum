# The workbench

The DimSum window has four parts: the workspaces on the left, the open views in the middle, panels on the right, and a status bar along the bottom.

## Workspaces

The left sidebar lists your workspaces. Each one is a folder, and its agent sessions are listed under it, one line each, with a status dot and their status on the right; hover a session for the full detail. A collapsed row shows how many sessions it holds, with a dot when one of them has news you haven't seen.

Right-click a workspace to create a new view in it, reveal its folder, open it in a terminal, copy its path, give it a custom icon, or remove it. Removing a workspace takes it out of DimSum, with its worktrees, and leaves every folder alone.

### Local and worktrees

A workspace that is a Git repository lists its sessions directly until you open a worktree. From then on it lists its checkouts, each with its sessions under it:

- **Local** is the workspace folder itself, with its branch beside it.
- Each **worktree** is another checkout of the repository on its own branch, in its own folder next to the workspace (`<workspace>-worktrees/`).

Each checkout has its own tabs, so selecting Local or a worktree shows only what is open there. Terminals, the Files panel, Source control and new agent sessions all work in the checkout you are looking at, so you can open a terminal in a worktree to run a command without touching your local checkout.

To make a worktree, hover the workspace's row and select its **+** (or **New Worktree…** in its menu). Name the branch, pick the branch to create it from, and choose what it opens with: an agent session, a terminal or nothing. The same dialog lists the repository's other worktrees that aren't in the sidebar, including ones made outside DimSum, so you can open them. They're listed newest first. Each is named after the title Claude Code or Codex gave the latest agent conversation in it, with its branch beneath, so you can tell what each was for even when its branch name was generated. When you reopen one, the sidebar uses that name too. DimSum reads these titles from the CLIs' own files on your computer; this sends nothing and costs nothing.

Right-click a worktree and choose **Close Worktree** to take it out of the sidebar. Its open views close, but its folder and branch stay on disk, and you can reopen it from the same dialog. When you close the last tab in a worktree, the confirmation offers **Also close the worktree** too, so you aren't left with an empty row; DimSum remembers your choice until you quit. Worktrees share the workspace's personas, your personal instructions and settings, and which instructions you turned off. Instructions shared in the repository come from the worktree's own branch.

#### Cleaning up worktrees

Worktrees add up, especially when every agent session gets one. Right-click a workspace and choose **Manage Worktrees…** (or select **Manage worktrees…** in the New worktree dialog) to see every worktree of the repository, named the same way, with which ones are open in the sidebar, have uncommitted changes, or are locked. Sort them by **Newest** (the default), **Oldest** or **Idle longest**. The time on each row shows when it was created, or, when sorted by Idle longest, when it was last used.

- **Clean up idle worktrees** deletes, in one go, every worktree with no commits or file changes in the last week, 2 weeks or month. It leaves alone any that have uncommitted changes or are open in the sidebar; hover the button to see which ones it will delete.
- Select worktrees with their checkboxes and choose **Delete** to delete several at once, or use the trash button on a row to delete one.

Deleting a worktree removes its folder from disk, after you confirm, and cannot be undone; its branch is kept. A worktree with uncommitted changes can still be deleted, and the confirmation says those changes will be lost. One open in the sidebar is closed first, stopping its sessions and terminals. Locked worktrees can't be deleted here.

If you move or rename the repository's folder, its existing worktrees lose track of it. DimSum notices this when it lists them and reconnects them to the repository where it is now (`git worktree repair`), so they still show up and can be opened and deleted.

Files you open on their own, from Finder or with <kbd>⌘</kbd><kbd>O</kbd>, are collected under a separate entry that only holds files. The **Settings** button is at the bottom of the sidebar.

## Views and tabs

A view is something open in a tab. DimSum comes with these view types:

| View | What it is |
| --- | --- |
| Agent session | An agent CLI in a terminal, with the composer below it. |
| Terminal | A plain shell in the workspace folder. |
| File | A file open in the editor. Open one from the Files panel. |
| Commit file | A read-only view of how one commit changed a file. Open one from source-control history. |

Extensions can add more view types. Drag tabs to reorder them. When there are more tabs than fit, the rest go into a **+N more** menu. Right-click a tab to close it, the others, the tabs to its right, or all of them. File tabs also offer **Keep open**, copying the path and revealing the file.

## Panels

The right sidebar has an activity bar that switches between panels:

- **Active views**: everything open, across workspaces.
- **Files**: the workspace's files, search and file operations. See [Files and the editor](/guide/files).
- **Source control**: changes, commits, branches and history, with a badge showing how many files changed. See [Source control](/guide/source-control).
- **Extensions**: built-in, personal and workspace extensions. See [Extensions](/extend/).

## Status bar

The left side summarizes the active session. The right side shows the current branch, the [AI usage meter](/guide/ai-usage-resources) and the Resource Manager.

## What DimSum remembers

When you close and reopen the app, it brings back your workspaces, open views, drafts, panel sizes and which panels were open. Agent CLIs and terminals don't keep running after you quit, because closing the app stops the processes it started. The session you were looking at reopens its conversation. Other sessions wait until you click into them, choose **Resume previous…**, or send a prompt.
