import { _electron as electron } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";
import { assertQaWindowVisibility, qaEnvironment } from "./qa-environment.mjs";

// QA inventory: Claude Code status from its hooks (scripts/fixtures/claude-hooks-cli.mjs), through the lifecycle
// channel. One --settings carries both the hooks and the AI usage status line; a turn with no spinner on screen reads
// as working; a prompt another hook blocks stays ready; a Stop another hook overrules stays working; a permission request with nothing on screen reads as needing input, and answering it in the terminal
// goes back to the screen until the next hook, and one another hook approves reads as working; an interrupt (which sends no hook) falls back to the screen. Runs
// against a fake CLI with its own Claude config folder; no model calls, no network, ~/.claude untouched.
const directory = await realpath(await mkdtemp(join(tmpdir(), "workbench-lifecycle-qa-")));
const repo = join(directory, "repo");
const executable = join(directory, "fixture-claude");
const log = join(directory, "lifecycle.jsonl");
const fixtures = join(directory, "usage-fixtures");
const shellQuote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
await mkdir(repo, { recursive: true });
await mkdir(fixtures);
await mkdir(join(directory, "claude-config"));
execFileSync("git", ["init", "--quiet", "-b", "main", repo]);
await writeFile(executable, `#!/bin/sh\nexec ${shellQuote(process.execPath)} ${shellQuote(resolve("scripts/fixtures/claude-hooks-cli.mjs"))} "$@"\n`, { mode: 0o755 });
// Plan usage reads get a recorded refusal instead of reaching Anthropic.
await writeFile(join(fixtures, "claude.json"), JSON.stringify({ status: 401 }));
await writeFile(join(directory, "workbench-state.json"), JSON.stringify({
  workspaces: [{ id: "qa", name: "Lifecycle QA", path: repo, activeViewId: "agent", views: [
    { id: "agent", workspaceId: "qa", type: "agent", title: "Untitled", state: { providerId: "claude.cli", autoTitle: true } },
  ] }], activeWorkspaceId: "qa",
}));
await writeFile(join(directory, "execution-trust.json"), JSON.stringify([repo]));

let app;
try {
  app = await electron.launch({ args: ["."], env: qaEnvironment({ WORKBENCH_USER_DATA_DIR: directory, WORKBENCH_CLAUDE_PATH: executable,
    WORKBENCH_CODEX_PATH: join(directory, "missing-codex"), CLAUDE_CONFIG_DIR: join(directory, "claude-config"), WORKBENCH_AI_USAGE_FIXTURES: fixtures,
    LIFECYCLE_QA_LOG: log }) });
  const page = await app.firstWindow();
  await assertQaWindowVisibility(app);
  page.setDefaultTimeout(10_000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  const entries = async () => (await readFile(log, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
  const prompt = () => page.getByRole("textbox", { name: "Prompt", exact: true });
  const pill = (label) => page.waitForFunction((text) => document.querySelector(".session-pill")?.textContent.includes(text), label)
    .catch(async (error) => { throw new Error(`Waiting for "${label}", the pill says "${await page.locator(".session-pill").textContent().catch(() => "?")}": ${error.message}`); });
  const rule = async (expected) => {
    await page.locator(".session-pill").hover();
    await page.locator(".wb-tooltip").filter({ hasText: expected }).waitFor();
    await page.mouse.move(0, 0);
  };
  // Every Stop the fixture has sent: a turn's last one arriving late would land in the next turn.
  const stops = async () => (await entries()).filter((entry) => entry.type === "hook" && entry.event === "Stop").length;
  const stopped = async (count) => { for (let i = 0; i < 100 && (await stops()) < count; i++) await page.waitForTimeout(100); assert.equal(await stops(), count); };
  const send = async (text) => {
    await prompt().fill(text);
    await page.getByRole("button", { name: "Send prompt", exact: true }).click();
    await page.waitForFunction(() => document.querySelector(".composer-feedback")?.textContent.includes("Prompt handed"));
  };

  await page.getByRole("button", { name: /Select model/ }).click();
  await page.getByRole("option", { name: "Haiku", exact: true }).click();
  await send("Hello there");
  await stopped(1);
  await pill("Ready");
  // The usage status line and the hooks arrive as one --settings: Claude Code would apply only the last of two.
  const [launch] = (await entries()).filter((entry) => entry.type === "launch");
  assert.equal(launch.settingsFlags, 1);
  assert.deepEqual(launch.keys.sort(), ["hooks", "statusLine"]);
  for (const event of ["SessionStart", "UserPromptSubmit", "PreToolUse", "PermissionRequest", "Stop"]) assert.ok(launch.hookEvents.includes(event), event);

  // No spinner on screen: the hooks alone say the turn runs, and Stop ends it.
  await send("QUIET turn");
  await pill("Working");
  await rule("lifecycle.working");
  await stopped(2);
  await pill("Ready");

  // Another hook rejects the prompt: no turn runs, so the session stays ready rather than waiting for a Stop.
  await send("BLOCKED prompt");
  await page.waitForTimeout(1000);
  await pill("Ready");
  await rule("claude.prompt");

  // Another Stop hook keeps the turn going: the first Stop doesn't end it while the spinner is still on screen.
  await send("CONTINUE turn");
  for (let i = 0; i < 50 && !(await entries()).some((entry) => entry.type === "stop-overruled"); i++) await page.waitForTimeout(100);
  await page.waitForTimeout(200);
  assert.match(await page.locator(".session-pill").textContent(), /Working/);
  await stopped(4);
  await pill("Ready");

  // A permission request the screen doesn't show as a question.
  await send("PERMISSION please");
  await pill("Needs input");
  await rule("Bash needs permission");
  await page.locator(".xterm-helper-textarea").focus();
  await page.waitForTimeout(150);
  await page.keyboard.press("1");
  await stopped(5);
  await pill("Ready");

  // Another hook approves the tool: no question is drawn, so the session reads as working while the tool runs.
  await send("APPROVED tool");
  await page.waitForTimeout(1800);
  assert.match(await page.locator(".session-pill").textContent(), /Working/);
  await page.getByRole("button", { name: "Interrupt" }).waitFor();
  await stopped(6);
  await pill("Ready");

  // Claude sends no hook for an interrupt: the screen decides until the next one.
  await send("INTERRUPT me");
  await pill("Working");
  await page.getByRole("button", { name: "Interrupt" }).click();
  await pill("Ready");
  assert.ok((await entries()).some((entry) => entry.type === "interrupt"));
  assert.equal((await entries()).filter((entry) => entry.type === "prompt").length, 7);
  assert.deepEqual(errors, []);
  console.log(`Agent lifecycle QA passed: ${directory}`);
} finally {
  await app?.close();
}
