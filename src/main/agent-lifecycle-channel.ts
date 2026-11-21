import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { executablePath } from "./executables";

/** A hook payload is a few KB; anything far larger is not one. */
const MAX_BODY_BYTES = 256 * 1024;

/** What a session's CLI is told about the channel: where to send, and the token that names this session. */
export interface LifecycleEndpoint {
  /** A shell command that sends the JSON on its stdin to this session's channel, prints nothing and always succeeds. */
  forward: string;
  /** Environment the CLI must run with for `forward` to reach the channel. */
  env: Record<string, string>;
  close: () => void;
}

/**
 * Where agent CLIs report their own lifecycle (Claude Code's hooks, for example), instead of DimSum reading it off the
 * screen. One HTTP server on a Unix socket in a private (0700) folder, so only this user's processes can connect; each
 * session gets its own random token, and a message is delivered only to the session whose token it carries.
 *
 * The CLI's side is a plain `curl` call, so nothing is installed and no global configuration changes. POSIX only, and
 * only where curl exists; otherwise `open` returns undefined and status comes from the screen, as before.
 */
export class AgentLifecycleChannel {
  private server?: Server;
  private folder?: string;
  private socket?: string;
  private failed = false;
  private readonly sessions = new Map<string, (payload: unknown) => void>();

  open(onMessage: (payload: unknown) => void): LifecycleEndpoint | undefined {
    const curl = process.platform === "win32" ? undefined : executablePath("curl");
    if (!curl || !this.listen()) return undefined;
    const token = randomBytes(24).toString("hex");
    this.sessions.set(token, onMessage);
    const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
    // Hook output can become part of the conversation, and a failing hook can block it: say nothing, always succeed.
    const forward = `${quote(curl)} -s -m 2 --unix-socket "$DIMSUM_AGENT_CHANNEL" -H "Authorization: Bearer $DIMSUM_AGENT_TOKEN" `
      + `-H 'Content-Type: application/json' --data-binary @- http://dimsum/lifecycle >/dev/null 2>&1; exit 0`;
    return { forward, env: { DIMSUM_AGENT_CHANNEL: this.socket!, DIMSUM_AGENT_TOKEN: token }, close: () => { this.sessions.delete(token); } };
  }

  dispose(): void {
    this.sessions.clear();
    this.server?.close();
    if (this.folder) rmSync(this.folder, { recursive: true, force: true });
    this.server = undefined;
    this.folder = undefined;
  }

  private listen(): boolean {
    if (this.server) return true;
    if (this.failed) return false;
    try {
      // A short path in the temp folder: a Unix socket path is limited to about 100 bytes.
      this.folder = mkdtempSync(path.join(tmpdir(), "dimsum-"));
      this.socket = path.join(this.folder, "lifecycle.sock");
      this.server = createServer((request, response) => {
        const end = (status: number) => { response.writeHead(status, { "Content-Type": "application/json" }); response.end("{}"); };
        const deliver = this.sessions.get(/^Bearer ([0-9a-f]{48})$/.exec(request.headers.authorization ?? "")?.[1] ?? "");
        if (request.method !== "POST" || request.url !== "/lifecycle" || !deliver) { request.resume(); return end(404); }
        const chunks: Buffer[] = [];
        let size = 0;
        request.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BODY_BYTES) { end(413); request.destroy(); return; }
          chunks.push(chunk);
        });
        request.on("end", () => {
          if (size > MAX_BODY_BYTES) return;
          end(200);
          let payload: unknown;
          try { payload = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return; }
          deliver(payload);
        });
      });
      this.server.on("error", () => { this.failed = true; this.dispose(); });
      this.server.listen(this.socket);
      return true;
    } catch {
      this.failed = true;
      this.dispose();
      return false;
    }
  }
}
