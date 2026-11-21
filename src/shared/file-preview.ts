// Workspace files shown as web pages (an HTML report, a Markdown file's pictures). Main serves them on this scheme, one
// host per workspace root, so a page's relative links, styles, scripts and pictures resolve beside it. Pure.

export const FILE_PREVIEW_SCHEME = "workbench-file";

/** File types that have a rendered Preview beside their code. */
export type PreviewKind = "html" | "markdown";

export function previewKind(path: string): PreviewKind | undefined {
  if (/\.html?$/i.test(path)) return "html";
  if (/\.(md|markdown|mdown|mkd)$/i.test(path)) return "markdown";
  return undefined;
}

/** True for a URL on the file preview scheme. */
export function isFilePreviewUrl(value: string): boolean {
  return value.startsWith(`${FILE_PREVIEW_SCHEME}://`);
}
