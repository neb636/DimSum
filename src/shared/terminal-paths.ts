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
const URL_PATTERN = /(?<![A-Za-z0-9])https?:\/\/[^\s<>"'`─-╿]+/g;

/** Plain web links in some output text (one logical line, which may span several soft-wrapped rows). */
export function webLinksInText(text: string): { url: string; start: number; length: number }[] {
  const found: { url: string; start: number; length: number }[] = [];
  const pattern = new RegExp(URL_PATTERN);
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    const start = match.index;
    // A closing bracket the URL didn't open ends it (`(https://…)`, `[https://a](https://b)`); one it opened is
    // part of it (Wikipedia-style `Foo_(bar)`). Searching resumes there, so a second URL after it is found too.
    const depth: Record<string, number> = { "(": 0, "[": 0, "{": 0 };
    const opener: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
    let end = match[0].length;
    for (let i = 0; i < match[0].length; i++) {
      const char = match[0][i];
      if (char in depth) depth[char]++;
      else if (char in opener && depth[opener[char]]-- === 0) { end = i; break; }
    }
    pattern.lastIndex = start + Math.max(end, 1);
    let url = match[0].slice(0, end);
    const before = text.slice(0, start);
    for (;;) {
      let trimmed = url.replace(/[.,;:!?]+$/, "");
      // `*`, `_` and `~` can end a real URL; they're dropped only as markup the URL is wrapped in (`**https://…**`).
      const markup = /[*_~]+$/.exec(trimmed)?.[0];
      if (markup && before.endsWith(markup)) trimmed = trimmed.slice(0, -markup.length);
      if (trimmed === url) break;
      url = trimmed;
    }
    if (url.length <= "https://".length) continue;
    found.push({ url, start, length: url.length });
  }
  return found;
}
