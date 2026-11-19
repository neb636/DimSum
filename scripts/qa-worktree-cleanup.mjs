import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, realpath, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron } from "playwright";
import { assertQaWindowVisibility, qaEnvironment } from "./qa-environment.mjs";

// QA inventory, against a temporary repository (no network, no model calls):
// - Manage Worktrees… opens from the workspace menu and from the New worktree dialog;
// - the clean-up offers only worktrees idle past the chosen age, leaving out ones with uncommitted changes, open in the
//   sidebar, or locked, and deleting them keeps their branches;
// - several selected worktrees delete at once, uncommitted changes included after a warning;
// - one deleted from its row that is open in the sidebar closes there first.
const directory = await realpath(await mkdtemp(join(tmpdir(), "workbench-worktree-cleanup-qa-")));
const repo = join(directory, "repo");
const container = `${repo}-worktrees`;
const shots = process.env.QA_SCREENSHOT_DIR ?? directory;
await mkdir(shots, { recursive: true });
const git = (...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
await mkdir(repo);
execFileSync("git", ["init", "--quiet", "-b", "main", repo]);
git("config", "user.email", "qa@example.com");
git("config", "user.name", "QA");
await writeFile(join(repo, "one.txt"), "one\n");
git("add", ".");
git("commit", "--quiet", "-m", "Initial commit");
const month = new Date(Date.now() - 40 * 86_400_000);
const add = async (name, age) => {
  git("worktree", "add", "--quiet", "-b", `wb/${name}`, join(container, name));
  if (!age) return;
  const admin = join(repo, ".git", "worktrees", name);
  for (const file of ["HEAD", join("logs", "HEAD")]) await utimes(join(admin, file), age, age);
};
await add("idle", month);
await add("idle-dirty", month);
await add("idle-open", month);
await add("idle-locked", month);
await add("fresh");
const scratch = join(container, "idle-dirty", "notes.txt");
await writeFile(scratch, "work in progress\n");
await utimes(scratch, month, month);
git("worktree", "lock", join(container, "idle-locked"));
await writeFile(join(directory, "workbench-state.json"), JSON.stringify({
  workspaces: [
    { id: "qa", name: "repo", path: repo, views: [] },
    { id: "open", name: "wb/idle-open", path: join(container, "idle-open"), parentId: "qa", activeViewId: "t", views: [
      { id: "t", workspaceId: "open", type: "terminal", title: "Idle shell", state: { providerId: "terminal.local" } },
    ] },
  ],
  activeWorkspaceId: "qa", personas: [], instructionOptions: [], layout: { leftCollapsed: false, rightCollapsed: true },
}));
await writeFile(join(directory, "execution-trust.json"), JSON.stringify([repo]));

const app = await electron.launch({ args: ["."], env: qaEnvironment({ WORKBENCH_USER_DATA_DIR: directory }) });
const errors = [];
try {
  const page = await app.firstWindow();
  await assertQaWindowVisibility(app);
  page.setDefaultTimeout(10_000);
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  const shot = async (name) => {
    await page.waitForTimeout(250);
    const bytes = await app.evaluate(async ({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; const [width, height] = w.getContentSize(); return (await w.capturePage()).resize({ width, height }).toPNG(); });
    await writeFile(join(shots, `${name}.png`), Buffer.from(bytes));
  };
  const tree = () => page.getByRole("treegrid", { name: "Workspaces" });
  const row = (name) => tree().getByRole("row", { name, exact: true }).first();
  const manager = page.getByRole("dialog", { name: "Worktrees of repo" });
  const list = manager.getByRole("grid");
  const item = (name) => list.getByRole("row", { name, exact: true });
  const confirm = page.getByRole("alertdialog");

  // The + shows once the folder is known to support worktrees, as does the menu item.
  await row("repo").getByRole("button", { name: "New worktree" }).waitFor();
  await row("repo").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Manage Worktrees…" }).click();
  await item("wb/fresh").waitFor();
  assert.equal(await list.getByRole("row").count(), 5);
  // Least recently used first; the fresh one is last.
  assert.match(await list.getByRole("row").last().innerText(), /wb\/fresh/);
  await manager.getByText("1 worktree has had no commits or file changes in the last 2 weeks.").waitFor();
  await manager.getByText("2 more are left alone", { exact: false }).waitFor();
  assert(await item("wb/idle-open").getByText("Open", { exact: true }).isVisible());
  assert(await item("wb/idle-dirty").getByText("1 change").isVisible());
  assert(await item("wb/idle-locked").getByText("Locked", { exact: true }).isVisible());
  await shot("1-manager");

  const cleanup = manager.getByRole("button", { name: "Delete 1 idle" });
  await cleanup.hover();
  await shot("2-cleanup-preview");
  await cleanup.click();
  await confirm.getByRole("heading", { name: "Delete worktree" }).waitFor();
  await shot("3-confirm-one");
  await confirm.getByRole("button", { name: "Yes, Delete Worktree" }).click();
  await manager.getByText("Deleted 1 worktree. Its branch was kept.").waitFor();
  assert(!existsSync(join(container, "idle")), "the idle worktree's folder is gone");
  assert.match(git("branch", "--list", "wb/idle"), /wb\/idle/);
  assert.equal(await list.getByRole("row").count(), 4);
  await manager.getByRole("button", { name: "Nothing idle" }).waitFor();

  // A longer age leaves nothing; a shorter one still only the same kind.
  await manager.getByRole("radio", { name: "1 month" }).or(manager.getByRole("button", { name: "1 month" })).click();
  await manager.getByText("2 idle worktrees have uncommitted changes", { exact: false }).waitFor();

  // Several at once, uncommitted changes included.
  await item("wb/idle-dirty").locator(".checkbox-box").click();
  await item("wb/fresh").locator(".checkbox-box").click();
  await manager.getByText("2 selected").waitFor();
  await shot("4-selected");
  await manager.getByRole("button", { name: "Delete 2", exact: true }).click();
  await confirm.getByRole("heading", { name: "Delete 2 worktrees" }).waitFor();
  await confirm.getByText("1 of them has uncommitted changes, which will be lost.").waitFor();
  await shot("5-confirm-many");
  await confirm.getByRole("button", { name: "Yes, Delete 2" }).click();
  await manager.getByText("Deleted 2 worktrees. Their branches were kept.").waitFor();
  assert(!existsSync(join(container, "idle-dirty")) && !existsSync(join(container, "fresh")));

  // One open in the sidebar closes there, then goes.
  assert(await row("wb/idle-open").isVisible());
  await item("wb/idle-open").hover();
  await item("wb/idle-open").getByRole("button", { name: "Delete wb/idle-open" }).click();
  await confirm.getByText(/open in the sidebar/).first().waitFor();
  await confirm.getByRole("button", { name: "Yes, Delete Worktree" }).click();
  await row("wb/idle-open").waitFor({ state: "detached" });
  await manager.getByText("Deleted 1 worktree.", { exact: false }).waitFor();
  assert(!existsSync(join(container, "idle-open")));

  // The locked one can't be selected or deleted.
  assert.equal(await list.getByRole("row").count(), 1);
  assert(await item("wb/idle-locked").getByRole("button", { name: /Locked worktrees/ }).isDisabled());
  await shot("6-after");
  await manager.getByRole("button", { name: "Done" }).click();
  await manager.waitFor({ state: "detached" });

  // From the New worktree dialog.
  await row("repo").getByRole("button", { name: "New worktree" }).click();
  const create = page.getByRole("dialog", { name: /New worktree/ });
  await create.getByRole("button", { name: "Manage worktrees…" }).click();
  await create.waitFor({ state: "detached" });
  await item("wb/idle-locked").waitFor();
  await shot("7-from-new");
  assert.deepEqual(errors, []);
  console.log(`Worktree clean-up QA passed. Screenshots: ${shots}`);
} finally {
  await app.close();
  git("worktree", "unlock", join(container, "idle-locked"));
}
