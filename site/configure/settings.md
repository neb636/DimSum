# Settings

Open Settings with the button at the bottom of the left sidebar. It fills the window: choose a section in its sidebar, and press **Done** or <kbd>Esc</kbd> to go back. Appearance and composer changes apply at once.

## General

The General section groups its settings into **Built-in AI**, **Storage and trust** and **AI usage**.

- **Default CLI**: the agent CLI used for DimSum's own AI actions, such as writing commit messages. Agent sessions don't use it: you choose a harness each time you start one.
- **Remove attachments for closed views**: deletes attachment copies that belong to views you have closed. Attachments for open views are kept so their conversations still work.
- **Reset workspace execution trust**: forgets which workspaces you trusted. See [Workspace trust](/guide/trust).
- **AI usage**: show or hide the plan-usage meter, and choose which CLIs it shows. See [AI usage and resources](/guide/ai-usage-resources).

Extensions can add their own groups to this section.

## Appearance

- **Theme**: **Light**, **Dark**, or **System**, which follows your Mac's appearance (System Settings ▸ Appearance) and switches when it does. Terminals and the file editor stay dark in every theme.
- **Terminal**: the font and size of terminals and agent sessions. Open terminals change at once.
- **File editor**: the font and size of files opened in a tab and of commit diffs, and the syntax theme. There is one syntax theme, DimSum Dark, for now.

The font lists show the monospace fonts installed on your Mac; **System (SF Mono)** is the default.

## Prompt composer

Show or hide each menu under the prompt, such as **Persona** and **Instructions**. A hidden menu adds nothing to your prompts, even if something was chosen in it, until you show it again. Menus that extensions add are listed here too.

## Personas

Create, edit and delete personas. See [Personas and instructions](/guide/personas-instructions#personas).

## Instructions

Manage the instructions the composer offers in the current workspace:

- Edit any option's label, text, kind and choices.
- Move an option between *Everywhere*, *Shared in repo* and *Only me here*.
- Turn an option on or off for this repository only.
- **Restore default instructions**.

See [Personas and instructions](/guide/personas-instructions#instructions).
