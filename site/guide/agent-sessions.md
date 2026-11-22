# Agent sessions

An agent session runs a coding agent's own CLI in a terminal, with DimSum's composer underneath it. The terminal is the real CLI, so everything you know about Claude Code or Codex still works there. The composer helps you write and send prompts to it.

## The launcher

A new agent session view opens on the launcher. Choose the **coding harness**, where it should **run** (the checkout it was opened in, or a new worktree that it moves into when it starts), and a **model**. Then select **Start session**, or **Resume previous…** to pick up a saved conversation from that CLI. See [Your first session](/first-session) for a step-by-step walkthrough.

## The composer

The composer toolbar has:

- **Model**, **Effort** and **Mode** pickers. Mode switches between **Code** and **Plan**. DimSum switches the CLI's own plan mode for you.
- **Interrupt**: stops what the agent is doing.
- **Attach files** (+), **Recent prompts** and **Collapse composer**.

Changing the model of a running session offers **Restart with…**, which restarts the CLI with the new model. The list of models is refreshed from each CLI about every 30 minutes.

Press <kbd>⌘</kbd><kbd>Enter</kbd> to send. Plain <kbd>Enter</kbd> adds a new line.

## Attachments

Add files with the + button, by dragging them onto the composer, or by pasting a screenshot. A prompt can carry up to 10 files of up to 25 MB each. Attachments are copied into your DimSum profile and the agent is given access to them. Remove the copies for closed views from [Settings](/configure/settings).

## Sending while the agent works

You can draft while the agent is busy. When you send, DimSum delivers the prompt through the CLI's own queue or steering, the same way typing it into the terminal would. Each send ends one of three ways:

| Result | Meaning |
| --- | --- |
| Handed to CLI | The prompt was typed into the CLI and submitted. |
| Not sent | The CLI couldn't take input. Your draft is kept, so send it again when the CLI is ready. |
| Delivery uncertain | DimSum couldn't confirm the CLI received it. Check the terminal before sending again. |

**Recent prompts** keeps your history, and **Use as draft** brings an earlier prompt back into the composer.

## Checks before sending

Before a prompt goes out, DimSum checks it:

- Prompts over 500,000 characters are refused.
- The CLI's own slash commands are refused in the composer. Type those in the terminal.
- Text that looks like a credential (a private key, or an AWS, GitHub, Anthropic, OpenAI or Slack token) triggers a warning. This check catches common formats only and is not a full secret scanner.

Extensions can add their own checks. See [Extensions](/extend/).

## Sending code from a file

Select code in a file and press <kbd>⌘</kbd><kbd>L</kbd>, or choose **Send to Agent…** from the editor menu. With nothing selected, the current line is sent. Pick an existing session or start a new one. The code is added to that session's draft and isn't sent until you send it.

## Links in the terminal

File paths in the agent's output are links. Click one to open the file at that line.

Web links the agent prints open in your default browser. The first time you click one in a workspace, DimSum asks before opening it. Choose **Open Link** and later links in that workspace open without asking. Choose **Cancel** and DimSum asks again next time.

## What agents know about DimSum

Every agent session DimSum starts carries a two-sentence note: it is running inside DimSum, and before changing DimSum itself it should read DimSum's agent reference. The reference is a few short files that ship with DimSum and explain how to add or edit [instructions](/guide/personas-instructions#instructions), turn [extensions](/extend/) off or on, and build an extension. The agent reads a file only when your request needs it, so the note is all that sits in its context otherwise.

So you can ask the agent directly, for example "add a repo instruction called Run e2e tests that tells you to run `npm run e2e` before finishing". It writes the option into `.dimsum/instructions.json`, or into `.dimsum/instructions.local.json` if you say it's just for you, and the option appears in the Instructions menu.

The note is passed when the CLI starts (see [Harnesses](/reference/harnesses)), not written to the CLI's configuration. Sessions you start outside DimSum don't get it. The reference's path is also in `$DIMSUM_REFERENCE` in every terminal; see [Environment variables](/configure/environment#inside-sessions-and-terminals).

## Closing and stopping

Closing an agent session's view stops its CLI. DimSum asks first, because the CLI's own state may not be saved yet. Sessions keep running while you switch tabs or workspaces.
