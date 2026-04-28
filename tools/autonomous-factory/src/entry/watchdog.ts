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
// Captured once bootstrap completes so termination cleanup has access to
// slug + roots. Also gives signal handlers a non-null logger to flush.
let activeConfig: PipelineRunConfig | null = null;
// Guard so the flush only runs once even if both a signal handler and the
// outer `finally` fire (e.g. SIGINT during `await runWithKernel`).
let flushed = false;
// Once any termination handler claims ownership of the shutdown sequence,
// later overlapping signals should not re-enter the flush/stop dance.
let terminating = false;

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

/**
 * Register process-level termination handlers that emit `run.end`
 * BEFORE doing any async cleanup. The emit is synchronous +
 * fsync-backed (see `JsonlPipelineLogger.emitRunEnd`) so the outcome
 * lands on disk even if the subsequent flush hangs and is killed by
 * the outer 15-s watchdog.
 *
 * `JsonlPipelineLogger.emitRunEnd` is idempotent, so it doesn't matter
 * which path fires first \u2014 the loop's finally, a signal handler, or
 * the last-chance `process.on('exit')` hook. Whichever arrives first
 * stamps the `reason` field; later arrivals no-op.
 */
function registerTerminationHandlers(): void {
  const emit = (
    reason:
      | "signal:SIGINT"
      | "signal:SIGTERM"
      | "uncaught-exception"
      | "unhandled-rejection"
      | "unknown",
    extra: Record<string, unknown> = {},
  ): void => {
    const cfg = activeConfig;
    if (!cfg) return;
    try {
      cfg.logger.emitRunEnd(reason, extra);
    } catch {
      // Last-resort defence; the logger should never throw upward, but
      // a thrown emitter must not block the shutdown sequence.
    }
  };

  const finalizeAsync = async (exitCode: number): Promise<void> => {
    const cfg = activeConfig;
    if (cfg) {
      await flushOnce(cfg);
    }
    if (client) {
      try { await client.stop(); } catch { /* best effort */ }
    }
    if (cfg) {
      try { (cfg.logger as JsonlPipelineLogger)?.close?.(); } catch { /* best effort */ }
    }
    process.exit(exitCode);
  };

  process.on("SIGINT", () => {
    if (terminating) return;
    terminating = true;
    console.log("\nShutting down gracefully (SIGINT)...");
    emit("signal:SIGINT");
    void finalizeAsync(130);
  });

  process.on("SIGTERM", () => {
    if (terminating) return;
    terminating = true;
    console.log("\nShutting down gracefully (SIGTERM)...");
    emit("signal:SIGTERM");
    void finalizeAsync(143);
  });

  process.on("uncaughtException", (err: Error) => {
    if (terminating) return;
    terminating = true;
    console.error("\n  \u2716 uncaughtException:", err);
    emit("uncaught-exception", {
      error: err?.message ?? String(err),
      stack: err?.stack,
    });
    void finalizeAsync(1);
  });

  process.on("unhandledRejection", (reason: unknown) => {
    if (terminating) return;
    terminating = true;
    console.error("\n  \u2716 unhandledRejection:", reason);
    const message =
      reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : undefined;
    emit("unhandled-rejection", { error: message, stack });
    void finalizeAsync(1);
  });

  // Last-chance synchronous emitter. Fires for every termination path
  // including `process.exit()` from main's `finally`. Cannot do async
  // work here, but `emitRunEnd` is sync + fsync-backed so the file is
  // already on disk when this returns. Reason `unknown` only sticks
  // when none of the above fired \u2014 it's the canary that something
  // bypassed the normal paths.
  process.on("exit", () => {
    emit("unknown", { exit_code: process.exitCode ?? 0 });
  });
}

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
  // Register signal/exception handlers AFTER bootstrap so `activeConfig`
  // is non-null by the time any of them fire. A bootstrap failure has
  // no logger to flush, so the default Node behaviour is correct there.
  registerTerminationHandlers();

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
