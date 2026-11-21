import { _electron as electron } from "playwright";
import { mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { assertQaWindowVisibility, qaEnvironment } from "./qa-environment.mjs";

// QA inventory, with no CLI and no model use. HTML and Markdown file tabs have Code (default) and Preview:
// - Code is the default; Preview remembers itself per tab and Code brings the same editor back with its edits.
// - An HTML report loads its relative stylesheet, script and data (fetch), runs inline scripts, and has no preload,
//   no access to the app, and can't read .git or fetch from the web. It reloads when the file changes on disk.
// - Markdown renders sanitized (no scripts), with pictures beside it, heading anchors, and workspace links that open tabs.
const directory = await realpath(await mkdtemp(join(tmpdir(), "workbench-file-preview-qa-")));
const shots = process.env.QA_SHOTS ?? directory;
const repo = join(directory, "repo");
await mkdir(join(repo, "reports", "assets"), { recursive: true });
await mkdir(join(repo, ".git"), { recursive: true });
await writeFile(join(repo, ".git", "config"), "[core]\nsecret = yes\n");
await writeFile(join(repo, "reports", "assets", "style.css"), "body { font: 15px sans-serif; } #styled { color: rgb(1, 2, 3); }");
await writeFile(join(repo, "reports", "assets", "app.js"), "document.getElementById('external').textContent = 'external script ran';");
await writeFile(join(repo, "reports", "data.json"), JSON.stringify({ rows: 42 }));
const report = (version) => `<!doctype html><meta charset="utf-8"><title>Report</title>
<link rel="stylesheet" href="assets/style.css">
<h1 id="styled">Weekly report v${version}</h1><p id="external">pending</p><p id="probe">probing</p>
<script src="assets/app.js"></script>
<script>
  (async () => {
    const result = { preload: typeof window.workbench, parent: "refused" };
    try { result.parent = typeof parent.workbench; } catch {}
    result.data = await fetch("data.json").then((r) => r.json()).then((d) => d.rows, (e) => "failed");
    result.git = await fetch("../.git/config").then((r) => r.status, () => "failed");
    result.web = await fetch("https://example.com/").then(() => "fetched", () => "blocked");
    document.getElementById("probe").textContent = JSON.stringify(result);
  })();
</script>`;
await writeFile(join(repo, "reports", "weekly.html"), report(1));
// A 1×1 PNG.
await writeFile(join(repo, "docs-pixel.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
await writeFile(join(repo, "README.md"), `# Project notes

[Jump to details](#more-details) · [Weekly report](reports/weekly.html) · [Web](https://example.com/)

![pixel](docs-pixel.png)

| Column | Value |
| --- | --- |
| a | 1 |

<script>window.qaInjected = true</script><img src="x" onerror="window.qaInjected = true">

## More details

- [x] done
- [ ] todo

\`\`\`js
console.log("hi");
\`\`\`
`);
await writeFile(join(directory, "workbench-state.json"), JSON.stringify({
  workspaces: [{ id: "qa", name: "Preview QA", path: repo, activeViewId: "html", views: [
    { id: "html", workspaceId: "qa", type: "file", title: "weekly.html", state: { root: repo, path: "reports/weekly.html" } },
    { id: "md", workspaceId: "qa", type: "file", title: "README.md", state: { root: repo, path: "README.md" } },
  ] }],
  activeWorkspaceId: "qa", personas: [], seededInstructionIds: [],
}));

const app = await electron.launch({ args: ["."], env: qaEnvironment({ WORKBENCH_USER_DATA_DIR: directory }) });
const window = await app.firstWindow();
await assertQaWindowVisibility(app);
window.setDefaultTimeout(10_000);
const errors = [];
window.on("pageerror", (error) => errors.push(String(error)));
const shot = async (name) => {
  await window.waitForTimeout(300);
  const bytes = await app.evaluate(async ({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; const [width, height] = w.getContentSize(); return (await w.capturePage()).resize({ width, height }).toPNG(); });
  await writeFile(join(shots, `${name}.png`), Buffer.from(bytes));
};
const until = async (check, what) => { for (let i = 0; i < 100; i++) { if (await check().catch(() => false)) return; await window.waitForTimeout(100); } throw new Error(`Timed out waiting for ${what}`); };
const show = (name) => window.getByRole("radio", { name, exact: true }).or(window.getByRole("button", { name, exact: true })).first();

try {
  // Code is the default.
  await window.locator(".cm-content", { hasText: "Weekly report" }).waitFor();
  assert.equal(await window.locator("iframe").count(), 0);
  await window.locator(".cm-content").click();
  await window.keyboard.press("End");
  await window.keyboard.type("<!-- unsaved -->");
  await show("Preview").click();

  const page = window.frameLocator('iframe[title="Preview of reports/weekly.html"]');
  await page.locator("#external", { hasText: "external script ran" }).waitFor();
  assert.equal(await page.locator("#styled").evaluate((element) => getComputedStyle(element).color), "rgb(1, 2, 3)");
  await until(async () => (await page.locator("#probe").textContent()).startsWith("{"), "probe");
  assert.deepEqual(JSON.parse(await page.locator("#probe").textContent()), { preload: "undefined", parent: "refused", data: 42, git: 404, web: "blocked" });
  await window.getByText("Preview · showing the saved file").waitFor();
  await shot("1-html-preview");

  // Changed on disk: the page loads again.
  await writeFile(join(repo, "reports", "weekly.html"), report(2));
  await page.locator("#styled", { hasText: "v2" }).waitFor();

  // Code again: the same editor, with the unsaved edit still there.
  await show("Code").click();
  await window.locator(".cm-content", { hasText: "<!-- unsaved -->" }).waitFor();
  assert.equal(await window.locator("iframe").count(), 0);

  // Markdown.
  await window.getByRole("tab", { name: /README\.md/ }).click();
  await window.locator(".cm-content", { hasText: "Project notes" }).waitFor();
  await show("Preview").click();
  const markdown = window.locator(".markdown-preview");
  await markdown.getByRole("heading", { name: "Project notes" }).waitFor();
  assert.equal(await markdown.locator("table td").first().textContent(), "a");
  assert.equal(await markdown.locator("script").count(), 0);
  assert.equal(await window.evaluate(() => window.qaInjected), undefined);
  await until(() => markdown.locator('img[alt="pixel"]').evaluate((image) => image.complete && image.naturalWidth === 1), "picture beside the file");
  assert.equal(await markdown.getByRole("link", { name: "Web" }).getAttribute("target"), "_blank");
  await shot("2-markdown-preview");
  await markdown.getByRole("link", { name: "Jump to details" }).click();
  assert.equal(await markdown.locator("#more-details").count(), 1);

  // Each tab remembers its own choice.
  await window.getByRole("tab", { name: /weekly\.html/ }).click();
  await window.locator(".cm-content", { hasText: "Weekly report" }).waitFor();
  await window.getByRole("tab", { name: /README\.md/ }).click();
  await markdown.waitFor();

  // A workspace link opens the file in a tab.
  await markdown.getByRole("link", { name: "Weekly report" }).click();
  await window.locator(".cm-content", { hasText: "Weekly report" }).waitFor();

  assert.deepEqual(errors, []);
  console.log(`File preview QA passed. Screenshots: ${shots}`);
} catch (error) {
  await shot("failure").catch(() => undefined);
  console.error("Page errors:", errors);
  throw error;
} finally {
  await app.close();
}
