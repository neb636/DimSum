# Appended instructions

An instruction is an option in the composer's Instructions menu. When it is on (or a choice is selected), its text is added to the end of the person's prompt. Instructions are stored in `instructions.json` in the layers described in `README.md`.

## Pick the file

| The person says… | File |
| --- | --- |
| "for this repo", "for the team", "for everyone here" | `<workspace>/.dimsum/instructions.json` (commit it) |
| "just for me", "only here, for me" | `<workspace>/.dimsum/instructions.local.json` (main checkout's `.dimsum/` in a worktree; never commit) |
| "everywhere", "in all my repos" | `$DIMSUM_HOME/instructions.json` |

If it isn't clear whether the instruction is for the team or just for them, ask.

## Edit the file

1. Read the file if it exists. Keep `"version": 1` and every existing entry; change only what was asked.
2. If it doesn't exist, create it as `{ "version": 1, "instructions": [] }` and create the `.dimsum/` folder if needed.
3. Give a new option a unique kebab-case `id`. An option in the workspace or local file with the same `id` as one in the person's own file replaces it in that workspace; reuse an id only to override on purpose.
4. Write instruction text as a direct instruction to an agent, one or two sentences.
5. Check the result parses as JSON and matches the shape below. Then tell the person it is in the Instructions menu (under its `category`, if it has one).

## Shape

```json
{
  "version": 1,
  "instructions": [
    { "kind": "toggle", "id": "run-e2e", "label": "Run e2e tests", "category": "Verification", "defaultOn": false,
      "text": "Run `npm run e2e` before you finish and report the result." },
    { "kind": "select", "id": "review-depth", "label": "Review depth", "display": "segmented", "defaultChoice": "normal",
      "choices": [
        { "id": "normal", "label": "Normal", "text": "" },
        { "id": "deep", "label": "Deep", "text": "Review every changed line and list each risk you find." }
      ] },
    { "kind": "multiSelect", "id": "targets", "label": "Targets", "defaultChoices": [],
      "choices": [ { "id": "web", "label": "Web", "text": "Check the web build." }, { "id": "ios", "label": "iOS", "text": "Check the iOS build." } ] },
    { "kind": "text", "id": "ticket", "label": "Ticket", "placeholder": "ABC-123", "defaultValue": "", "maxLength": 40,
      "template": "Reference ticket {{value}} in the commit message." }
  ]
}
```

Every option: `kind`, `id` (non-empty), `label` are required. Optional: `description` (help text), `category` (menu group), `display` (`list`, `segmented` or `dropdown`, for choices), `resetAfterSend` (boolean: back to default after each send), `when` (below).

| `kind` | Required fields |
| --- | --- |
| `toggle` | `defaultOn` (boolean), `text` |
| `select` | `defaultChoice` (a choice id), `choices` |
| `multiSelect` | `defaultChoices` (array of choice ids), `choices` |
| `text` | `placeholder`, `defaultValue`, `maxLength` (integer 1–10000), `template` (`{{value}}` is replaced with what was typed) |

A choice is `{ "id", "label", "text", "description"? }`; `text` is what it adds, and may be `""`.

## Show an option only sometimes

`when` takes one condition:

- `{ "kind": "isOn", "option": "<toggle id>" }`
- `{ "kind": "isChoice", "option": "<option id>", "choice": "<choice id>" }`
- `{ "kind": "harness", "harness": "claude.cli" }` (or `codex.cli`)
- `{ "kind": "all", "conditions": [ … ] }`, `{ "kind": "any", "conditions": [ … ] }`, `{ "kind": "not", "condition": { … } }`
