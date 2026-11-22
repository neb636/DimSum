import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tagHighlighter, tags, type Tag } from "@lezer/highlight";

/** Which syntax color each kind of token takes: shared by the editor and the code shown in lists. */
const syntaxTokens: { tag: Tag | Tag[]; token: string; style?: Record<string, string> }[] = [
  { tag: [tags.keyword, tags.modifier, tags.controlKeyword, tags.operatorKeyword], token: "keyword" },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], token: "string" },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], token: "comment", style: { fontStyle: "italic" } },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], token: "number" },
  { tag: [tags.typeName, tags.className, tags.namespace], token: "type" },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.macroName], token: "function" },
  { tag: [tags.propertyName, tags.attributeName], token: "property" },
  { tag: [tags.meta, tags.annotation, tags.processingInstruction], token: "meta" },
  { tag: [tags.heading, tags.strong], token: "keyword", style: { fontWeight: "600" } },
  { tag: tags.link, token: "function", style: { textDecoration: "underline" } },
];

/** Gives each token a `syntax-<token>` class, for code drawn outside an editor (colored by `--wb-syntax-*`). */
export const syntaxClasses = tagHighlighter(syntaxTokens.map(({ tag, token }) => ({ tag, class: `syntax-${token}` })));

/** Code surfaces stay dark inside the light chrome; every color is a theme token. */
export const codeTheme = [
  EditorView.theme({
    "&": { color: "var(--wb-code-fg)", backgroundColor: "var(--wb-code-bg)", height: "100%", fontSize: "12.5px" },
    ".cm-scroller": { fontFamily: "var(--wb-font-mono)", lineHeight: "1.65" },
    ".cm-content": { caretColor: "var(--wb-code-cursor)", padding: "10px 0" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--wb-code-cursor)" },
    ".cm-gutters": { backgroundColor: "var(--wb-code-bg)", color: "var(--wb-code-gutter)", border: "none", paddingLeft: "8px" },
    ".cm-lineNumbers .cm-gutterElement": { minWidth: "32px", paddingRight: "14px" },
    ".cm-activeLine": { backgroundColor: "var(--wb-code-active-line)" },
    ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--wb-code-fg)" },
    "&.cm-focused": { outline: "none" },
    "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": { backgroundColor: "var(--wb-code-selection)" },
  }, { dark: true }),
  syntaxHighlighting(HighlightStyle.define(syntaxTokens.map(({ tag, token, style }) => ({ tag, color: `var(--wb-code-${token})`, ...style })))),
];
