---
name: ship
description: Open or update a pull request for a change in this repo and handle Codex's automated review of it (watch, verify each finding, fix or push back, ask for one re-review). Use whenever you commit work and open or update a PR.
---

# Ship: open the PR and handle Codex's review

## 1. Open the PR

- Work on your branch, commit with clear messages, `git fetch origin main` (rebase if needed).
- Before pushing: `npm run typecheck`, `npm run lint`, and the focused QA from `AGENTS.md`.
- Open it ready for review (not a draft) with a body that summarizes the change; never merge it yourself:

```
gh pr create --base main --title '<title>' --body-file body.md
```

## 2. Watch Codex's review

Codex reviews every PR on open and on each push. Right after every push, watch. A review normally lands in 1-2 minutes;
give it up to 15 before treating it as missing:

```
node scripts/watch-codex-review.mjs --pr <n> --timeout 900
```

The script is silent until it prints one line and exits by itself at the timeout. If your agent has a background
monitor (Claude Code's Monitor tool), run it there and keep working. Otherwise run it in the foreground and wait for it
to exit; if your command timeout is shorter than 15 minutes, run it again when it is cut off.

It prints `CLEAN`, `FINDINGS` (one block per comment), `NOREVIEW`, `TIMEOUT` or `CLOSED`. Only `CLEAN` ends the loop
(see step 4).

## 3. Handle each finding (the user never sees these)

1. **Verify first**: read the code and reproduce the claim before changing anything.
2. Reply on its thread (`gh api repos/{owner}/{repo}/pulls/<n>/comments/<id>/replies -f body=...`):
   - **Real:** fix it, re-run checks, push, reply `Fixed in <sha>: <what changed>`, react 👍
     (`gh api repos/{owner}/{repo}/pulls/comments/<id>/reactions -f content=+1`).
   - **Not real:** reply `Not an issue: <the evidence>`.
   - **Too nitpicky** (style preference, overstated severity, tiny bounded cost whose fix adds code): react 👎
     (`-f content=-1`) and reply `Not worth it: <why>`. A crash, lost data, a leak or a feature that doesn't work
     as built is never nitpicky.
   - **Needs the user's input:** say so in one line in your final message.
3. After a pushed fix, comment `@codex review` once with a line on what changed, then go back to step 2 and watch
   that push.

## 4. Keep going until Codex is clean

Repeat steps 2-3 for every push until the watcher prints `CLEAN` for the PR's latest commit. A re-review that finds
new issues is a new round, not the end. Do not stop after one re-review, and do not hand the PR back while findings
are unanswered.

- `TIMEOUT` (no finished review after 15 minutes): Codex sometimes never responds. Comment `@codex review` once and
  watch again. If that second watch also times out, stop and tell the user Codex did not respond.
- `NOREVIEW` (Codex declined, e.g. setup notice) or `CLOSED`: stop and tell the user.
- If findings keep coming after 5 rounds of fixes, stop and tell the user what is still open.
