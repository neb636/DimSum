// Deterministic Claude Code stand-in for lifecycle QA; no model calls. It draws Claude's input prompt and runs the hooks
// it is given through --settings the way Claude Code does (`sh -c`, the event's JSON on stdin), so status can come
// from hooks while the screen alone would say something else.
//   QUIET       working with no spinner on screen for 2.5 s, then Stop
//   PERMISSION  a permission request with nothing on screen that reads as a question; any key answers it
//   INTERRUPT   working with no spinner, and no Stop after Esc (as Claude Code does)
//   otherwise   a spinner for 0.7 s, then Stop
import { appendFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { setTimeout } from "node:timers";

// The model list and one-shot runs use -p; this fixture offers neither.
if (process.argv.includes("-p")) process.exit(1);

const argv = process.argv.slice(2);
const settings = argv.flatMap((arg, index) => (argv[index - 1] === "--settings" ? [arg] : []));
const merged = settings.length ? JSON.parse(settings.at(-1)) : {};
appendFileSync(process.env.LIFECYCLE_QA_LOG, JSON.stringify({ type: "launch", settingsFlags: settings.length, keys: Object.keys(merged), hookEvents: Object.keys(merged.hooks ?? {}) }) + "\n");

let chain = Promise.resolve();
// One after another, as Claude Code waits for each synchronous hook.
const fire = (event, extra = {}) => {
  chain = chain.then(() => Promise.all((merged.hooks?.[event] ?? []).flatMap((group) => group.hooks).filter((hook) => hook.type === "command").map((hook) => new Promise((resolve) => {
    const child = spawn("/bin/sh", ["-c", hook.command], { stdio: ["pipe", "ignore", "ignore"] });
    child.on("exit", resolve);
    child.stdin.end(JSON.stringify({ session_id: "fixture", hook_event_name: event, cwd: process.cwd(), permission_mode: "default", ...extra }));
  }))));
  return chain;
};

process.stdin.setRawMode(true);
process.stdin.setEncoding("utf8");
const screen = (text) => process.stdout.write(`\x1b[2J\x1b[H\x1b[?2004hClaude fixture\r\n\r\n${text}`);
const ready = () => screen("❯ ");
let pending = "", prompt = "", waiting = false;
const log = (entry) => appendFileSync(process.env.LIFECYCLE_QA_LOG, JSON.stringify(entry) + "\n");

ready();
await fire("SessionStart", { source: "startup" });
process.stdin.on("data", (data) => {
  if (data === "\x1b" || data === "\x03") { log({ type: "interrupt" }); pending = ""; prompt = ""; ready(); return; }
  if (waiting) {
    waiting = false;
    void fire("PostToolUse", { tool_name: "Bash" });
    setTimeout(() => void fire("Stop"), 1500);
    return;
  }
  // eslint-disable-next-line no-control-regex
  pending += data.replace(/\x1b\[<\d+;\d+;\d+[Mm]/g, "");
  const start = pending.indexOf("\x1b[200~");
  const end = pending.indexOf("\x1b[201~");
  if (start >= 0 && end >= start) {
    prompt = pending.slice(start + 6, end);
    pending = pending.slice(end + 6);
    screen("❯ pasted draft");
  }
  if (!pending.includes("\r") || !prompt) return;
  const sent = prompt;
  pending = ""; prompt = "";
  log({ type: "prompt", prompt: sent });
  ready();
  void fire("UserPromptSubmit", { prompt: sent }).then(() => {
    if (sent.includes("QUIET")) setTimeout(() => void fire("Stop"), 2500);
    else if (sent.includes("PERMISSION")) { waiting = true; void fire("PreToolUse", { tool_name: "Bash" }).then(() => fire("PermissionRequest", { tool_name: "Bash" })); }
    else if (sent.includes("INTERRUPT")) { /* no Stop follows an interrupt */ }
    else { screen("✻ Thinking… (esc to interrupt)\r\n❯ "); setTimeout(() => { ready(); void fire("Stop"); }, 700); }
  });
});
