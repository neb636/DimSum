import DOMPurify from "dompurify";
import { marked } from "marked";
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { errorMessage } from "../../core/errors";
import { services } from "../../core/services";
import { watchWorkspace } from "../../core/workspace-watch";
import type { PreviewKind } from "../../../shared/file-preview";

interface PreviewProps {
  workspaceId: string;
  root: string;
  path: string;
  kind: PreviewKind;
  /** The editor's text (with unsaved edits). Markdown renders it; an HTML page always loads the saved file. */
  text: string;
  /** Bumped to load an HTML page again. */
  reload: number;
}

/** Where this file is served as a page, which its relative links and pictures resolve against. */
function usePreviewUrl(root: string, path: string): { url?: string; error: string } {
  const [state, setState] = useState<{ url?: string; error: string }>({ error: "" });
  useEffect(() => {
    let active = true;
    window.workbench.files.previewUrl(root, path).then((url) => { if (active) setState({ url, error: "" }); })
      .catch((caught: unknown) => { if (active) setState({ error: errorMessage(caught) }); });
    return () => { active = false; };
  }, [root, path]);
  return state;
}

/** A Markdown or HTML file as it reads rendered. */
export function FilePreview(props: PreviewProps) {
  const { url, error } = usePreviewUrl(props.root, props.path);
  if (error) return <div className="code-message" role="alert">{error}</div>;
  if (!url) return <div className="code-message">Loading…</div>;
  return props.kind === "html" ? <HtmlPreview {...props} url={url} /> : <MarkdownPreview {...props} url={url} />;
}

/**
 * The saved page in a sandboxed frame on its own workspace origin (never the app's): it runs its scripts but gets no
 * preload, permissions, top navigation or downloads. Main serves it with a policy that keeps its requests inside its
 * workspace, apart from libraries, styles, fonts and pictures from the web. It loads again when the file changes.
 */
function HtmlPreview({ root, path, reload, url }: PreviewProps & { url: string }) {
  const [revision, setRevision] = useState(0);
  useEffect(() => watchWorkspace(root, (event) => {
    if (event.paths.some((changed) => changed === path || changed === "")) setRevision((value) => value + 1);
  }), [root, path]);
  return <div className="file-preview is-page">
    <iframe key={`${reload}-${revision}`} src={url} title={`Preview of ${path}`} className="file-preview-frame"
      // Its own origin (not the app's) so its relative files and storage work; popups only reach the system browser.
      sandbox="allow-scripts allow-same-origin allow-popups" referrerPolicy="no-referrer" />
  </div>;
}

function slug(text: string, used: Map<string, number>): string {
  const base = text.trim().toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, "").replace(/\s/g, "-");
  const count = used.get(base) ?? 0;
  used.set(base, count + 1);
  return count ? `${base}-${count}` : base;
}

/** Rendered with GitHub-flavoured Markdown and sanitized; pictures and links resolve beside the file. */
function MarkdownPreview({ workspaceId, root, text, url }: PreviewProps & { url: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const html = useMemo(() => {
    const clean = DOMPurify.sanitize(marked.parse(text, { gfm: true, async: false }), { RETURN_DOM_FRAGMENT: true });
    const used = new Map<string, number>();
    for (const heading of clean.querySelectorAll("h1, h2, h3, h4, h5, h6")) heading.id = slug(heading.textContent ?? "", used);
    for (const image of clean.querySelectorAll("img")) {
      const src = image.getAttribute("src");
      if (src && !/^(data|https?):/i.test(src)) image.src = new URL(src, url).href;
    }
    for (const link of clean.querySelectorAll("a[href]")) {
      if (/^https?:/i.test(link.getAttribute("href") ?? "")) { link.setAttribute("target", "_blank"); link.setAttribute("rel", "noreferrer"); }
    }
    const holder = document.createElement("div");
    holder.append(clean);
    return holder.innerHTML;
  }, [text, url]);

  // Links: web pages open in the browser (the app's window-open handler), headings scroll, workspace files open in a tab.
  const onClick = (event: MouseEvent) => {
    const link = (event.target as HTMLElement).closest("a");
    const href = link?.getAttribute("href");
    if (!link || !href || link.target === "_blank") return;
    event.preventDefault();
    if (href.startsWith("#")) {
      ref.current?.querySelector(`[id="${CSS.escape(decodeURIComponent(href.slice(1)))}"]`)?.scrollIntoView({ block: "start" });
      return;
    }
    const target = new URL(href, url);
    const base = new URL(url);
    if (target.protocol !== base.protocol || target.host !== base.host) return;
    const file = decodeURIComponent(target.pathname).replace(/^\/+/, "");
    if (file) void services.commands.execute("file.open", { workspaceId, root, path: file });
  };

  return <div className="file-preview">
    <div ref={ref} className="markdown-preview" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
  </div>;
}
