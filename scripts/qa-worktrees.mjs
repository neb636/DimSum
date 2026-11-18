import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron } from "playwright";
import { assertQaWindowVisibility, qaEnvironment } from "./qa-environment.mjs";

// QA inventory, against a temporary repository and the simulated CLI (no network, no model calls):
// - saved state from before worktrees were listed nests: a session whose cwd was a worktree moves into it, and a
//   worktree once opened as its own workspace goes under its repository;
// - the sidebar's + creates a worktree that opens with a terminal running in the worktree, with its own tabs;
// - Local keeps its own tabs; an agent launched in a New worktree moves into that worktree's row and runs there;
// - Close Worktree keeps the folder, and Existing worktrees reopens one, including one outside `<repo>-worktrees/`;
// - a worktree reads its repository's personal (.local) settings;
// - all of it survives a restart.
const directory = await realpath(await mkdtemp(join(tmpdir(), "workbench-worktrees-qa-")));
const repo = join(directory, "repo");
const container = `${repo}-worktrees`;
const executable = join(directory, "fixture-cli");
const launches = join(directory, "launches.jsonl");
const prompts = join(directory, "prompts.jsonl");
const shots = process.env.QA_SCREENSHOT_DIR ?? directory;
await mkdir(shots, { recursive: true });
const git = (...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const shellQuote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
await mkdir(repo);
execFileSync("git", ["init", "--quiet", "-b", "main", repo]);
git("config", "user.email", "qa@example.com");
git("config", "user.name", "QA");
await writeFile(join(repo, "one.txt"), "one\n");
git("add", ".");
git("commit", "--quiet", "-m", "Initial commit");
// Made the way older versions did: a session's worktree, one opened as a workspace, and one made outside the app.
git("worktree", "add", "--quiet", "-b", "wb/legacy", join(container, "wb-legacy"));
git("worktree", "add", "--quiet", "-b", "opened", join(container, "opened"));
git("worktree", "add", "--quiet", "-b", "elsewhere", join(directory, "elsewhere"));
// The "opened" branch moves ahead, so a worktree created from it is visibly not main.
await writeFile(join(container, "opened", "two.txt"), "two\n");
execFileSync("git", ["add", "."], { cwd: join(container, "opened") });
execFileSync("git", ["commit", "--quiet", "-m", "Ahead"], { cwd: join(container, "opened") });
await mkdir(join(repo, ".dimsum"));
await writeFile(join(repo, ".dimsum", "instructions.local.json"), JSON.stringify({ version: 1, instructions: [] }));
await writeFile(executable, `#!/bin/sh\nexec ${shellQuote(process.execPath)} ${shellQuote(resolve("scripts/fixtures/composer-cli.mjs"))} "$@"\n`, { mode: 0o755 });
const codex = { providerId: "codex.cli", modelSettings: { "codex.cli": { model: "gpt-6-luna", effort: "low" } } };
await writeFile(join(directory, "workbench-state.json"), JSON.stringify({
  workspaces: [
    { id: "qa", name: "repo", path: repo, activeViewId: "legacy", views: [
      { id: "local", workspaceId: "qa", type: "agent", title: "Untitled", state: { ...codex, autoTitle: true } },
      { id: "legacy", workspaceId: "qa", type: "agent", title: "Legacy session", state: { ...codex, cwd: join(container, "wb-legacy"), runIn: { kind: "worktree", branch: "wb/legacy" } } },
    ] },
    { id: "old", name: "opened", path: join(container, "opened"), activeViewId: "old-terminal", views: [
      { id: "old-terminal", workspaceId: "old", type: "terminal", title: "Terminal", state: { providerId: "terminal.local" } },
    ] },
  ],
  activeWorkspaceId: "qa", personas: [], instructionOptions: [], layout: { leftCollapsed: false, rightCollapsed: true },
}));
await writeFile(join(directory, "execution-trust.json"), JSON.stringify([repo]));

const env = qaEnvironment({ WORKBENCH_USER_DATA_DIR: directory, WORKBENCH_CODEX_PATH: executable, WORKBENCH_CLAUDE_PATH: join(directory, "missing-claude"), COMPOSER_QA_LAUNCHES: launches, COMPOSER_QA_LOG: prompts });
let app;
let page;
const errors = [];
const launch = async () => {
  app = await electron.launch({ args: ["."], env });
  page = await app.firstWindow();
  await assertQaWindowVisibility(app);
  page.setDefaultTimeout(10_000);
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
};
const shot = async (name) => {
  await page.waitForTimeout(200);
  const bytes = await app.evaluate(async ({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; const [width, height] = w.getContentSize(); return (await w.capturePage()).resize({ width, height }).toPNG(); });
  await writeFile(join(shots, `${name}.png`), Buffer.from(bytes));
};
const until = async (check, what) => {
  for (let i = 0; i < 150; i += 1) { if (await check()) return; await page.waitForTimeout(100); }
  assert.fail(`Timed out waiting for: ${what}`);
};
const tree = () => page.getByRole("treegrid", { name: "Workspaces" });
const row = (name) => tree().getByRole("row", { name, exact: true });
const level = (name) => row(name).getAttribute("aria-level");
const tab = (name) => page.getByRole("tab", { name, exact: true });
const tabNames = () => page.getByRole("tablist", { name: "Open views" }).getByRole("tab").evaluateAll((tabs) => tabs.map((item) => item.getAttribute("aria-label")));
const savedState = async () => JSON.parse(await readFile(join(directory, "workbench-state.json"), "utf8"));

try {
  await launch();

  // Older state nests: the repository shows Local and both worktrees, and the app reopens on the moved session.
  await row("Local").waitFor();
  await row("wb-legacy").waitFor();
  await row("opened").waitFor();
  assert.equal(await level("repo"), "1");
  assert.equal(await level("Local"), "2");
  assert.equal(await level("wb-legacy"), "2");
  assert.equal(await level("opened"), "2");
  assert.equal(await level("Legacy session"), "3");
  await tab("Legacy session").waitFor();
  assert.deepEqual(await tabNames(), ["Legacy session"]);
  await shot("1-migrated");

  // + on the repository row: a worktree opened with a terminal, which runs in the worktree.
  await row("repo").getByRole("button", { name: "New worktree" }).click();
  const dialog = page.getByRole("dialog", { name: /New worktree/ });
  await dialog.waitFor();
  const branch = dialog.getByRole("textbox", { name: "Branch" });
  await until(async () => (await branch.evaluate((input) => input === document.activeElement)), "the branch field to have focus");
  await branch.fill("qa/terminal");
  await dialog.getByRole("radio", { name: "Terminal" }).or(dialog.getByRole("button", { name: "Terminal" })).click();
  // Worktrees not open in the app are offered.
  await dialog.getByRole("button", { name: "Open elsewhere" }).waitFor();
  assert.equal(await dialog.getByRole("button", { name: "Open wb/legacy" }).count(), 0);
  await shot("2-dialog");
  await dialog.getByRole("button", { name: "Create worktree" }).click();
  await dialog.waitFor({ state: "detached" });
  const terminalFolder = join(container, "qa-terminal");
  assert(existsSync(terminalFolder), "the worktree folder exists");
  await row("qa/terminal").waitFor();
  assert.equal(await level("qa/terminal"), "2");
  await until(async () => JSON.stringify(await tabNames()) === JSON.stringify(["Terminal"]), "the new worktree's own tabs");
  await page.locator(".xterm-helper-textarea").first().waitFor({ state: "attached" });
  await page.locator(".xterm-helper-textarea").first().focus();
  await page.keyboard.type("pwd\n");
  await until(async () => (await page.locator(".xterm-rows").first().innerText()).includes(terminalFolder), "pwd to print the worktree");
  await shot("3-terminal");

  // Local has its own tabs.
  await row("Local").click();
  await until(async () => JSON.stringify(await tabNames()) === JSON.stringify(["Untitled"]), "Local's tabs");

  // A session started in a New worktree moves into that worktree and runs there.
  await page.getByRole("radio", { name: /New worktree/ }).or(page.getByRole("button", { name: /New worktree/ }).filter({ hasText: "New worktree" })).first().click();
  const sessionBranch = await page.getByRole("textbox", { name: "Branch" }).inputValue();
  assert.match(sessionBranch, /^wb\/session-/);
  await page.getByRole("button", { name: "Create from: main" }).click();
  await page.getByRole("option", { name: "opened" }).click();
  await page.getByRole("button", { name: "Create from: opened" }).waitFor();
  await page.getByRole("textbox", { name: "Prompt", exact: true }).fill("Say hello");
  await shot("4-launcher");
  await page.getByRole("button", { name: "Send prompt", exact: true }).click();
  await row(sessionBranch).waitFor();
  assert.equal(await level(sessionBranch), "2");
  const sessionFolder = join(container, sessionBranch.replace(/[^A-Za-z0-9._-]+/g, "-"));
  await until(async () => (await readFile(launches, "utf8").catch(() => "")).includes(JSON.stringify(sessionFolder).slice(1, -1)), "the CLI to launch in the new worktree");
  await until(async () => (await tabNames()).length === 1, "the session to be the worktree's only tab");
  await until(async () => (await readFile(prompts, "utf8").catch(() => "")).includes("Say hello"), "the prompt to reach the CLI");
  assert.equal(JSON.parse((await readFile(prompts, "utf8")).trim().split("\n").at(-1)).cwd, sessionFolder);
  assert.equal(execFileSync("git", ["rev-parse", "HEAD"], { cwd: sessionFolder, encoding: "utf8" }), git("rev-parse", "opened"));
  await row("Say hello").waitFor();
  assert.equal(await level("Say hello"), "3");
  await row("Local").click();
  await until(async () => (await tabNames()).length === 0, "Local to have no tabs left");
  await page.getByRole("button", { name: "Terminal", exact: true }).waitFor();
  await shot("5-moved");

  // A worktree reads its repository's personal settings.
  const layers = await page.evaluate((root) => globalThis.workbench.config.read("instructions", root), sessionFolder);
  assert.equal(layers.local?.path, join(repo, ".dimsum", "instructions.local.json"));

  // Close Worktree keeps the folder; Existing worktrees brings it back.
  await row("qa/terminal").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Close Worktree" }).click();
  const confirm = page.getByRole("alertdialog");
  await confirm.getByRole("heading", { name: "Close worktree" }).waitFor();
  await shot("6-close");
  await confirm.getByRole("button", { name: "Yes, Close Worktree" }).click();
  await row("qa/terminal").waitFor({ state: "detached" });
  assert(existsSync(terminalFolder), "closing keeps the folder");
  await row("repo").getByRole("button", { name: "New worktree" }).click();
  await dialog.getByRole("button", { name: "Open qa/terminal" }).click();
  await row("qa/terminal").waitFor();
  await row("repo").getByRole("button", { name: "New worktree" }).click();
  await dialog.getByRole("button", { name: "Open elsewhere" }).click();
  await row("elsewhere").waitFor();
  assert.equal(await page.locator(".confirm-warning[role=alert]").count(), 0, "the state saved");

  // Saved with each worktree under its repository, and restored that way.
  await until(async () => (await savedState()).workspaces.filter((item) => item.parentId === "qa").length === 5, "the state to save");
  await app.close();
  await launch();
  for (const name of ["Local", "wb-legacy", "opened", "qa/terminal", sessionBranch, "elsewhere"]) assert.equal(await level(name), "2", name);
  await shot("7-restored");
  // The moved session reopens its conversation in its worktree, the only session there.
  const before = (await readFile(launches, "utf8")).trim().split("\n").length;
  await row("Say hello").click();
  await until(async () => (await readFile(launches, "utf8")).trim().split("\n").length > before, "the session to resume");
  const resumed = JSON.parse((await readFile(launches, "utf8")).trim().split("\n").at(-1));
  assert.deepEqual(resumed.argv.slice(0, 2), ["resume", "--last"]);
  assert.equal(resumed.cwd, sessionFolder);
  assert.deepEqual(errors, []);
  console.log("QA passed", shots);
} finally {
  await app?.close();
}
