# Harnesses

A harness is the program an agent session runs. DimSum runs each one as its real interactive CLI and never in a headless mode, so the CLI's own interface, permissions and approvals all still apply.

| Harness | Id | Executable |
| --- | --- | --- |
| Claude Code | `claude.cli` | `claude` |
| Codex | `codex.cli` | `codex` |
| Local terminal | `terminal.local` | Your shell (`$SHELL`) |

Use the ids in [instruction conditions](/configure/config-files#conditions) and in extensions, for example to show an option only for Claude Code.

## Claude Code

- Model and effort come from the composer's pickers and are passed to `claude` when it starts.
- Attachment folders are passed with `--add-dir`, so Claude Code can read attached files.
- **Plan** mode uses Claude Code's own plan mode.
- The note that tells the agent it is in DimSum ([What agents know about DimSum](/guide/agent-sessions#what-agents-know-about-dimsum)) is passed with `--append-system-prompt`.
- Session status (working, ready, needs input) comes from Claude Code's [hooks](https://code.claude.com/docs/en/hooks). DimSum passes them with `--settings` for that session only, so your settings files are not edited, and your own hooks still run alongside them. They need macOS or Linux with `curl`. If no hook ever reports (when hooks are turned off, for example), DimSum reads the status from the terminal screen instead.

## Codex

- Runs `codex` interactively.
- **Plan** mode uses Codex's own `/plan`.
- The note that tells the agent it is in DimSum is passed as `-c developer_instructions=…` for that session only. If your `config.toml` sets `developer_instructions`, DimSum's note takes its place in sessions DimSum starts.

## Signing in

Install each CLI and sign in to it outside DimSum. DimSum never handles your account, and it never accepts sign-in or billing prompts for you. The CLIs' folder-trust question is skipped only in workspaces you have trusted in DimSum; see [Workspace trust](/guide/trust). If a CLI isn't found, see [Installation](/install#finding-the-agent-clis).
