import { open, readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { ConversationTitle } from "../agent-provider";

// Codex starts each rollout with its session's metadata; it fits well within this.
const FIRST_LINE_LIMIT = 64 * 1024;
const READ_BATCH = 64;

/** Codex's home folder: CODEX_HOME, else ~/.codex. */
function codexHome(): string {
  return process.env.CODEX_HOME || path.join(homedir(), ".codex");
}

/** Which folder each rollout ran in. Rollouts don't change folder, so each file's first line is read once. */
const rollouts = new Map<string, { cwd?: string; id?: string; at: number }>();

async function firstLine(file: string): Promise<string> {
  const handle = await open(file, "r");
  try {
    const buffer = Buffer.alloc(FIRST_LINE_LIMIT);
    const { bytesRead } = await handle.read(buffer, 0, FIRST_LINE_LIMIT, 0);
    const text = buffer.subarray(0, bytesRead).toString("utf8");
    const end = text.indexOf("\n");
    return end < 0 ? text : text.slice(0, end);
  } finally { await handle.close(); }
}

async function rolloutFiles(): Promise<string[]> {
  const entries = await readdir(path.join(codexHome(), "sessions"), { recursive: true }).catch(() => [] as string[]);
  return entries.filter((entry) => /rollout-[^/\\]*\.jsonl$/.test(entry)).map((entry) => path.join(codexHome(), "sessions", entry));
}

let indexing: Promise<void> | undefined;

/** Reads the rollouts new since last time, and when each was last written; folders asked about together share one pass. */
function indexRollouts(): Promise<void> {
  indexing ??= readRollouts().finally(() => { indexing = undefined; });
  return indexing;
}

async function readRollouts(): Promise<void> {
  const files = await rolloutFiles();
  // In batches, so years of rollouts don't open thousands of files at once.
  for (let start = 0; start < files.length; start += READ_BATCH) await Promise.all(files.slice(start, start + READ_BATCH).map(async (file) => {
    try {
      const info = await stat(file);
      const known = rollouts.get(file);
      // A resumed conversation is written to again: its time moves, its folder and id don't.
      if (known) { known.at = info.mtimeMs; return; }
      const meta = JSON.parse(await firstLine(file)) as { type?: string; payload?: { cwd?: unknown; id?: unknown } };
      const payload = meta.type === "session_meta" ? meta.payload : undefined;
      rollouts.set(file, {
        at: info.mtimeMs,
        ...(typeof payload?.cwd === "string" ? { cwd: payload.cwd } : {}),
        ...(typeof payload?.id === "string" ? { id: payload.id } : {}),
      });
    } catch { /* unreadable or still being written: tried again next time */ }
  }));
}

/** Codex's names for its threads, by id; later lines rename earlier ones. */
async function threadNames(): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const text = await readFile(path.join(codexHome(), "session_index.jsonl"), "utf8").catch(() => "");
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line) as { id?: unknown; thread_name?: unknown };
      if (typeof entry.id === "string" && typeof entry.thread_name === "string" && entry.thread_name.trim()) names.set(entry.id, entry.thread_name.trim());
    } catch { /* skip */ }
  }
  return names;
}

/** Titles of Codex threads run in `folder`, newest first. Reads only Codex's own files. */
export async function codexConversationTitles(folder: string): Promise<ConversationTitle[]> {
  await indexRollouts();
  const wanted = path.resolve(folder);
  const here = [...rollouts.values()].filter((item) => item.cwd && item.id && path.resolve(item.cwd) === wanted);
  if (!here.length) return [];
  const names = await threadNames();
  return here.flatMap((item) => {
    const title = names.get(item.id!);
    return title ? [{ title, at: item.at }] : [];
  }).sort((a, b) => b.at - a.at);
}
