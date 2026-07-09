#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const codexHome = process.env.CODEX_HOME || join(process.env.HOME || "", ".codex");
const hooksPath = join(codexHome, "hooks.json");
const snapshotDir = join(repoRoot, ".codex", "limit-snapshots");
const snapshotPath = join(snapshotDir, "codex.json");
const examplePath = join(snapshotDir, "codex.example.json");
const pushScriptPath = join(repoRoot, "scripts", "push-codex-limits.sh");
const hookCommand = `"${pushScriptPath}"`;

if (!process.env.HOME && !process.env.CODEX_HOME) {
  throw new Error("HOME or CODEX_HOME must be set to install the Codex hook");
}

mkdirSync(codexHome, { recursive: true });
mkdirSync(snapshotDir, { recursive: true });

if (!existsSync(snapshotPath)) {
  const initialSnapshot = JSON.stringify(
    {
      provider: "codex",
      source: "manual-local-file",
      capturedAt: new Date().toISOString(),
      windows: [
        { window: "5h", usedPercent: 0 },
        { window: "7d", usedPercent: 0 }
      ]
    },
    null,
    2
  );
  writeFileSync(snapshotPath, initialSnapshot.endsWith("\n") ? initialSnapshot : `${initialSnapshot}\n`);
}

const config = readHooksConfig(hooksPath);
config.hooks ??= {};
config.hooks.Stop ??= [];

let stopGroup = config.hooks.Stop.find((item) => Array.isArray(item.hooks));
if (!stopGroup) {
  stopGroup = { hooks: [] };
  config.hooks.Stop.push(stopGroup);
}

const alreadyInstalled = config.hooks.Stop.some((item) =>
  Array.isArray(item.hooks) && item.hooks.some((hook) => hook?.type === "command" && hook?.command === hookCommand)
);

if (!alreadyInstalled) {
  stopGroup.hooks.push({
    type: "command",
    command: hookCommand,
    timeout: 10,
    statusMessage: "Pushing local usage snapshot"
  });
}

writeFileSync(hooksPath, `${JSON.stringify(config, null, 2)}\n`);

console.log(`Codex limit hook ${alreadyInstalled ? "already installed" : "installed"}.`);
console.log(`Hooks file: ${hooksPath}`);
console.log(`Snapshot file: ${snapshotPath}`);
console.log("Next steps:");
console.log("1. Edit the snapshot file with current Codex limit percentages.");
console.log("2. In Codex, run /hooks and trust the new Stop hook if prompted.");
console.log("3. Run npm run limits:sample to verify dashboard rendering.");

function readHooksConfig(path) {
  if (!existsSync(path)) {
    return { hooks: {} };
  }

  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Could not parse ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
