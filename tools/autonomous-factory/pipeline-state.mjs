#!/usr/bin/env node
/**
 * pipeline-state.mjs — Thin shim that forwards CLI args to the TypeScript CLI.
 *
 * The real implementation lives in `src/cli/pipeline-state.ts`. This shim
 * preserves the existing `node tools/autonomous-factory/pipeline-state.mjs …`
 * entry point (used by npm scripts and agent hook wrappers) while the CLI
 * itself is written in TypeScript against the JsonFileStateStore adapter.
 *
 * Why a shim and not a shebang on the .ts file? The devcontainer already has
 * `tsx` on PATH and the repo's npm scripts invoke `node …/pipeline-state.mjs`.
 * Keeping the entry file name stable avoids touching every call site.
 */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_TS = join(__dirname, "src", "cli", "pipeline-state.ts");

const result = spawnSync("npx", ["tsx", CLI_TS, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
});

if (result.error) {
  console.error(`ERROR: Failed to spawn tsx: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
