/* global window */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron } from "playwright";
import { assertQaWindowVisibility, qaEnvironment } from "./qa-environment.mjs";

const profile = await realpath(await mkdtemp(join(tmpdir(), "dimsum-copilot-qa-")));
const repo = join(profile, "repo");
const executable = join(profile, "fixture-copilot");
const log = join(profile, "copilot.jsonl");
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
await mkdir(repo);
await writeFile(executable, `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(resolve("scripts/fixtures/copilot-cli.mjs"))} "$@"\n`, { mode: 0o755 });
await writeFile(join(profile, "workbench-state.json"), JSON.stringify({
  activeWorkspaceId: "repo", workspaces: [{
    id: "repo", name: "Copilot QA", path: repo, activeViewId: "chat",
    views: [{ id: "chat", workspaceId: "repo", type: "agent", title: "Copilot QA", state: { providerId: "copilot.cli", autoTitle: true } }],
  }],
}));
await writeFile(join(profile, "execution-trust.json"), JSON.stringify([repo]));

const entries = async () => (await readFile(log, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
let app;
const launch = async () => {
  app = await electron.launch({ args: ["."], env: qaEnvironment({
    WORKBENCH_USER_DATA_DIR: profile, WORKBENCH_COPILOT_PATH: executable, COPILOT_QA_LOG: log,
    WORKBENCH_CODEX_PATH: join(profile, "missing-codex"), WORKBENCH_CLAUDE_PATH: join(profile, "missing-claude"),
  }) });
  const page = await app.firstWindow();
  await assertQaWindowVisibility(app);
  page.setDefaultTimeout(12_000);
  return page;
};
try {
  let page = await launch();
  const prompt = () => page.getByRole("textbox", { name: "Prompt", exact: true });
  const send = () => page.getByRole("button", { name: "Send prompt", exact: true }).click();
  const status = (name) => page.getByRole("button", { name: `Session status: ${name}`, exact: true }).waitFor();
  const terminalKey = async (key) => {
    await page.locator(".xterm-helper-textarea").focus();
    await page.keyboard.press(key);
  };

  await page.getByRole("radio", { name: /GitHub Copilot CLI/ }).waitFor();
  const providers = await page.evaluate(() => window.workbench.agent.providers());
  assert.equal(providers.find((provider) => provider.id === "copilot.cli")?.available, true);
  assert.equal(providers.find((provider) => provider.id === "copilot.cli")?.supportsInternalAi, false);
  await page.getByRole("button", { name: "Start session", exact: true }).click();
  await status("Needs input");
  await prompt().fill("Reply with OK.\nUse no tools.");
  await send();
  assert.deepEqual((await entries()).map((entry) => entry.type), ["launch"]);
  await terminalKey("Enter");
  await page.waitForFunction(() => window.document.querySelector(".terminal-card")?.textContent?.includes("Please use /login"));
  await status("Needs input");
  assert.deepEqual((await entries()).map((entry) => entry.type), ["launch", "decision-input"]);
  await terminalKey("Enter");
  await status("Working");
  await page.waitForFunction(() => window.document.querySelector('textarea[aria-label="Prompt"]')?.value === "");
  await page.getByRole("button", { name: "Interrupt", exact: true }).click();
  await status("Ready");
  // A native draft with its cursor on a blank first line still owns the editor.
  await terminalKey("d");
  await page.getByText("A draft is already in the terminal. Send or clear it there first.", { exact: true }).waitFor();
  await terminalKey("Control+c");
  await prompt().fill("$");
  await send();
  await page.getByText(/Use native commands directly in the terminal/).waitFor();
  assert.equal(await prompt().inputValue(), "$");
  await prompt().fill("Permission fixture");
  await send();
  await status("Needs input");
  await prompt().fill("Draft while permission is open");
  assert.deepEqual((await entries()).filter((entry) => entry.type === "prompt").map((entry) => entry.prompt),
    ["Reply with OK.\nUse no tools.", "Permission fixture"]);
  const [firstLaunch] = await entries();
  assert.equal(firstLaunch.cwd, repo);
  assert.match(firstLaunch.args[0], /^--session-id=[a-f0-9-]{36}$/);
  assert.equal(firstLaunch.args.length, 1);
  assert.equal((await entries()).filter((entry) => entry.type === "interrupt").length, 1);
  assert.deepEqual((await entries()).filter((entry) => entry.type === "decision-input").map(({ mode, chunk }) => ({ mode, chunk })),
    [{ mode: "trust", chunk: "\r" }, { mode: "signed-out", chunk: "\r" }]);

  await app.close();
  page = await launch();
  await status("Needs input");
  const launches = (await entries()).filter((entry) => entry.type === "launch");
  assert.deepEqual(launches[1].args, [firstLaunch.args[0].replace("--session-id=", "--resume=")]);
  assert.equal(await prompt().inputValue(), "Draft while permission is open");
  console.log(`Copilot CLI QA passed: ${profile}`);
} finally {
  await app?.close();
}
