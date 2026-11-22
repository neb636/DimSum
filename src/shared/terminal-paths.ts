// A path in the output, maybe with :line(:col) — `src/renderer/main.tsx:42`, `./AGENTS.md`.
const PATH_PATTERN = /(^|[\s'"`(<[{=])((?:\.{1,2}\/|\/)?(?:[\w.@+-]+\/)*[\w@+-][\w.@+-]*\.[A-Za-z0-9]{1,8})(?::(\d+)(?::(\d+))?)?/g;

/** Candidate file paths in one line of output, relative to the root (absolute ones inside it included). */
export function pathsInLine(text: string, root: string): { path: string; line?: number; start: number; length: number }[] {
  const found: { path: string; line?: number; start: number; length: number }[] = [];
  const base = root.replace(/\/+$/, "") + "/";
  for (const match of text.matchAll(PATH_PATTERN)) {
    let path = match[2];
    if (path.startsWith("/")) { if (!path.startsWith(base)) continue; path = path.slice(base.length); }
    path = path.replace(/^\.\//, "");
    if (!path || path.startsWith("../") || /^\d+(\.\d+)+$/.test(path)) continue;
    const start = (match.index ?? 0) + match[1].length;
    const length = match[0].length - match[1].length;
    found.push({ path, line: match[3] ? Number(match[3]) : undefined, start, length });
  }
  return found;
}

// A plain http(s) URL in the output; trailing punctuation that ends a sentence is trimmed below.
const URL_PATTERN = /\bhttps?:\/\/[^\s<>"'`─-╿]+/g;

/** Plain web links in some output text (one logical line, which may span several soft-wrapped rows). */
export function webLinksInText(text: string): { url: string; start: number; length: number }[] {
  const found: { url: string; start: number; length: number }[] = [];
  for (const match of text.matchAll(URL_PATTERN)) {
    let url = match[0];
    for (;;) {
      const trimmed = url.replace(/[.,;:!?*_~]+$/, "");
      // A closing bracket ends the link unless the link opened it (Wikipedia-style `Foo_(bar)`).
      const close = /[)\]}]$/.exec(trimmed)?.[0];
      const open = close === ")" ? "(" : close === "]" ? "[" : "{";
      const unbalanced = close && trimmed.split(open).length <= trimmed.split(close).length - 1;
      const next = unbalanced ? trimmed.slice(0, -1) : trimmed;
      if (next === url) break;
      url = next;
    }
    if (url.length <= "https://".length) continue;
    found.push({ url, start: match.index ?? 0, length: url.length });
  }
  return found;
}
