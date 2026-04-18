/**
 * watchdog.ts — Deterministic headless orchestrator entry point.
 *
 * Thin coordinator: parseCli → bootstrap → runWithKernel → finalize.
 * All preflight and config assembly lives in bootstrap.ts.
 * Pipeline execution is driven by the Command-Sourced Kernel (main.ts).
 *
 * Responsibility zones:
 *   - cli.ts          → argv parsing
 *   - bootstrap.ts    → preflight checks, APM compilation, config assembly
 *   - main.ts         → composition root (kernel + adapters + loop)
 *   - this file       → entry point, SDK client lifecycle, graceful shutdown
 *
 * Entry point: `npm run agent:run <feature-slug>`
 */

import path from "node:path";
import { CopilotClient } from "@github/copilot-sdk";
import { parseCli } from "./cli.js";
import { bootstrap } from "./bootstrap.js";
import { FatalPipelineError } from "../errors.js";
import { runWithKernel } from "./main.js";
import type { JsonlPipelineLogger } from "../telemetry/index.js";

// ---------------------------------------------------------------------------
// SDK client lifecycle
// ---------------------------------------------------------------------------

let client: CopilotClient | null = null;

process.on("SIGINT", async () => {
  console.log("\nShutting down gracefully...");
  if (client) {
    try { await client.stop(); } catch { /* best effort */ }
  }
  process.exit(0);
});

async function stopClient(): Promise<void> {
  if (!client) return;
  try {
    await Promise.race([
      client.stop(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("client.stop() timed out")), 10_000)),
    ]);
  } catch { /* best effort — don't hang on stale SDK connections */ }
  client = null;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const repoRoot = path.resolve(import.meta.dirname, "../../../..");
  const cli = parseCli(process.argv.slice(2), repoRoot);
  const { config } = await bootstrap(cli);

  client = new CopilotClient();
  await client.start();

  try {
    const result = await runWithKernel(client, config);
    if (result.loopResult.reason === "halted" || result.loopResult.reason === "blocked") {
      process.exitCode = 1;
    }
  } finally {
    await stopClient();
    (config.logger as JsonlPipelineLogger)?.close?.();
  }
}

main().catch((err) => {
  if (err instanceof FatalPipelineError) {
    console.error(`\n  ✖ FATAL [${err.code}]: ${err.message}\n`);
  } else {
    console.error("Fatal orchestrator error:", err);
  }
  process.exitCode = 1;
}).finally(() => {
  setTimeout(() => {
    console.warn("  ⚠ Watchdog cleanup timed out — forcing exit.");
    process.exit(process.exitCode ?? 0);
  }, 15_000).unref();
});
