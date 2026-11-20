import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { ConversationTitle } from "../agent-provider";
import { claudeConfigDir } from "./claude-config";

// A folder with many conversations: its newest few say what it was for.
const NEWEST_FILES = 6;
// Transcripts grow large; a title is never worth reading more than this.
const FILE_LIMIT = 32 * 1024 * 1024;

const cache = new Map<string, { key: string; title?: string }>();

/** Claude Code keeps a folder's transcripts under projects/, named after the folder with every other character as "-". */
function projectFolder(folder: string): string {
  return path.join(claudeConfigDir(), "projects", folder.replace(/[^a-zA-Z0-9]/g, "-"));
}

/** The title Claude gave the conversation (`ai-title`), or the one the person chose with /rename (`custom-title`). */
function titleIn(transcript: string): string | undefined {
  for (const [type, field] of [["custom-title", "customTitle"], ["ai-title", "aiTitle"]] as const) {
    const at = transcript.lastIndexOf(`"type":"${type}"`);
    if (at < 0) continue;
    const start = transcript.lastIndexOf("\n", at) + 1;
    const end = transcript.indexOf("\n", at);
    try {
      const value = (JSON.parse(transcript.slice(start, end < 0 ? undefined : end)) as Record<string, unknown>)[field];
      if (typeof value === "string" && value.trim()) return value.trim();
    } catch { /* a line still being written */ }
  }
  return undefined;
}

/** Titles of Claude Code conversations run in `folder`, newest first. Reads only Claude's own files. */
export async function claudeConversationTitles(folder: string): Promise<ConversationTitle[]> {
  const directory = projectFolder(folder);
  const names = await readdir(directory).catch(() => [] as string[]);
  const files = (await Promise.all(names.filter((name) => name.endsWith(".jsonl")).map(async (name) => {
    const file = path.join(directory, name);
    const info = await stat(file).catch(() => undefined);
    return info?.isFile() ? { file, at: info.mtimeMs, size: info.size } : undefined;
  }))).filter((item) => item !== undefined).sort((a, b) => b.at - a.at).slice(0, NEWEST_FILES);
  const titles = await Promise.all(files.map(async ({ file, at, size }) => {
    const key = `${at}:${size}`;
    const cached = cache.get(file);
    if (cached?.key === key) return cached.title ? { title: cached.title, at } : undefined;
    const title = size > FILE_LIMIT ? undefined : titleIn(await readFile(file, "utf8").catch(() => ""));
    cache.set(file, { key, title });
    return title ? { title, at } : undefined;
  }));
  return titles.filter((item) => item !== undefined);
}
