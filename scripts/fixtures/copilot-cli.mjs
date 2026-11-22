// Terminal frames based on Copilot CLI 1.0.114. The fixture does not launch a model.
import { appendFileSync } from "node:fs";
import { setTimeout } from "node:timers";

const log = (entry) => appendFileSync(process.env.COPILOT_QA_LOG, JSON.stringify(entry) + "\n");
const args = process.argv.slice(2);
log({ type: "launch", args, cwd: process.cwd() });

const write = (text) => process.stdout.write(text);
const at = (row, column = 1) => `\x1b[${row};${column}H`;
const state = (value) => write(`\x1b]7501;state=${value}:app=copilot\x07`);
let mode = args.includes("--resume") ? "picker" : "trust";
let editor = "", input = "", pasting = false;
function draw() {
  const rows = process.stdout.rows;
  write("\x1b[2J\x1b[H [Current]  Sessions   Issues   Pull requests   Gists");
  if (mode === "trust" || mode === "picker" || mode === "permission") {
    const heading = { trust: "Confirm folder trust", picker: "Resume a session", permission: "Allow once or always?" }[mode];
    write(at(rows - 4) + `╭──────────────────────────╮\r\n│ ${heading}\r\n│ ❯ 1. Continue\r\n│ ↑/↓ to navigate · enter to select\r\n╰──────────────────────────╯` + at(rows - 2, 5));
    return;
  }
  const lines = editor.split("\n");
  const rule = "─".repeat(Math.min(process.stdout.columns, 72));
  if (mode === "signed-out") write(at(rows - 4) + "Please use /login to sign in to use Copilot");
  write(at(rows - lines.length - 2) + [rule, ...lines.map((line, i) => `${i ? "  " : "❯ "}${line}`), rule,
    mode === "working" ? " ◎ Working ctrl+c interrupt" : " Interactive · Manual Approval · / commands"].join("\r\n")
    + at(rows - 2, 3 + (lines.at(-1)?.length ?? 0)));
}

process.stdin.setRawMode(true);
process.stdin.setEncoding("utf8");
write("\x1b[?1049h\x1b[?2004h");
state("idle");
draw();
process.stdout.on("resize", draw);
process.stdin.on("data", (chunk) => {
  if (mode === "trust" || mode === "picker" || mode === "permission") {
    log({ type: "decision-input", mode, chunk });
    if (chunk === "\r") { mode = mode === "trust" && !args.some((arg) => arg.startsWith("--resume=")) ? "signed-out" : "ready"; state("idle"); draw(); }
    return;
  }
  if (mode === "signed-out") {
    log({ type: "decision-input", mode, chunk });
    if (chunk === "\r") { mode = "ready"; draw(); }
    return;
  }
  if (mode === "working") {
    if (chunk === "\x03") { log({ type: "interrupt" }); mode = "ready"; state("done"); draw(); }
    return;
  }
  input += chunk;
  if (input.startsWith("\x1b[200~")) { pasting = true; input = input.slice(6); }
  if (pasting) {
    const end = input.indexOf("\x1b[201~");
    if (end === -1) return;
    editor = input.slice(0, end);
    input = input.slice(end + 6);
    pasting = false;
    draw();
  }
  if (input === "\r" && editor) {
    log({ type: "prompt", prompt: editor });
    const permission = editor.startsWith("Permission fixture");
    editor = "";
    mode = "working";
    state("working");
    draw();
    if (permission) setTimeout(() => { mode = "permission"; draw(); }, 350);
  }
  if (!pasting) input = "";
});
