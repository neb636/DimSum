import type { AgentDetection, AgentProviderAdapter, AgentSubmission, ScreenObservation } from "../agent-provider";
import type { AgentPromptRequest, AgentResume } from "../../shared/models";
import { pasteChunks } from "./cli-screen";

const divider = /^─{3,}$/;
const idleFooter = /(?:^|·)\s*(?:Interactive|Plan|Autopilot)\s*·/;
const interruptHint = /\bctrl\+c interrupt\b/i;
const decision = /Confirm folder trust|Do you trust the files|enter to select|allow (?:once|always)|No, and tell Copilot|(?:use|run) \/login|sign in to (?:GitHub|use Copilot)/i;

function detectCopilotScreen(screen: ScreenObservation): AgentDetection {
  const result = (activity: AgentDetection["activity"], inputState: AgentDetection["inputState"], rule: string, reason: string): AgentDetection =>
    ({ activity, inputState, canSubmit: activity === "ready" && inputState === "empty", rule: `copilot.${rule}`, reason });
  let last = screen.lines.length - 1;
  while (last >= 0 && !screen.lines[last].trim()) last--;
  const status = screen.lines[last] ?? "";
  // A selected dialog option and transcript messages can also start with ❯. The editor is framed by
  // horizontal rules and ends at the native status bar, with its cursor inside that frame.
  const bottom = last - 1;
  let top = screen.cursorY;
  while (top >= 0 && (!screen.lines[top].trim() || /^ {2}/.test(screen.lines[top]))) top--;
  const prompt = /^❯(.*)$/.exec(screen.lines[top] ?? "");
  const editor = top < bottom && screen.cursorY < bottom
    && divider.test(screen.lines[top - 1] ?? "") && divider.test(screen.lines[bottom] ?? "")
    && (idleFooter.test(status) || interruptHint.test(status));
  if (!prompt || !editor || !screen.bracketedPaste) {
    if (decision.test(screen.lines.slice(Math.max(0, last - 18), last + 1).join("\n"))) {
      return result("waiting-for-input", "unavailable", "decision", "Continue in the Copilot terminal.");
    }
    return result("unknown", "unavailable", "unmatched", "Use the terminal until Copilot’s prompt is recognized.");
  }
  // Copilot leaves its composer visible when signed out. The login banner sits just above its workspace line
  // and can wrap in a narrow terminal.
  const context = screen.lines.slice(Math.max(0, top - 8), top - 1).map((line) => line.trim()).join(" ");
  if (/Please use \/login to sign in to use Copilot/i.test(context)) {
    return result("waiting-for-input", "unavailable", "sign-in", "Sign in with /login in the Copilot terminal.");
  }
  // An empty editor occupies one row. A multiline draft can have a blank prompt row with its cursor on it.
  const empty = top + 1 === bottom && !prompt[1].trim();
  const inputState = empty ? "empty" : "draft";
  if (screen.reportedState === "working" || interruptHint.test(status)) {
    return result("working", inputState, "working", "Wait until Copilot finishes, or queue a prompt in the terminal.");
  }
  return empty ? result("ready", "empty", "prompt", "Ready for a prompt.")
    : result("ready", "draft", "native-draft", "A draft is already in the terminal. Send or clear it there first.");
}

export class CopilotAgentProvider implements AgentProviderAdapter {
  readonly id = "copilot.cli";
  readonly label = "GitHub Copilot CLI";
  readonly executable = process.env.WORKBENCH_COPILOT_PATH ?? "copilot";
  readonly interrupt = "\x03";
  readonly startupSettleMs = 1000;
  readonly detect = detectCopilotScreen;
  // Copilot's OSC states are idle, working and done. Its screen still determines whether input is safe.
  readonly reportedState = { osc: 7501, parse: (data: string) => {
    const match = /^state=(idle|working|done):app=copilot$/.exec(data);
    return match ? (match[1] === "working" ? "working" as const : "idle" as const) : undefined;
  } };

  args(resume?: AgentResume): string[] {
    if (!resume) return [];
    if (resume.kind === "id") return [`--resume=${resume.id}`];
    // --continue can fall back to a conversation from a different directory.
    return ["--resume"];
  }

  conversationArgs(id: string): string[] { return [`--session-id=${id}`]; }

  submit(request: AgentPromptRequest): AgentSubmission {
    if (request.prompt.trim() === "$") throw new Error("Use native commands directly in the terminal.");
    return { paste: pasteChunks(request.prompt) };
  }
}
