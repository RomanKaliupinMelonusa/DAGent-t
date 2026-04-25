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
import { flushFeatureBranch } from "../lifecycle/flush-branch.js";
import { JsonlTelemetry } from "../adapters/jsonl-telemetry.js";
import type { PipelineRunConfig } from "../app-types.js";
import type { JsonlPipelineLogger } from "../telemetry/index.js";

// ---------------------------------------------------------------------------
// SDK client lifecycle
// ---------------------------------------------------------------------------

let client: CopilotClient | null = null;
// Captured once bootstrap completes so SIGINT cleanup has access to slug + roots.
let activeConfig: PipelineRunConfig | null = null;
// Guard so the flush only runs once even if both SIGINT and the outer
// `finally` fire (e.g. SIGINT during `await runWithKernel`).
let flushed = false;

async function flushOnce(config: PipelineRunConfig): Promise<void> {
  if (flushed) return;
  flushed = true;
  try {
    await flushFeatureBranch({
      slug: config.slug,
      appRoot: config.appRoot,
      repoRoot: config.repoRoot,
      baseBranch: config.baseBranch,
      logger: new JsonlTelemetry(config.logger),
    });
  } catch {
    // flushFeatureBranch is documented as non-throwing, but defend against
    // unexpected adapter exceptions so the surrounding cleanup never aborts.
  }
}

process.on("SIGINT", async () => {
  console.log("\nShutting down gracefully...");
  if (activeConfig) {
    await flushOnce(activeConfig);
  }
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
  activeConfig = config;

  client = new CopilotClient();
  await client.start();

  try {
    const result = await runWithKernel(client, config);
    if (result.loopResult.reason === "halted" || result.loopResult.reason === "blocked") {
      process.exitCode = 1;
    }
  } finally {
    // Terminal flush — best-effort push of any local commits stranded on
    // feature/<slug>. Runs for every loopResult.reason AND for uncaught
    // throws from runWithKernel. Idempotent on already-pushed branches.
    await flushOnce(config);
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
