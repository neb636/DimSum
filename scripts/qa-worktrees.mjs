import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
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
// - new worktrees are created in DIMSUM_WORKTREES; ones in the older `<repo>-worktrees/` still list, open and are trusted;
// - Close Worktree keeps the folder, and Existing worktrees reopens one, including one outside either worktree folder;
// - a worktree reads its repository's personal (.local) settings;
// - all of it survives a restart;
// - a repository with no worktrees in the sidebar lists its sessions directly, without a Local row;
// - closing a worktree's last session offers to close the worktree too, keeping its folder.
const directory = await realpath(await mkdtemp(join(tmpdir(), "workbench-worktrees-qa-")));
const repo = join(directory, "repo");
// Worktrees from before they moved to ~/dimsum/worktrees, beside the repository; the app still lists and trusts them.
const container = `${repo}-worktrees`;
// Where the app creates new ones: DIMSUM_WORKTREES (set by qaEnvironment), then `<name>-<hash of the repository's path>`.
const created = join(directory, "dimsum-home", "worktrees", `repo-${createHash("sha256").update(repo).digest("hex").slice(0, 8)}`);
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
git("worktree", "add", "--quiet", "-b", "added", join(container, "added"));
// The "opened" branch moves ahead, so a worktree created from it is visibly not main.
await writeFile(join(container, "opened", "two.txt"), "two\n");
execFileSync("git", ["add", "."], { cwd: join(container, "opened") });
execFileSync("git", ["commit", "--quiet", "-m", "Ahead"], { cwd: join(container, "opened") });
// What the once-standalone "opened" workspace kept for itself: a personal instruction in its own folder.
await mkdir(join(container, "opened", ".dimsum"));
const oldInstruction = { id: "old-personal", kind: "toggle", label: "Old personal", defaultOn: true, text: "Kept in the worktree." };
await writeFile(join(container, "opened", ".dimsum", "instructions.local.json"), JSON.stringify({ version: 1, instructions: [oldInstruction] }));
// "elsewhere" is open as a workspace of its own (Choose Directory), with a personal setting of its own.
await mkdir(join(directory, "elsewhere", ".dimsum"));
await writeFile(join(directory, "elsewhere", ".dimsum", "settings.local.json"), JSON.stringify({ version: 1, extensions: { disabled: ["workspace:qa-off"] } }));
await mkdir(join(repo, ".dimsum"));
await writeFile(join(repo, ".dimsum", "instructions.local.json"), JSON.stringify({ version: 1, instructions: [] }));
// A second repository with no worktrees and one session.
const solo = join(directory, "solo");
execFileSync("git", ["init", "--quiet", "-b", "main", solo]);
await writeFile(executable, `#!/bin/sh\nexec ${shellQuote(process.execPath)} ${shellQuote(resolve("scripts/fixtures/composer-cli.mjs"))} "$@"\n`, { mode: 0o755 });
const codex = { providerId: "codex.cli", modelSettings: { "codex.cli": { model: "gpt-6-luna", effort: "low" } } };
await writeFile(join(directory, "workbench-state.json"), JSON.stringify({
  workspaces: [
    { id: "qa", name: "repo", path: repo, activeViewId: "legacy", views: [
      { id: "local", workspaceId: "qa", type: "agent", title: "Untitled", state: { ...codex, autoTitle: true } },
      { id: "legacy", workspaceId: "qa", type: "agent", title: "Legacy session", state: { ...codex, cwd: join(container, "wb-legacy"), runIn: { kind: "worktree", branch: "wb/legacy" } } },
    ] },
    { id: "old", name: "opened", path: join(container, "opened"), disabledInstructionIds: ["turned-off-there"], activeViewId: "old-terminal", views: [
      { id: "old-terminal", workspaceId: "old", type: "terminal", title: "Terminal", state: { providerId: "terminal.local" } },
    ] },
    { id: "standalone", name: "elsewhere", path: join(directory, "elsewhere"), activeViewId: "standalone-terminal", views: [
      { id: "standalone-terminal", workspaceId: "standalone", type: "terminal", title: "Elsewhere shell", state: { providerId: "terminal.local" } },
    ] },
    { id: "solo", name: "solo", path: solo, activeViewId: "solo-session", views: [
      { id: "solo-session", workspaceId: "solo", type: "agent", title: "Solo session", state: { ...codex } },
    ] },
  ],
  activeWorkspaceId: "qa", personas: [{ id: "old-persona", name: "Old persona", description: "", instructions: "Be brief.", scope: "workspace", workspaceId: "old" }],
  instructionOptions: [], layout: { leftCollapsed: false, rightCollapsed: true },
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
// The repository's rows come first; "elsewhere", open on its own at the start, has a Local row of its own until adopted.
const row = (name) => tree().getByRole("row", { name, exact: true }).first();
const level = (name) => row(name).getAttribute("aria-level");
const newWorktree = async () => {
  // The + is always on the repository's row, like the tree's other row actions.
  await row("repo").getByRole("button", { name: "New worktree" }).click();
};
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
  // What it kept for itself now belongs to the repository, whose settings its worktrees share.
  const personal = JSON.parse(await readFile(join(repo, ".dimsum", "instructions.local.json"), "utf8"));
  assert.deepEqual(personal.instructions.map((item) => item.id), ["old-personal"]);
  // A repository without worktrees lists its sessions directly.
  assert.equal(await level("solo"), "1");
  assert.equal(await level("Solo session"), "2");
  await shot("1-migrated");

  // + on the repository row: a worktree opened with a terminal, which runs in the worktree.
  await newWorktree();
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
  const terminalFolder = join(created, "qa-terminal");
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
  const sessionFolder = join(created, sessionBranch.replace(/[^A-Za-z0-9._-]+/g, "-"));
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
  await newWorktree();
  await dialog.getByRole("button", { name: "Open qa/terminal" }).click();
  await row("qa/terminal").waitFor();
  await newWorktree();
  // Open on its own until now: it moves under the repository with its tabs, and its personal settings join the repository's.
  assert.equal(await level("elsewhere"), "1");
  await dialog.getByRole("button", { name: "Open elsewhere" }).click();
  await until(async () => (await level("elsewhere")) === "2", "the open workspace to become a worktree");
  assert.equal(await tree().getByRole("row", { name: "elsewhere", exact: true }).count(), 1);
  assert.equal(await tree().getByRole("row", { name: "Local", exact: true }).count(), 1);
  assert.deepEqual(await tabNames(), ["Elsewhere shell"]);
  const repoSettings = JSON.parse(await readFile(join(repo, ".dimsum", "settings.local.json"), "utf8"));
  assert.deepEqual(repoSettings.extensions.disabled, ["workspace:qa-off"]);
  // Its instructions are read again from the repository's personal layer straight away, without a restart.
  await page.getByRole("button", { name: "Create view" }).click();
  await page.getByRole("menuitem", { name: /Agent session/ }).click();
  await page.getByRole("button", { name: /^Instructions/ }).click();
  await page.getByRole("switch", { name: /Old personal/ }).waitFor();
  await page.keyboard.press("Escape");

  // Add workspace on a folder in <repo>-worktrees/ lists it as a worktree, reading the repository's personal layer at once.
  await app.evaluate(({ dialog }, chosen) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [chosen] }); }, join(container, "added"));
  await page.getByRole("button", { name: "Add workspace" }).click();
  await row("added").waitFor();
  assert.equal(await level("added"), "2");
  await page.getByRole("button", { name: /^Instructions/ }).click();
  await page.getByRole("switch", { name: /Old personal/ }).waitFor();
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".confirm-warning[role=alert]").count(), 0, "the state saved");

  // So does one in the repository's DIMSUM_WORKTREES folder, which main recognizes by where it sits.
  git("worktree", "add", "--quiet", "-b", "picked", join(created, "picked"));
  await app.evaluate(({ dialog }, chosen) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [chosen] }); }, join(created, "picked"));
  await page.getByRole("button", { name: "Add workspace" }).click();
  await row("picked").waitFor();
  assert.equal(await level("picked"), "2");

  // Saved with each worktree under its repository, and restored that way.
  await until(async () => (await savedState()).workspaces.filter((item) => item.parentId === "qa").length === 7, "the state to save");
  const saved = await savedState();
  assert.equal(saved.personas.find((item) => item.id === "old-persona").workspaceId, "qa");
  assert(saved.workspaces.find((item) => item.id === "qa").disabledInstructionIds.includes("turned-off-there"));
  await app.close();
  await launch();
  for (const name of ["Local", "wb-legacy", "opened", "qa/terminal", sessionBranch, "elsewhere", "added", "picked"]) assert.equal(await level(name), "2", name);
  await shot("7-restored");
  // The moved session reopens its conversation in its worktree, the only session there.
  const before = (await readFile(launches, "utf8")).trim().split("\n").length;
  await row("Say hello").click();
  await until(async () => (await readFile(launches, "utf8")).trim().split("\n").length > before, "the session to resume");
  const resumed = JSON.parse((await readFile(launches, "utf8")).trim().split("\n").at(-1));
  assert.deepEqual(resumed.argv.slice(0, 2), ["resume", "--last"]);
  assert.equal(resumed.cwd, sessionFolder);

  // Closing the worktree's last session offers to close the worktree too; its folder stays.
  await row("Say hello").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Close", exact: true }).click();
  const closing = page.getByRole("alertdialog");
  const alsoClose = closing.getByRole("checkbox", { name: new RegExp(`Also close the worktree ${sessionBranch}`) });
  await alsoClose.waitFor({ state: "attached" });
  assert.equal(await alsoClose.isChecked(), true);
  await shot("8-close-last-session");
  await closing.getByRole("button", { name: "Yes, Close Session" }).click();
  await row(sessionBranch).waitFor({ state: "detached" });
  assert(existsSync(sessionFolder), "closing the worktree keeps its folder");
  // Back on another worktree, for a look at the tidied sidebar.
  await row("elsewhere").click();
  await shot("9-after-close");
  assert.deepEqual(errors, []);
  console.log("QA passed", shots);
} finally {
  await app?.close();
}
