// The SDK's types, the agent guide and the agent reference, shipped with the app so a workspace's `.dimsum/` can be scaffolded from the
// version that will run it.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";

const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");
rmSync("dist-electron/sdk", { recursive: true, force: true });
execFileSync(process.execPath, [tsc, "-p", "tsconfig.sdk.json"], { stdio: "inherit" });
mkdirSync("dist-electron/sdk", { recursive: true });
copyFileSync("src/sdk/GUIDE.md", "dist-electron/sdk/GUIDE.md");
// The reference every agent session DimSum starts is pointed at (see src/main/agent-briefing.ts).
mkdirSync("dist-electron/sdk/reference", { recursive: true });
for (const file of readdirSync("src/agent-reference").filter((name) => name.endsWith(".md"))) {
  copyFileSync(`src/agent-reference/${file}`, `dist-electron/sdk/reference/${file}`);
}
