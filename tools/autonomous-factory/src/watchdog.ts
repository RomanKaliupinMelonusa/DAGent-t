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
 *   - preflight.ts       — pre-flight checks (junk files, auth, roam)
 *   - auto-skip.ts       — git-based change detection for skipping no-op items
 *   - context-injection.ts — retry/downstream/revert prompt augmentation
 *
 * Entry point: `npm run agent:run <feature-slug>`
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { CopilotClient } from "@github/copilot-sdk";
import { getNextAvailable } from "./state.js";
import { loadApmContext } from "./apm-context-loader.js";
import { ApmCompileError, ApmBudgetExceededError } from "./apm-types.js";
import type { ApmCompiledOutput } from "./apm-types.js";
import type { NextAction } from "./types.js";
import { checkJunkFiles, checkInProgressArtifacts, checkPreflightAuth, checkAzureLogin, checkGitHubLogin, buildRoamIndex } from "./preflight.js";
import { writePipelineSummary, writeTerminalLog, loadPreviousSummary } from "./reporting.js";
import { runResolveEnvironment } from "./hooks.js";
import { runItemSession } from "./session-runner.js";
import { archiveFeatureFiles, commitAndPushState } from "./archive.js";
import type { PipelineRunConfig, PipelineRunState } from "./session-runner.js";

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
  checkAzureLogin();
  checkGitHubLogin();
  console.log("");

  checkJunkFiles(repoRoot);

  let apmContext: ApmCompiledOutput;
  try {
    apmContext = loadApmContext(appRoot);
    console.log("  ✔ APM context loaded — all agent budgets within limits\n");
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
  checkPreflightAuth(repoRoot, appRoot, apmContext);

  // --- Phase 0: Build semantic graph with roam-code ---
  const roamAvailable = buildRoamIndex(repoRoot);

  // --- Pipeline run state ---
  const runConfig: PipelineRunConfig = {
    slug,
    appRoot,
    repoRoot,
    baseBranch,
    apmContext,
    roamAvailable,
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
    lastPushedShas: {},
    forceRunChangesDetected: {},
  };

  // --- Main DAG loop ---
  let batchNumber = 0;
  try {
    while (true) {
      batchNumber++;
      // DAG-based batch: get ALL items whose dependencies are satisfied
      const available = await getNextAvailable(slug);

      // Pipeline finished or blocked
      if (available.length === 1 && (available[0].status === "complete" || !available[0].key)) {
        if (available[0].status === "blocked") {
          console.error("✖ Pipeline blocked — pending items exist but none are runnable.");
          process.exitCode = 1;
        } else {
          console.log("✔ Pipeline complete!");
        }
        break;
      }

      // --- Approval gate: orchestrator pauses for human approval ---
      const workflowNodes = apmContext.workflows?.default?.nodes;
      const approvalGateItems = available.filter((i) => {
        const node = i.key ? workflowNodes?.[i.key] : undefined;
        return node?.type === "approval";
      });
      if (approvalGateItems.length > 0 && available.every((i) => {
        const node = i.key ? workflowNodes?.[i.key] : undefined;
        return node?.type === "approval";
      })) {
        console.log(`\n${"─".repeat(70)}`);
        console.log("  ⏸  Awaiting human approval — use the appropriate ChatOps command on the Draft PR to continue.");
        console.log(`     Pending gate items: ${approvalGateItems.map((i) => i.key).join(", ")}`);
        console.log(`${"─".repeat(70)}\n`);
        // Clean exit — ChatOps will pipeline:complete + re-trigger the orchestrator
        break;
      }

      if (available.length > 1) {
        console.log(
          `\n${"─".repeat(70)}\n  🔀 Parallel batch: ${available.map((i) => i.key).join(" ‖ ")}\n${"─".repeat(70)}`,
        );
      }

      // Run items in parallel (or sequentially if only one)
      // Filter out approval-gate items — they are completed externally (ChatOps)
      const runnableItems = available.filter(
        (item): item is NextAction & { key: string } => {
          if (item.key === null) return false;
          const node = workflowNodes?.[item.key];
          return node?.type !== "approval";
        },
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

      // Check results for halt or publish-pr signals
      let shouldHalt = false;
      let pipelineDone = false;
      for (const result of results) {
        if (result.status === "fulfilled") {
          if (result.value.halt) shouldHalt = true;
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
                console.log("  📤 Archive commit pushed to origin");
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

            console.log("  ✅ publish-pr complete — pipeline finished");
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

    // Final safety-net write (only if summary wasn't already archived by publish-pr)
    if (runState.pipelineSummaries.length > 0) {
      const summaryPath = path.join(appRoot, "in-progress", `${slug}_SUMMARY.md`);
      const archivedPath = path.join(appRoot, "archive", "features", slug, `${slug}_SUMMARY.md`);
      if (!fs.existsSync(archivedPath)) {
        writePipelineSummary(appRoot, repoRoot, slug, runState.pipelineSummaries, apmContext, runState.baseTelemetry);
        writeTerminalLog(appRoot, repoRoot, baseBranch, slug, runState.pipelineSummaries, apmContext, runState.baseTelemetry);
      } else {
        // Clean up any leftover in-progress copy
        try { fs.unlinkSync(summaryPath); } catch { /* already gone */ }
        const termLogPath = path.join(appRoot, "in-progress", `${slug}_TERMINAL-LOG.md`);
        try { fs.unlinkSync(termLogPath); } catch { /* already gone */ }
      }
    }
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
