# settings.json

DimSum's small switches, in the layers described in `README.md`. Today it holds one thing: which extensions are off.

```json
{ "version": 1, "extensions": { "disabled": ["workspace:level-editor", "user:my-panel"] } }
```

- An id is `workspace:<folder>` for an extension in `<workspace>/.dimsum/extensions/<folder>/`, or `user:<folder>` for one in `$DIMSUM_HOME/extensions/<folder>/`.
- Layers only add to the list. To turn an extension back on, remove its id from the file that lists it.
- A `user:` id counts only in `$DIMSUM_HOME/settings.json`. A workspace extension can be turned off in any layer; use `.dimsum/settings.local.json` to turn it off just for this person.
- Keep `"version": 1` and any other entries.
