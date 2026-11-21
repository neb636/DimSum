import { LanguageDescription, type LanguageSupport } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { highlightCode } from "@lezer/highlight";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { syntaxClasses } from "./code-theme";

/** One line of a file, colored as the file view colors it. Shows plain text until the file's language loads. */
export function HighlightedLine({ path, text }: { path: string; text: string }) {
  const description = useMemo(() => LanguageDescription.matchFilename(languages, path.split("/").at(-1) ?? path), [path]);
  const [support, setSupport] = useState<LanguageSupport | undefined>(description?.support);
  useEffect(() => {
    setSupport(description?.support);
    if (!description || description.support) return;
    let active = true;
    void description.load().then((loaded) => { if (active) setSupport(loaded); }, () => undefined);
    return () => { active = false; };
  }, [description]);
  const parts = useMemo(() => {
    if (!support) return text;
    const nodes: ReactNode[] = [];
    // A lone line parses without the lines around it, so a token that spans lines (a block comment) may color as code.
    highlightCode(text, support.language.parser.parse(text), syntaxClasses,
      (piece, classes) => nodes.push(classes ? <span key={nodes.length} className={classes}>{piece}</span> : piece), () => undefined);
    return nodes;
  }, [support, text]);
  return <code>{parts}</code>;
}
