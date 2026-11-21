# Your first session

This walks through opening a folder and sending a first prompt to an agent.

## Add a workspace

Select **Add workspace** (the + at the top of the left sidebar) and choose a folder. The folder becomes a workspace in the sidebar. Its sessions, terminals and open files are listed under it. Once you make a [worktree](/guide/workbench#local-and-worktrees) of a Git repository, the repository lists **Local** (its own folder) and each worktree under it, each with its own sessions.

## Start an agent session

Create a new **Agent session** view in the workspace. The launcher asks for:

- **Coding harness**: the CLI to run, such as Claude Code or Codex. A CLI DimSum can't find is shown as *Not installed*.
- **Run in**: where the agent works.
  - **Local checkout** (the default) runs the agent in the folder the session was opened in: the workspace itself, or the worktree whose tabs it's in (shown as **This worktree**).
  - **New worktree** (in a Git repository) gives the session its own branch and folder, in `~/dimsum/worktrees/<repository>-<id>/`. It is created from the default branch, or from a branch you pick under **Create from**. When the session starts, the worktree appears under the workspace in the sidebar and the session moves into it.
- **Model**: choose one for each new conversation. **Start session** appears once you do.

Select **Start session**. The CLI starts in the terminal, and the composer appears below it.

## Send a prompt

Type in the composer and press <kbd>⌘</kbd><kbd>Enter</kbd>. Plain <kbd>Enter</kbd> adds a new line. Your first prompt becomes the session's title.

You can keep drafting while the agent works. When you send, the prompt goes through the CLI's own queue or steering. Answer approvals and run slash commands in the terminal itself, just as you would outside DimSum.

## Resume later

Sessions keep running while you switch tabs or workspaces. Closing a session's view stops its CLI, after asking first. When you reopen the app, your drafts and layout come back. To pick up a saved conversation, choose **Resume previous…** in the launcher.

Next: [the workbench layout](/guide/workbench) and [everything the composer does](/guide/agent-sessions).
