# Workspace trust

Some things DimSum does run code that comes from the repository, not from DimSum. Before the first of these runs in a workspace, DimSum asks **Trust workspace?**:

- Source-control actions, which can run Git hooks, filters and configured helpers.
- AI change preparation, such as generating a commit message.
- Workspace extensions in `<workspace>/.dimsum/extensions/`, which run inside the app with the same access the app has.

Only trust repositories you know. DimSum remembers your answer for that folder and for its worktrees, in `~/dimsum/worktrees/<repository>-<id>/` or, for ones made by older versions, `<workspace>-worktrees/`.

Claude Code and Codex each ask whether to trust a folder the first time they start in it. When you have trusted a workspace in DimSum, an agent session started in it or in one of its worktrees skips that question: DimSum marks the folder as trusted for Claude Code in its `~/.claude.json` (or `$CLAUDE_CONFIG_DIR/.claude.json`), and starts Codex with a one-off setting that trusts the folder without writing to Codex's config. Folders you haven't trusted in DimSum still get the CLI's own question. DimSum also marks its own attachments folder as trusted for Claude Code, so a session that can read your attached files doesn't ask about that folder; it holds only files you attached.

GitHub Copilot CLI manages folder trust and tool permissions in its own terminal. Answer Copilot's prompts there, including any requests for access to attached files.

Otherwise trust in DimSum doesn't change what the agent CLIs may do. Their approval prompts for commands and edits still decide what the agent can run.

## Resetting trust

**Settings ▸ General ▸ Reset workspace execution trust** forgets every workspace you have trusted and stops their workspace extensions. Running agent sessions keep their own permissions, and folders already marked as trusted for Claude Code stay trusted there. DimSum asks again the next time it needs trust.

Your own extensions in `~/.dimsum/extensions/` don't need trust, because they are yours. See [Extensions](/extend/).
