/**
 * watchdog.ts — Deterministic headless orchestrator loop.
 *
 * Replaces the LLM-based @watchdog agent with a TypeScript state machine that:
 *   1. Reads pipeline state via the programmatic API (state.ts → pipeline-state.mjs)
 *   2. Spins up a Copilot SDK session per specialist task
 *   3. Waits for the agent to complete or fail
 *   4. Advances to the next pipeline item
 *
 * The heavy lifting is delegated to focused modules:
 *   - session-runner.ts  — per-item session lifecycle, auto-skip, deterministic bypasses
 *   - reporting.ts       — summary, terminal log, playwright log, cost analysis
 *   - preflight.ts       — pre-flight checks (junk files, APIM routes, Azure auth, roam)
 *   - auto-skip.ts       — git-based change detection for skipping no-op items
 *   - context-injection.ts — retry/downstream/revert prompt augmentation
 *
 * Entry point: `npm run agent:run <feature-slug>`
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { CopilotClient } from "@github/copilot-sdk";
import { getNextAvailable, readState } from "./state.js";
import { loadApmContext } from "./apm-context-loader.js";
import { ApmCompileError, ApmBudgetExceededError } from "./apm-types.js";
import type { ApmCompiledOutput } from "./apm-types.js";
import type { NextAction } from "./types.js";
import { checkJunkFiles, checkInProgressArtifacts, checkPreflightAuth, checkGitHubLogin, checkStateContextDrift, buildRoamIndex } from "./preflight.js";
import { writePipelineSummary, writeTerminalLog, loadPreviousSummary, setModelPricing } from "./reporting.js";
import { archiveFeatureFiles, commitAndPushState } from "./archive.js";
import { runResolveEnvironment } from "./hooks.js";
import { runItemSession } from "./session-runner.js";
import type { PipelineRunConfig, PipelineRunState } from "./session-runner.js";
import { createPipelineLogger } from "./logger.js";
import type { JsonlPipelineLogger } from "./logger.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Repo root resolved relative to this file: tools/autonomous-factory/src → repo */
const repoRoot = path.resolve(import.meta.dirname, "../../..");

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

// Parse CLI: watchdog.ts [--app <path> | --app=<path>] <feature-slug>
let appArg: string | null = null;
const cliArgs = process.argv.slice(2);
for (let i = 0; i < cliArgs.length; i++) {
  if (cliArgs[i] === "--app" && cliArgs[i + 1]) {
    appArg = cliArgs[i + 1];
    cliArgs.splice(i, 2);
    break;
  }
  if (cliArgs[i].startsWith("--app=")) {
    appArg = cliArgs[i].slice("--app=".length);
    cliArgs.splice(i, 1);
    break;
  }
}
const slug = cliArgs[0];
if (!slug) {
  console.error("Usage: watchdog.ts [--app <path> | --app=<path>] <feature-slug>");
  console.error("  --app <path>  App directory relative to repo root (e.g. apps/sample-app)");
  console.error("  Runs the agentic pipeline for the given feature.");
  console.error("  Requires: <app>/.apm/apm.yml");
  console.error("  Requires: <app>/in-progress/<slug>_SPEC.md + initialized pipeline state.");
  process.exit(1);
}

/** App root — the directory containing the app's source code and manifest. */
const appRoot = appArg ? path.resolve(repoRoot, appArg) : repoRoot;

// --- Validate --app path and manifest ---
if (!fs.existsSync(appRoot)) {
  console.error(`ERROR: --app directory does not exist: ${appRoot}`);
  process.exit(1);
}
const apmYmlPath = path.join(appRoot, ".apm", "apm.yml");
if (!fs.existsSync(apmYmlPath)) {
  console.error(`ERROR: No APM manifest found at ${apmYmlPath}`);
  console.error("  Each app must have .apm/apm.yml");
  process.exit(1);
}

// Allow deploy-manager's poll-ci.sh to poll for up to ~30 min
process.env.POLL_MAX_RETRIES = "60";

/** Base branch for PR targets and branch-off point (default: main) */
const baseBranch = process.env.BASE_BRANCH || "main";

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
// Main loop
// ---------------------------------------------------------------------------

// Propagate appRoot so pipeline-state.mjs resolves in-progress/ correctly
process.env.APP_ROOT = appRoot;

async function main(): Promise<void> {
  client = new CopilotClient();
  await client.start();

  // --- Create feature branch BEFORE dev agents run ---
  const branchScript = path.join(repoRoot, "tools", "autonomous-factory", "agent-branch.sh");
  try {
    console.log(`\n  🌿 Creating feature branch feature/${slug} from ${baseBranch}...`);
    execSync(`bash "${branchScript}" create-feature "${slug}"`, {
      cwd: repoRoot,
      stdio: "inherit",
      timeout: 30_000,
      env: { ...process.env, BASE_BRANCH: baseBranch },
    });
    console.log(`  ✔ Working on branch feature/${slug}\n`);
  } catch (err) {
    console.error(`  ✖ Failed to create feature branch: ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
    return;
  }

  // --- Pre-flight checks ---
  console.log("\n  🔐 CLI Authentication Status:");
  checkGitHubLogin();
  console.log("");

  checkJunkFiles(repoRoot);

  let apmContext: ApmCompiledOutput;
  try {
    apmContext = loadApmContext(appRoot);
    console.log("  ✔ APM context loaded — all agent budgets within limits\n");

    // Apply config-driven overrides for kernel tuning constants
    if (apmContext.config?.model_pricing) {
      setModelPricing(apmContext.config.model_pricing);
    }
  } catch (err) {
    if (err instanceof ApmBudgetExceededError) {
      console.error(`\n  ✖ FATAL: ${err.message}`);
      console.error("  → Refactor instruction files in .apm/instructions/ to reduce size.\n");
      process.exit(1);
    }
    if (err instanceof ApmCompileError) {
      console.error(`\n  ✖ FATAL: APM compilation failed: ${err.message}`);
      process.exit(1);
    }
    throw err;
  }

  // --- Resolve environment from infrastructure outputs (before any hooks) ---
  try {
    const resolved = runResolveEnvironment(apmContext.config, appRoot, repoRoot);
    if (resolved > 0) {
      console.log(`  ✔ Resolved ${resolved} environment variable(s) from infrastructure outputs\n`);
    }
  } catch (err) {
    console.error(`\n  ✖ FATAL: ${err instanceof Error ? err.message : String(err)}`);
    console.error("  → Check .apm/hooks/resolve-env.sh and verify Terraform state is accessible.\n");
    process.exit(1);
  }

  checkInProgressArtifacts(repoRoot, appRoot);
  await checkStateContextDrift(slug, apmContext, readState);
  checkPreflightAuth(repoRoot, appRoot, apmContext);

  // --- Phase 0: Build semantic graph with roam-code ---
  const roamAvailable = buildRoamIndex(repoRoot);

  // --- Instantiate event logger ---
  const logger = createPipelineLogger(appRoot, slug);

  // --- Pipeline run state ---
  const runConfig: PipelineRunConfig = {
    slug,
    appRoot,
    repoRoot,
    baseBranch,
    apmContext,
    roamAvailable,
    logger,
  };

  // --- Boot-time telemetry: load prior session's structured JSON exactly once ---
  const baseTelemetry = loadPreviousSummary(appRoot, slug);
  if (baseTelemetry) {
    console.log(
      `  📊 Prior session detected: ${baseTelemetry.steps} steps, ` +
      `${baseTelemetry.tokens.toLocaleString()} tokens, $${baseTelemetry.costUsd.toFixed(4)} cost — will merge into totals.`,
    );
  }

  const runState: PipelineRunState = {
    pipelineSummaries: [],
    attemptCounts: {},
    circuitBreakerBypassed: new Set<string>(),
    preStepRefs: {},
    baseTelemetry,
    handlerOutputs: {},
    forceRunChangesDetected: {},
  };

  // --- Main DAG loop ---
  let batchNumber = 0;
  logger.event("run.start", null, {
    slug,
    app: path.relative(repoRoot, appRoot),
    workflow_type: (apmContext.config as Record<string, unknown>)?.workflowType as string ?? "unknown",
    base_branch: baseBranch,
  });
  const runStartMs = Date.now();
  try {
    while (true) {
      batchNumber++;
      // DAG-based batch: get ALL items whose dependencies are satisfied
      const available = await getNextAvailable(slug);

      // Pipeline finished or blocked
      if (available.length === 1 && (available[0].status === "complete" || !available[0].key)) {
        if (available[0].status === "blocked") {
          logger.event("run.end", null, { outcome: "blocked", duration_ms: Date.now() - runStartMs });
          process.exitCode = 1;
        } else {
          logger.event("run.end", null, { outcome: "complete", duration_ms: Date.now() - runStartMs });
        }
        break;
      }

      // --- Dispatch all available items (including approval gates) ---
      if (available.length > 1) {
        logger.event("batch.start", null, { batch_number: batchNumber, items: available.map((i) => i.key) });
      }

      const runnableItems = available.filter(
        (item): item is NextAction & { key: string } => item.key !== null,
      );

      // Pre-batch sync: single pull before parallel execution
      const currentBranch = execSync("git branch --show-current", {
        cwd: repoRoot, encoding: "utf-8", timeout: 10_000,
      }).trim();
      try {
        execSync(`git pull --rebase origin "${currentBranch}"`, {
          cwd: repoRoot, stdio: "pipe", timeout: 30_000,
        });
      } catch { /* non-fatal — may be ahead of remote */ }

      const results = await Promise.allSettled(
        runnableItems.map((item) => runItemSession(client!, item, runConfig, runState)),
      );

      // === Centralized Mutex: Commit state files after parallel batch ===
      commitAndPushState(repoRoot, appRoot, currentBranch, batchNumber);

      // Check results for halt, publish-pr, or approval-pending signals
      let shouldHalt = false;
      let pipelineDone = false;
      let approvalPendingKeys: string[] = [];
      for (const [i, result] of results.entries()) {
        if (result.status === "fulfilled") {
          if (result.value.halt) shouldHalt = true;
          if (result.value.approvalPending) approvalPendingKeys.push(runnableItems[i].key);
          if (result.value.createPr) {
            archiveFeatureFiles(slug, appRoot, repoRoot);

            // Push archive commit to origin — retries with backoff to handle
            // transient network issues. Without this, the archive commit is
            // stranded locally and never reaches the remote.
            const branchScript = path.join(repoRoot, "tools", "autonomous-factory", "agent-branch.sh");
            const maxPushRetries = 3;
            for (let attempt = 1; attempt <= maxPushRetries; attempt++) {
              try {
                execSync(`bash "${branchScript}" push`, {
                  cwd: repoRoot,
                  stdio: "inherit",
                  timeout: 60_000,
                  env: { ...process.env, BASE_BRANCH: baseBranch },
                });
                logger.event("git.push", null, { branch: currentBranch, sha: null, deferred: false });
                break;
              } catch (pushErr) {
                if (attempt < maxPushRetries) {
                  const backoff = 2_000 * Math.pow(2, attempt - 1);
                  console.warn(`  ⚠ Push attempt ${attempt}/${maxPushRetries} failed, retrying in ${backoff / 1000}s...`);
                  await new Promise((r) => setTimeout(r, backoff));
                } else {
                  console.error(`  ✖ Failed to push archive commit after ${maxPushRetries} attempts: ${pushErr instanceof Error ? pushErr.message : String(pushErr)}`);
                }
              }
            }

            logger.event("run.end", null, { outcome: "complete", duration_ms: Date.now() - runStartMs });
            pipelineDone = true;
          }
        } else {
          // Promise rejected — unexpected error
          console.error(`  ✖ Unexpected session error: ${result.reason}`);
          shouldHalt = true;
        }
      }

      if (pipelineDone || shouldHalt) {
        if (shouldHalt) process.exitCode = 1;
        break;
      }

      // --- Approval gate: all items in batch are awaiting human approval ---
      if (approvalPendingKeys.length > 0 && approvalPendingKeys.length === runnableItems.length) {
        const gateKeys = approvalPendingKeys.join(", ");
        console.log(`\n${"─".repeat(70)}`);
        console.log(`  ⏸  Awaiting human approval for: ${gateKeys}`);
        console.log(`     Complete via: npm run pipeline:complete <slug> <gate-key>`);
        console.log(`${"─".repeat(70)}\n`);
        logger.event("run.end", null, { outcome: "approval_gate", duration_ms: Date.now() - runStartMs });
        break;
      }
    }
  } finally {
    if (client) {
      try {
        await Promise.race([
          client.stop(),
          new Promise((_, reject) => setTimeout(() => reject(new Error("client.stop() timed out")), 10_000)),
        ]);
      } catch { /* best effort — don't hang on stale SDK connections */ }
      client = null;
    }

    // Final report generation — write summary + terminal log ONCE at pipeline end.
    // Per-item flushReports() only writes flight data; full markdown reports are
    // generated here so create-pr and publish-pr agents have _SUMMARY.md available.
    if (runState.pipelineSummaries.length > 0) {
      const archivedPath = path.join(appRoot, "archive", "features", slug, `${slug}_SUMMARY.md`);
      if (!fs.existsSync(archivedPath)) {
        writePipelineSummary(appRoot, repoRoot, slug, runState.pipelineSummaries, apmContext, runState.baseTelemetry);
        writeTerminalLog(appRoot, repoRoot, baseBranch, slug, runState.pipelineSummaries, apmContext, runState.baseTelemetry);
      }
    }

    // Close logger file descriptors
    (logger as JsonlPipelineLogger)?.close?.();
  }
}

main().catch((err) => {
  console.error("Fatal orchestrator error:", err);
  process.exitCode = 1;
}).finally(() => {
  // Hard exit safety net — force-kill if cleanup hangs beyond 15s
  setTimeout(() => {
    console.warn("  ⚠ Watchdog cleanup timed out — forcing exit.");
    process.exit(process.exitCode ?? 0);
  }, 15_000).unref();
});
