# Files and the editor

## The Files panel

The Files panel shows the workspace's folder tree. From it you can:

- create files and folders, and refresh the tree;
- cut, copy, paste, rename and move items to the Trash, with undo and redo for the last 50 file operations;
- right-click an item to open it, reveal it in Finder, open it in its default app or a terminal, or copy its path or relative path.

The usual shortcuts work while the panel has focus. See [Keyboard shortcuts](/reference/keyboard-shortcuts).

## Search

Search file **Names** or **Contents**. Contents search supports **Match case**, **Regular expression** and limiting the search to a folder. Press <kbd>⇧</kbd><kbd>⌘</kbd><kbd>F</kbd> to search contents with **Find in Files**.

Each matching line is colored the way the editor colors that file's language. A file with no known language shows plain text. Each line is colored by itself, so a line inside a multi-line comment or string can be colored as code.

To jump to a file by name, press <kbd>⌘</kbd><kbd>P</kbd> (**Go to File…**). This also works while a terminal has focus.

## The editor

Click a file to open it in a preview tab. The next file you click replaces it. Double-click a file, edit it, or choose **Keep open** to keep the tab.

- An unsaved file shows a dot on its tab. Press <kbd>⌘</kbd><kbd>S</kbd> to save.
- If the file changes on disk while you have unsaved edits, DimSum asks whether to **reload** it or **keep yours**.
- The editor's menu has Find, Replace and **Send to Agent…**, which sends the selected code to a session's draft. See [Agent sessions](/guide/agent-sessions#sending-code-from-a-file).

## Previewing HTML and Markdown

HTML and Markdown files open as code. Switch the **Code / Preview** toggle in the tab's header to see them rendered; each tab remembers its choice, and **Code** brings back the editor with any unsaved edits.

- **Markdown** previews follow the editor as you type. Pictures and links resolve next to the file: a link to another file in the workspace opens it in a tab, and a web link opens in your browser. Pictures hosted on the web show as links, since DimSum loads nothing from the web.
- **HTML** previews show the saved file as a page, with its stylesheets, scripts, data files and pictures loaded relative to it. The page reloads when the file changes on disk, or press **Reload**. It can load libraries, styles, fonts and pictures from the web, but it can only fetch files from its own workspace (never `.git`) and can't reach DimSum itself.

## Opening files from outside

Press <kbd>⌘</kbd><kbd>O</kbd> to open any file. DimSum is registered as an editor for text and code files such as Markdown, JSON, YAML and common source files, so you can also use **Open With** in Finder. A file opened this way shows up in the sidebar's files-only entry. From its tab menu, **Open Folder as Workspace…** opens the folder that contains it as a workspace.
