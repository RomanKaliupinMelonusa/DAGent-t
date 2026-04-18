/**
 * watchdog.ts — Deterministic headless orchestrator loop.
 *
 * Thin coordinator: parseCli → bootstrap → runDagLoop → finalize.
 * All preflight and config assembly lives in bootstrap.ts.
 * Per-item dispatch lives in session-runner.ts.
 *
 * Responsibility zones:
 *   - cli.ts          → argv parsing
 *   - bootstrap.ts    → preflight checks, APM compilation, config assembly
 *   - state.ts        → DAG scheduler (getNextBatch)
 *   - session-runner.ts → per-item dispatch pipeline
 *   - this file       → DAG loop, batch interpretation, triage dispatch, finalize
 *
 * Entry point: `npm run agent:run <feature-slug>`
 */

import fs from "node:fs";
import path from "node:path";
import { CopilotClient } from "@github/copilot-sdk";
import { parseCli } from "./cli.js";
import { bootstrap } from "./bootstrap.js";
import { FatalPipelineError } from "./errors.js";
import { getCurrentBranch, syncBranch, pushWithRetry } from "./git-ops.js";
import { getNextBatch } from "./state.js";
import { getWorkflowNode } from "./session/shared.js";
import { writePipelineSummary, writeTerminalLog } from "./reporting.js";
import { archiveFeatureFiles, commitAndPushState } from "./archive.js";
import { runItemSession } from "./session-runner.js";
import type { PipelineRunConfig, PipelineRunState, SessionOutcome, TriageActivation, BatchSignals, AvailableItem } from "./kernel-types.js";
import type { JsonlPipelineLogger } from "./logger.js";

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

let client: CopilotClient | null = null;

process.on("SIGINT", async () => {
  console.log("\nShutting down gracefully...");
  if (client) {
    try { await client.stop(); } catch { /* best effort */ }
  }
  process.exit(0);
});

// ---------------------------------------------------------------------------
// Pure function: interpret a batch of session outcomes
// ---------------------------------------------------------------------------

/**
 * Extract actionable signals from a batch of settled session promises.
 * Pure function — no side effects, no state mutation.
 */
export function interpretBatchResults(
  results: PromiseSettledResult<SessionOutcome>[],
): BatchSignals {
  let shouldHalt = false;
  let createPr = false;
  const approvalPendingKeys: string[] = [];
  const triageActivations: TriageActivation[] = [];
  const unexpectedErrors: Error[] = [];

  for (const [i, result] of results.entries()) {
    if (result.status === "rejected") {
      unexpectedErrors.push(
        result.reason instanceof Error ? result.reason : new Error(String(result.reason)),
      );
      shouldHalt = true;
      continue;
    }

    const outcome = result.value;
    switch (outcome.kind) {
      case "halt":
        shouldHalt = true;
        break;
      case "create-pr":
        createPr = true;
        break;
      case "approval-pending":
        approvalPendingKeys.push(outcome.gateKey);
        break;
      case "triage":
        triageActivations.push(outcome.activation);
        break;
      case "continue":
        break;
    }
  }

  return { shouldHalt, createPr, approvalPendingKeys, triageActivations, unexpectedErrors };
}

// ---------------------------------------------------------------------------
// Triage dispatch
// ---------------------------------------------------------------------------

/**
 * Dispatch triage nodes sequentially. Triage may reset upstream nodes,
 * so order matters and parallel execution is not safe.
 *
 * @returns true if the pipeline should halt after triage
 */
async function dispatchTriageNodes(
  activations: readonly TriageActivation[],
  sdkClient: CopilotClient,
  config: PipelineRunConfig,
  state: PipelineRunState,
): Promise<boolean> {
  const { logger } = config;

  for (const activation of activations) {
    const triageItem: AvailableItem = {
      key: activation.triageNodeKey,
      label: `triage(${activation.failingKey})`,
      agent: null,
      status: "pending",
    };

    logger.event("triage.evaluate", activation.failingKey, {
      triage_node: activation.triageNodeKey,
      error_signature: activation.errorSignature,
      dispatch: true,
    });

    try {
      const outcome = await runItemSession(sdkClient, triageItem, config, state, activation);
      if (outcome.kind === "halt") return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.event("item.end", activation.triageNodeKey, { outcome: "error", error_preview: msg });
      return true;
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// DAG loop
// ---------------------------------------------------------------------------

async function runDagLoop(
  sdkClient: CopilotClient,
  config: PipelineRunConfig,
  state: PipelineRunState,
): Promise<void> {
  const { slug, appRoot, repoRoot, baseBranch, apmContext, logger } = config;
  const workflowName = config.workflowName;
  let batchNumber = 0;

  logger.event("run.start", null, {
    slug,
    app: path.relative(repoRoot, appRoot),
    workflow_name: workflowName,
    base_branch: baseBranch,
  });
  const runStartMs = Date.now();

  while (true) {
    batchNumber++;

    // ── 1. Query DAG scheduler ──────────────────────────────────────
    const batch = await getNextBatch(slug);

    switch (batch.kind) {
      case "blocked":
        logger.event("run.end", null, { outcome: "blocked", duration_ms: Date.now() - runStartMs });
        process.exitCode = 1;
        return;
      case "complete":
        logger.event("run.end", null, { outcome: "complete", duration_ms: Date.now() - runStartMs });
        return;
      case "items":
        break; // fall through to dispatch
    }

    // ── 2. Filter triage nodes (dispatched via activation only) ─────
    const runnableItems = batch.items.filter((item) => {
      const node = getWorkflowNode(apmContext, workflowName, item.key);
      return node?.type !== "triage";
    });

    // All items in batch are triage-only — skip to next iteration
    // (triage nodes are dispatched via activation, not the scheduler)
    if (runnableItems.length === 0) continue;

    if (runnableItems.length > 1) {
      logger.event("batch.start", null, { batch_number: batchNumber, items: runnableItems.map((i) => i.key) });
    }

    // ── 3. Pre-batch git sync ───────────────────────────────────────
    syncBranch(repoRoot);
    const currentBranch = getCurrentBranch(repoRoot);

    // ── 4. Parallel dispatch ────────────────────────────────────────
    const results = await Promise.allSettled(
      runnableItems.map((item) => runItemSession(sdkClient, item, config, state)),
    );

    // ── 5. Commit state after parallel batch ────────────────────────
    commitAndPushState(repoRoot, appRoot, currentBranch, batchNumber);

    // ── 6. Interpret batch results ──────────────────────────────────
    const signals = interpretBatchResults(results);

    for (const err of signals.unexpectedErrors) {
      console.error(`  ✖ Unexpected session error: ${err.message}`);
    }

    // ── 7. Handle create-pr: archive + push ─────────────────────────
    if (signals.createPr) {
      archiveFeatureFiles(slug, appRoot, repoRoot);
      try {
        await pushWithRetry(repoRoot, baseBranch, logger);
      } catch (err) {
        console.error(`  ✖ ${err instanceof Error ? err.message : String(err)}`);
      }
      logger.event("run.end", null, { outcome: "complete", duration_ms: Date.now() - runStartMs });
      return;
    }

    if (signals.shouldHalt) {
      logger.event("run.end", null, { outcome: "halted", duration_ms: Date.now() - runStartMs });
      process.exitCode = 1;
      return;
    }

    // ── 8. Triage dispatch (sequential) ─────────────────────────────
    if (signals.triageActivations.length > 0) {
      const triageHalt = await dispatchTriageNodes(signals.triageActivations, sdkClient, config, state);
      commitAndPushState(repoRoot, appRoot, currentBranch, batchNumber);
      if (triageHalt) {
        logger.event("run.end", null, { outcome: "halted", duration_ms: Date.now() - runStartMs });
        process.exitCode = 1;
        return;
      }
    }

    // ── 9. Approval gate ────────────────────────────────────────────
    if (signals.approvalPendingKeys.length > 0 && signals.approvalPendingKeys.length === runnableItems.length) {
      const gateKeys = signals.approvalPendingKeys.join(", ");
      console.log(`\n${"─".repeat(70)}`);
      console.log(`  ⏸  Awaiting human approval for: ${gateKeys}`);
      console.log(`     Complete via: npm run pipeline:complete <slug> <gate-key>`);
      console.log(`${"─".repeat(70)}\n`);
      logger.event("run.end", null, { outcome: "approval_gate", duration_ms: Date.now() - runStartMs });
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Finalize: reports + cleanup
// ---------------------------------------------------------------------------

function writeReports(config: PipelineRunConfig, state: PipelineRunState): void {
  if (state.pipelineSummaries.length === 0) return;

  const { slug, appRoot, repoRoot, baseBranch, apmContext } = config;
  const archivedPath = path.join(appRoot, "archive", "features", slug, `${slug}_SUMMARY.md`);
  if (fs.existsSync(archivedPath)) return;

  writePipelineSummary(appRoot, repoRoot, slug, state.pipelineSummaries, apmContext, state.baseTelemetry);
  writeTerminalLog(appRoot, repoRoot, baseBranch, slug, state.pipelineSummaries, apmContext, state.baseTelemetry);
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
  // ── CLI ────────────────────────────────────────────────────────────
  const repoRoot = path.resolve(import.meta.dirname, "../../..");
  const cli = parseCli(process.argv.slice(2), repoRoot);

  // ── Bootstrap ─────────────────────────────────────────────────────
  const { config, baseTelemetry } = await bootstrap(cli);

  // ── SDK client ────────────────────────────────────────────────────
  client = new CopilotClient();
  await client.start();

  // ── Mutable run state ─────────────────────────────────────────────
  const state: PipelineRunState = {
    pipelineSummaries: [],
    attemptCounts: {},
    preStepRefs: {},
    baseTelemetry,
    handlerOutputs: {},
    forceRunChangesDetected: {},
  };

  // ── DAG loop ──────────────────────────────────────────────────────
  try {
    await runDagLoop(client, config, state);
  } finally {
    await stopClient();
    writeReports(config, state);
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
  // Hard exit safety net — force-kill if cleanup hangs beyond 15s
  setTimeout(() => {
    console.warn("  ⚠ Watchdog cleanup timed out — forcing exit.");
    process.exit(process.exitCode ?? 0);
  }, 15_000).unref();
});
