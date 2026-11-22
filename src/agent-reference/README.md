# DimSum reference for agents

You are running in a session that DimSum started. DimSum is a local agent workbench: it opens workspaces (folders, often git worktrees), runs agent CLIs and terminals in them, and offers a prompt composer with appended instructions and extensions. This folder tells you how to change DimSum itself on the person's behalf. Read only the topic you need.

| The person asks you to… | Read |
| --- | --- |
| Add, change or remove an appended instruction (an option in the composer's Instructions menu) | `instructions.md` |
| Turn a DimSum extension off or back on | `settings.md` |
| Build or change a view, panel, menu, command or send check inside DimSum | `extensions.md` |

## Where DimSum's files live

Configuration is plain JSON in three layers. Later layers win for options with the same `id`.

| Layer | File | Use it for |
| --- | --- | --- |
| Yours | `$DIMSUM_HOME/<name>.json` (normally `~/.dimsum/`) | The person's own setting in every workspace. |
| Workspace | `<workspace>/.dimsum/<name>.json` | Everyone who works in this repository. Commit it with the change. |
| Local | `<workspace>/.dimsum/<name>.local.json` | Just this person, just this workspace. Never commit it. |

- When the workspace is a git worktree, the local layer is read from the main checkout's `.dimsum/`, not the worktree's. Find it with `git rev-parse --path-format=absolute --git-common-dir` (its parent folder).
- The files must be ordinary files: DimSum ignores a `.dimsum` that is, or contains, a symbolic link.
- DimSum watches the files and picks up a save at once. An invalid file is flagged in the app and ignored until fixed, so always leave valid JSON behind. Each file must stay under 2 MB.
- Write `.dimsum/.gitignore` only to add rules; DimSum keeps `*.local.*`, `.status.json`, `.sdk/` and `node_modules/` in it.

## What files can't change

Personas, appearance (theme, terminal and editor fonts, syntax theme), which composer menus show, keyboard shortcuts, the workspace list, open views, drafts and workspace trust live in DimSum's own profile, not in files you should edit. Tell the person to change them in the app (personas: **Settings ▸ Personas**; theme, fonts and syntax theme: **Settings ▸ Appearance**; composer menus: **Settings ▸ Prompt composer**; trust: DimSum's **Trust workspace?** prompt).
