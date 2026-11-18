# The workbench

The DimSum window has four parts: the workspaces on the left, the open views in the middle, panels on the right, and a status bar along the bottom.

## Workspaces

The left sidebar lists your workspaces. Each one is a folder, and its agent sessions are listed under it with their status, harness and branch.

Right-click a workspace to create a new view in it, reveal its folder, open it in a terminal, copy its path, give it a custom icon, or remove it. Removing a workspace takes it out of DimSum, with its worktrees, and leaves every folder alone.

### Local and worktrees

A workspace that is a Git repository lists its checkouts under it:

- **Local** is the workspace folder itself.
- Each **worktree** is another checkout of the repository on its own branch, in its own folder next to the workspace (`<workspace>-worktrees/`).

Each checkout has its own tabs, so selecting Local or a worktree shows only what is open there. Terminals, the Files panel, Source control and new agent sessions all work in the checkout you are looking at, so you can open a terminal in a worktree to run a command without touching your local checkout.

To make a worktree, select the **+** on the workspace's row (or **New Worktree…** in its menu). Name the branch, pick the branch to create it from, and choose what it opens with: an agent session, a terminal or nothing. The same dialog lists the repository's other worktrees that aren't in the sidebar, including ones made outside DimSum, so you can open them.

Right-click a worktree and choose **Close Worktree** to take it out of the sidebar. Its open views close, but its folder and branch stay on disk, and you can reopen it from the same dialog. Worktrees share the workspace's personas, your personal instructions and settings, and which instructions you turned off. Instructions shared in the repository come from the worktree's own branch.

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
