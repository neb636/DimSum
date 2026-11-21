import { protocol } from "electron";
import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { FILE_PREVIEW_SCHEME } from "../shared/file-preview";
import { isGitPath, type WorkspaceFiles } from "./workspace-files";

const SIZE_LIMIT = 50 * 1024 * 1024;
const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8", css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8", mjs: "text/javascript; charset=utf-8", json: "application/json; charset=utf-8",
  txt: "text/plain; charset=utf-8", md: "text/plain; charset=utf-8", csv: "text/csv; charset=utf-8", xml: "application/xml; charset=utf-8",
  svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", avif: "image/avif",
  bmp: "image/bmp", ico: "image/x-icon", woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf",
  wasm: "application/wasm", mp4: "video/mp4", webm: "video/webm", mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", pdf: "application/pdf",
};
/**
 * A previewed page is the person's own file (often an agent-written report), so it may run scripts and load libraries,
 * styles, fonts and pictures from the web (charting libraries usually come from a CDN). It may only fetch from its own
 * workspace host, never submit forms or embed plugins. Its frame is sandboxed apart from the app: see `FilePreview`.
 */
const POLICY = "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: blob: https:; font-src 'self' data: https:; media-src 'self' data: blob:; connect-src 'self'; frame-src 'self'; object-src 'none'; form-action 'none'; base-uri 'self'";

/**
 * Serves files inside a workspace root on `workbench-file://<host>/<path>`. Each root gets a random host the first time
 * the renderer asks for one of its files, so a page sees only its own workspace (each host is its own origin) and
 * nothing can guess another workspace's address. Every request is checked like a file read: inside the root, never .git.
 */
export class FilePreviews {
  private hosts = new Map<string, string>();
  private roots = new Map<string, string>();

  constructor(private readonly files: WorkspaceFiles) {}

  async urlFor(root: string, relative: string): Promise<string> {
    await this.files.locate(root, relative);
    let host = this.hosts.get(root);
    if (!host) {
      host = randomBytes(12).toString("hex");
      this.hosts.set(root, host);
      this.roots.set(host, root);
    }
    return `${FILE_PREVIEW_SCHEME}://${host}/${relative.split("/").map(encodeURIComponent).join("/")}`;
  }

  register(): void {
    protocol.handle(FILE_PREVIEW_SCHEME, (request) => this.serve(request));
  }

  private async serve(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const root = this.roots.get(url.hostname);
    if (!root || request.method !== "GET") return new Response(null, { status: 404 });
    try {
      const relative = decodeURIComponent(url.pathname).replace(/^\/+/, "");
      if (relative.split("/").includes(".git")) return new Response(null, { status: 404 });
      const file = await this.files.locate(root, relative);
      // A link inside the workspace may still lead into .git.
      const base = await fs.realpath(root);
      if (isGitPath(base, file)) return new Response(null, { status: 404 });
      const stats = await fs.stat(file);
      if (!stats.isFile() || stats.size > SIZE_LIMIT) return new Response(null, { status: 404 });
      const type = TYPES[path.extname(file).slice(1).toLowerCase()] ?? "application/octet-stream";
      return new Response(new Uint8Array(await fs.readFile(file)), { headers: {
        "Content-Type": type, "Content-Security-Policy": POLICY, "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store",
      } });
    } catch { return new Response(null, { status: 404 }); }
  }
}
