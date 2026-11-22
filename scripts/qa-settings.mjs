// Settings: the full-window sheet, theme (light, dark, system), terminal and editor fonts, syntax themes, and composer menus.
import { _electron as electron } from "playwright";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { qaEnvironment, assertQaWindowVisibility } from "./qa-environment.mjs";

const directory = await mkdtemp(join(tmpdir(), "wb-settings-"));
const shots = process.env.QA_SHOTS ?? join(directory, "shots");
await mkdir(shots, { recursive: true });
const root = join(directory, "acme-api");
await mkdir(root);
await writeFile(join(root, "index.ts"), "export function greet(name: string) {\n  return `Hello, ${name}`;\n}\n");
await writeFile(join(directory, "workbench-state.json"), JSON.stringify({
  workspaces: [{ id: "qa", name: "acme-api", path: root, activeViewId: "agent", views: [
    { id: "agent", workspaceId: "qa", type: "agent", title: "Untitled", state: { autoTitle: true } },
    { id: "term", workspaceId: "qa", type: "terminal", title: "Terminal", state: { providerId: "terminal.local" } },
    { id: "file", workspaceId: "qa", type: "file", title: "index.ts", state: { root, path: "index.ts" } },
  ] }],
  activeWorkspaceId: "qa", layout: { rightCollapsed: true, leftCollapsed: false }, personas: [], instructionOptions: [],
  // Saved while DimSum Dark was the only syntax theme: it opens in the new default, Gatito.
  preferences: { theme: "system", editor: { fontFamily: "system", fontSize: 13, syntaxTheme: "dimsum-dark" } },
}));
const missing = join(directory, "missing-cli");
const launch = () => electron.launch({ args: ["."], env: qaEnvironment({ WORKBENCH_USER_DATA_DIR: directory, WORKBENCH_CODEX_PATH: missing, WORKBENCH_CLAUDE_PATH: missing }) });
const saved = async () => JSON.parse(await readFile(join(directory, "workbench-state.json"), "utf8"));
const until = async (check, label) => {
  for (let i = 0; i < 50; i++) { if (await check()) return; await delay(100); }
  throw new Error(`Timed out: ${label}`);
};

let app = await launch();
try {
  let page = await app.firstWindow(); await assertQaWindowVisibility(app);
  const errors = []; page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1280, height: 820 });
  // Playwright pins prefers-color-scheme to light; the window's own appearance has to show through.
  await page.emulateMedia({ colorScheme: null });
  const scheme = () => app.evaluate(({ nativeTheme }) => nativeTheme.themeSource);
  const dark = () => page.evaluate(() => document.defaultView.matchMedia("(prefers-color-scheme: dark)").matches);

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await page.waitForTimeout(80);
  await page.screenshot({ path: join(shots, "01-opening.png") });
  await dialog.getByRole("heading", { name: "General", level: 1 }).waitFor();
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(shots, "02-general.png") });
  const box = await page.locator(".settings-window").boundingBox();
  assert.ok(box.width > 1200 && box.height > 780, `fills the window: ${JSON.stringify(box)}`);

  // Appearance: dark, then system.
  await dialog.getByRole("tab", { name: "Appearance" }).click();
  await dialog.locator(".theme-option", { hasText: /^Light$/ }).click();
  await until(async () => (await scheme()) === "light" && !(await dark()), "light theme");
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(shots, "03-appearance-light.png") });
  await dialog.locator(".theme-option", { hasText: /^Dark$/ }).click();
  await until(async () => (await scheme()) === "dark" && await dark(), "dark theme");
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(shots, "04-appearance-dark.png") });

  // Syntax themes: Gatito by default, each sample in its own colours; Tokyo Night chosen.
  const rootTheme = () => page.evaluate(() => [document.documentElement.dataset.syntaxTheme, document.defaultView.getComputedStyle(document.documentElement).getPropertyValue("--wb-code-bg").trim()]);
  assert.deepEqual(await rootTheme(), ["gatito", "#242b2e"]);
  assert.equal(await dialog.locator(".syntax-option").count(), 7);
  assert.equal(await dialog.getByRole("radio", { name: /^Gatito/ }).isChecked(), true);
  const sampleBg = (name) => dialog.locator(".syntax-option", { hasText: name }).locator(".code-sample").evaluate((element) => element.ownerDocument.defaultView.getComputedStyle(element).backgroundColor);
  assert.equal(await sampleBg("Dracula"), "rgb(40, 42, 54)");
  assert.equal(await sampleBg("Night Owl"), "rgb(1, 22, 39)");
  await dialog.locator(".syntax-option", { hasText: "Tokyo Night" }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(shots, "04b-syntax-themes.png") });
  await dialog.locator(".syntax-option", { hasText: "Tokyo Night" }).click();
  await until(async () => (await rootTheme())[0] === "tokyo-night", "tokyo night chosen");
  assert.equal((await rootTheme())[1], "#1a1b26");

  // Fonts: the terminal and editor follow.
  await dialog.getByRole("button", { name: /Terminal font$/ }).click();
  await page.getByRole("option", { name: "Menlo" }).click();
  await dialog.getByRole("button", { name: "Increase Terminal font size" }).click();
  await dialog.getByRole("button", { name: "Increase Terminal font size" }).click();
  await dialog.getByRole("textbox", { name: "Editor font size" }).fill("16");
  await dialog.getByRole("textbox", { name: "Editor font size" }).press("Enter");
  await page.waitForTimeout(300);
  await page.locator(".settings-scroll").evaluate((element) => element.scrollTo(0, 400));
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(shots, "05-appearance-fonts.png") });

  // Composer: hide personas.
  await dialog.getByRole("tab", { name: "Prompt composer" }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(shots, "06-composer.png") });
  await dialog.locator(".settings-switch-row", { hasText: /Show persona/ }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(shots, "07-composer-off.png") });
  await dialog.getByRole("tab", { name: "Personas" }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(shots, "08-personas.png") });
  await dialog.getByRole("tab", { name: "Instructions" }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(shots, "09-instructions.png") });
  await dialog.getByRole("button", { name: "Done" }).click();
  await dialog.waitFor({ state: "detached" });

  // The composer shows only the instructions menu now.
  await page.getByRole("button", { name: /^Instructions/ }).waitFor();
  assert.equal(await page.getByRole("button", { name: /^Persona/ }).count(), 0, "persona menu hidden");
  await page.screenshot({ path: join(shots, "10-app-dark.png") });

  // Terminal and editor fonts.
  await page.getByRole("tab", { name: "Terminal" }).click();
  await page.locator(".xterm").waitFor();
  const terminalFont = await page.locator(".xterm-rows").first().evaluate((element) => [element.ownerDocument.defaultView.getComputedStyle(element).fontFamily, element.ownerDocument.defaultView.getComputedStyle(element).fontSize]);
  assert.match(terminalFont[0], /^"?Menlo/); assert.equal(terminalFont[1], "15px");
  await page.screenshot({ path: join(shots, "11-terminal.png") });
  await page.getByRole("tab", { name: "index.ts" }).click();
  await page.locator(".cm-content").waitFor();
  const editorFont = await page.locator(".cm-editor").evaluate((element) => element.ownerDocument.defaultView.getComputedStyle(element).fontSize);
  assert.equal(editorFont, "16px");
  assert.equal(await page.locator(".cm-editor").evaluate((element) => element.ownerDocument.defaultView.getComputedStyle(element).backgroundColor), "rgb(26, 27, 38)");
  await until(() => page.locator(".cm-line span").filter({ hasText: /^function$/ }).count().then(Boolean), "highlighted keyword");
  const keyword = await page.locator(".cm-line span").filter({ hasText: /^function$/ }).first().evaluate((element) => element.ownerDocument.defaultView.getComputedStyle(element).color);
  assert.equal(keyword, "rgb(187, 154, 247)");
  await page.screenshot({ path: join(shots, "12-editor.png") });

  await until(async () => (await saved()).preferences?.terminal?.fontSize === 15, "preferences saved");
  const preferences = (await saved()).preferences;
  assert.deepEqual(preferences, { theme: "dark", terminal: { fontFamily: "menlo", fontSize: 15 }, editor: { fontFamily: "system", fontSize: 16, syntaxTheme: "tokyo-night" }, composer: { hiddenMenus: ["persona"] } });
  assert.deepEqual(errors, []);
  await app.close();

  // A restart opens in the saved theme, before the page loads.
  app = await launch();
  page = await app.firstWindow();
  await page.emulateMedia({ colorScheme: null });
  assert.equal(await scheme(), "dark");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("dialog", { name: "Settings" }).getByRole("tab", { name: "Appearance" }).click();
  await page.locator(".theme-option", { hasText: /^System$/ }).click();
  await until(async () => (await scheme()) === "system", "system theme");
  console.log(`Settings QA passed. Screenshots in ${shots}`);
} finally {
  await app.close();
}
