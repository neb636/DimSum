# Extensions

Extensions add views, panels, widgets, commands, menus, prompt contributions and send checks to DimSum. They are TypeScript folders in `<workspace>/.dimsum/extensions/<name>/` (shared with the repository) or `$DIMSUM_HOME/extensions/<name>/` (the person's own, in every workspace).

Read the full guide before writing one: the file named in `$DIMSUM_GUIDE` (also copied to `<workspace>/.dimsum/AGENTS.md` when an extension is scaffolded there). It covers the SDK, the rules every extension follows and how to check your work.

Quick facts:

- DimSum reloads an extension when you save any of its files. A save that doesn't compile keeps the last working version running.
- After saving, read `.dimsum/extensions/<name>/.status.json`: `status` is `running`, `failed` (with `error` and `stack`), `waiting-for-trust` or `disabled`. Don't write that file.
- Workspace extensions run only after the person trusts the workspace in DimSum. If the status is `waiting-for-trust`, ask them to.
- To turn an extension off without deleting it, see `settings.md`.
