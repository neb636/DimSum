import type { AgentLifecycle, LifecycleReport } from "../agent-provider";

/**
 * Claude Code's hooks, given for one session through --settings, report its lifecycle; the person's own hooks still
 * run beside them (hooks from every settings source merge). Stop does not run when the person interrupts a turn, and
 * no hook says so: the session manager goes back to the screen after an interrupt until the next hook arrives.
 */
const EVENTS = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "PostToolUseFailure", "PermissionRequest", "PermissionDenied",
  "Notification", "Stop", "StopFailure"];
/**
 * Notification types that mean the person has to answer something. Not permission_prompt: it comes about 6 s late,
 * possibly after the answer, and PermissionRequest already says so. idle_prompt comes about a minute after a reply.
 */
const ASKS = new Set(["elicitation_dialog", "elicitation_url_dialog"]);

function report(message: unknown): LifecycleReport | undefined {
  if (!message || typeof message !== "object") return undefined;
  const event = message as { hook_event_name?: unknown; source?: unknown; notification_type?: unknown; tool_name?: unknown; agent_id?: unknown };
  const tool = typeof event.tool_name === "string" ? event.tool_name.slice(0, 80) : undefined;
  // A subagent's tools (one may run in the background after the turn ended) say nothing about the main turn.
  const subagent = typeof event.agent_id === "string" && event.agent_id !== "";
  switch (event.hook_event_name) {
    // Compaction can happen in the middle of a turn; the others open a conversation that waits for a prompt.
    case "SessionStart": return event.source === "compact" ? undefined : { activity: "ready" };
    case "UserPromptSubmit": return { activity: "working", submitted: true };
    case "PreToolUse": case "PostToolUse": case "PostToolUseFailure": case "PermissionDenied":
      return subagent ? undefined : { activity: "working", detail: tool && `Running ${tool}` };
    case "PermissionRequest": return { activity: "waiting-for-input", detail: tool && `${tool} needs permission` };
    case "Notification":
      if (event.notification_type === "idle_prompt") return { activity: "ready" };
      return typeof event.notification_type === "string" && ASKS.has(event.notification_type) ? { activity: "waiting-for-input" } : undefined;
    case "Stop": case "StopFailure": return { activity: "ready" };
    default: return undefined;
  }
}

export const claudeLifecycle: AgentLifecycle = {
  // Synchronous, so messages arrive in the order they happened; curl to a local socket takes milliseconds.
  args: (forward) => ["--settings", JSON.stringify({ hooks: Object.fromEntries(EVENTS.map((event) => [event, [{ hooks: [{ type: "command", command: forward, timeout: 5 }] }]])) })],
  parse: report,
};

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);

function merge(into: Json, from: Json): Json {
  const out: Json = { ...into };
  for (const [key, value] of Object.entries(from)) {
    const current = out[key];
    out[key] = isObject(current) && isObject(value) ? merge(current, value)
      : Array.isArray(current) && Array.isArray(value) ? [...current, ...value] : value;
  }
  return out;
}

/**
 * Claude Code applies only the last --settings it is given, so features that each add one (hooks, the usage status
 * line) would drop each other's. Every inline JSON value is merged into one, in order; a settings file path is left as given.
 */
export function mergeClaudeSettings(args: string[]): string[] {
  const out: string[] = [];
  let merged: Json | undefined;
  let at = -1;
  for (let index = 0; index < args.length; index++) {
    let value: unknown;
    if (args[index] === "--settings" && index + 1 < args.length) {
      try { value = JSON.parse(args[index + 1]); } catch { value = undefined; }
    }
    if (!isObject(value)) { out.push(args[index]); continue; }
    if (at < 0) { at = out.length; out.push("--settings", ""); }
    merged = merge(merged ?? {}, value);
    index++;
  }
  if (merged) out[at + 1] = JSON.stringify(merged);
  return out;
}
