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
import { execSync, spawnSync } from "node:child_process";
import { CopilotClient } from "@github/copilot-sdk";
import { getNextAvailable } from "./state.js";
import { loadApmContext } from "./apm-context-loader.js";
import { ApmCompileError, ApmBudgetExceededError } from "./apm-types.js";
import type { ApmCompiledOutput } from "./apm-types.js";
import type { NextAction } from "./types.js";
import { checkJunkFiles, checkApimRoutes, checkInProgressArtifacts, checkPreflightAuth, checkAzureLogin, checkGitHubLogin, buildRoamIndex } from "./preflight.js";
import { writePipelineSummary, writeTerminalLog, parsePreviousSummary } from "./reporting.js";
import { runResolveEnvironment } from "./hooks.js";
import { runItemSession } from "./session-runner.js";
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
// Feature archiving
// ---------------------------------------------------------------------------

/**
 * Deterministic archiving — moves all feature artifacts from in-progress/
 * to archive/features/<slug>/. This replaces LLM-driven shell commands that
 * previously lived in the pr-creator agent prompt.
 */
function archiveFeatureFiles(featureSlug: string, root: string, repoRootDir: string): void {
  const inProgress = path.join(root, "in-progress");
  const archiveDir = path.join(root, "archive", "features", featureSlug);
  const screenshotsDir = path.join(archiveDir, "screenshots");

  try {
    fs.mkdirSync(screenshotsDir, { recursive: true });

    // Move known feature artifacts
    const artifacts = [
      `${featureSlug}_TRANS.md`,
      `${featureSlug}_STATE.json`,
      `${featureSlug}_SUMMARY.md`,
      `${featureSlug}_TERMINAL-LOG.md`,
      `${featureSlug}_PLAYWRIGHT-LOG.md`,
      `${featureSlug}_CHANGES.json`,
    ];

    // Dynamically find the SPEC file (handles uppercase slug, hyphens vs underscores,
    // and legacy naming like FULLSTACK_DEPLOY_SPEC.md that lacks the slug prefix)
    const entries = fs.readdirSync(inProgress);
    const specTarget1 = `${featureSlug}_spec.md`.toLowerCase();
    const specTarget2 = `${featureSlug.replace(/-/g, "_")}_spec.md`.toLowerCase();
    const specFile = entries.find((f) => {
      const lower = f.toLowerCase();
      if (lower === specTarget1 || lower === specTarget2) return true;
      // Fallback: match any file ending in _spec.md or _deploy_spec.md that isn't
      // from another feature (i.e. not prefixed with a different slug)
      if (lower.endsWith("_spec.md") || lower.endsWith("_deploy_spec.md")) {
        // Accept if no other slug prefix is present (standalone spec files)
        const hasSlugPrefix = lower.startsWith(featureSlug.toLowerCase())
          || lower.startsWith(featureSlug.replace(/-/g, "_").toLowerCase());
        const isGenericSpec = !lower.includes("_state.") && !entries.some(
          (other) => other !== f && other.toLowerCase().startsWith(lower.split("_spec")[0])
            && other.toLowerCase().endsWith("_state.json"),
        );
        return hasSlugPrefix || isGenericSpec;
      }
      return false;
    });
    if (specFile) artifacts.push(specFile);

    for (const artifact of artifacts) {
      const src = path.join(inProgress, artifact);
      const dst = path.join(archiveDir, artifact);
      if (fs.existsSync(src)) {
        fs.renameSync(src, dst);
      }
    }

    // Move screenshots
    const screenshotsSrc = path.join(inProgress, "screenshots");
    if (fs.existsSync(screenshotsSrc)) {
      const entries = fs.readdirSync(screenshotsSrc);
      if (entries.length > 0) {
        for (const entry of entries) {
          const srcEntry = path.join(screenshotsSrc, entry);
          const dstEntry = path.join(screenshotsDir, entry);
          fs.renameSync(srcEntry, dstEntry);
        }
      }
      fs.rmSync(screenshotsSrc, { recursive: true, force: true });
    }

    // Archive any remaining slug-prefixed files (e.g. _FLIGHT_DATA.json,
    // _PIPELINE-TRIAGE.md, _CI-FAILURE.log) that weren't in the known list
    const remaining = fs.readdirSync(inProgress).filter(
      (f) => f.startsWith(`${featureSlug}_`) || f.startsWith(`${featureSlug}.`),
    );
    for (const f of remaining) {
      fs.renameSync(path.join(inProgress, f), path.join(archiveDir, f));
    }

    // Clean up non-slug-prefixed feature files (infra-interfaces.md, etc.)
    // that shouldn't persist after the feature is archived.  Keep only README.md.
    const stragglers = fs.readdirSync(inProgress).filter((f) => {
      if (f.toLowerCase() === "readme.md") return false;
      // Skip directories (screenshots already handled above)
      const stat = fs.statSync(path.join(inProgress, f));
      return stat.isFile();
    });
    for (const f of stragglers) {
      fs.renameSync(path.join(inProgress, f), path.join(archiveDir, f));
    }

    // Remove PR_BODY.md if it exists
    const prBody = path.join(root, "PR_BODY.md");
    if (fs.existsSync(prBody)) {
      fs.unlinkSync(prBody);
    }

    // Commit the archive via the wrapper script
    const commitScript = path.join(repoRootDir, "tools", "autonomous-factory", "agent-commit.sh");
    execSync(
      `bash "${commitScript}" pr "chore(${featureSlug}): archive feature files"`,
      { cwd: repoRootDir, stdio: "inherit", timeout: 30_000 },
    );

    console.log(`  📦 Archived feature files to archive/features/${featureSlug}/`);
  } catch (err) {
    // Non-fatal — the PR was already created; archiving failure shouldn't crash the pipeline
    console.warn(
      `  ⚠ Archiving failed: ${err instanceof Error ? err.message : err}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Centralized state mutex — single-threaded commit after parallel batch
// ---------------------------------------------------------------------------

/**
 * Commit and push pipeline state files after a parallel execution batch completes.
 * This replaces per-agent state commits, eliminating Git contention between
 * parallel agents fighting over _STATE.json rebases.
 *
 * Only the orchestrator commits state files. Agents commit code only (local).
 *
 * CRITICAL GUARD: The push step checks whether the local branch contains
 * unpushed code commits (files outside in-progress/ or archive/). If so, the
 * push is skipped — state stays committed locally and gets pushed later by
 * the deterministic `push-app` or `push-infra` step. This prevents premature
 * pushes from triggering deploy-* CI workflows before the pipeline formally
 * reaches the push-code DAG node, which caused stale deployment artifacts
 * and $130+ in wasted agent sessions (health-badge incident).
 */
function commitAndPushState(
  repoRootDir: string,
  appRootDir: string,
  branch: string,
  batchNumber: number,
): void {
  const appRel = path.relative(repoRootDir, appRootDir);
  const stateGlob = path.join(appRel, "in-progress");

  try {
    // Check for uncommitted state changes
    const hasChanges = execSync(
      `git status --porcelain -- "${stateGlob}"`,
      { cwd: repoRootDir, encoding: "utf-8", timeout: 10_000 },
    ).trim();

    if (!hasChanges) return; // No state changes to commit

    // Stage state files only
    execSync(`git add "${stateGlob}"`, {
      cwd: repoRootDir, timeout: 10_000,
    });

    // Commit with batch number for traceability.
    // [skip ci] prevents state-only pushes from triggering CI workflows.
    execSync(
      `git commit -m "chore(pipeline): state update [batch ${batchNumber}] [skip ci]" --no-verify`,
      { cwd: repoRootDir, timeout: 10_000, stdio: "pipe" },
    );

    // ── PUSH GUARD: only push when no unpushed code commits exist ──────
    // If local branch has commits containing files outside in-progress/ or
    // archive/ that haven't been pushed yet, defer the push to push-app/push-infra.
    // This prevents deploy-* workflows from triggering prematurely.
    let hasUnpushedCodeCommits = false;
    try {
      const unpushedFiles = execSync(
        `git diff --name-only origin/${branch}..HEAD`,
        { cwd: repoRootDir, encoding: "utf-8", timeout: 10_000 },
      ).trim();
      if (unpushedFiles) {
        hasUnpushedCodeCommits = unpushedFiles.split("\n").some(
          (f) => !f.includes("in-progress/") && !f.includes("archive/"),
        );
      }
    } catch {
      // If origin/<branch> doesn't exist yet (first push), allow the push —
      // push-infra will be the first code push and will trigger CI properly.
      // This initial push only contains state/spec files.
    }

    if (hasUnpushedCodeCommits) {
      console.log(`  🔒 State committed locally [batch ${batchNumber}] — push deferred (unpushed code commits exist)`);
      return;
    }

    // Push with exponential backoff retry (2s, 4s, 8s) using --force-with-lease
    for (let i = 0; i < 3; i++) {
      const result = spawnSync("git", ["push", "--force-with-lease", "origin", branch], {
        cwd: repoRootDir, timeout: 30_000,
      });
      if (result.status === 0) {
        console.log(`  🔒 State committed and pushed [batch ${batchNumber}]`);
        return;
      }
      // Pull --rebase before retry to resolve fast-forward
      spawnSync("git", ["pull", "--rebase", "origin", branch], {
        cwd: repoRootDir, timeout: 30_000,
      });
      const backoff = 2000 * Math.pow(2, i);
      execSync(`sleep ${backoff / 1000}`, { timeout: backoff + 5000 });
    }
    console.warn(`  ⚠ Failed to push state after 3 retries — state committed locally only`);
  } catch (err) {
    // Non-fatal — state is persisted locally, will be pushed with next code push
    console.warn(`  ⚠ State commit failed: ${err instanceof Error ? err.message : err}`);
  }
}

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

  checkApimRoutes(repoRoot, appRoot, apmContext);
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

  // --- Boot-time telemetry: parse prior session's _SUMMARY.md exactly once ---
  const priorSummaryPath = path.join(appRoot, "in-progress", `${slug}_SUMMARY.md`);
  const baseTelemetry = parsePreviousSummary(priorSummaryPath);
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

      // --- Approval gate: orchestrator pauses for human `/dagent approve-infra` ---
      const approvalGateItems = available.filter((i) => i.agent === null);
      if (approvalGateItems.length > 0 && available.every((i) => i.agent === null)) {
        console.log(`\n${"─".repeat(70)}`);
        console.log("  ⏸  Awaiting human approval — comment /dagent approve-infra on the Draft PR to continue.");
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
      // Filter out agent-null items (e.g. await-infra-approval) — they are completed externally
      const runnableItems = available.filter(
        (item): item is NextAction & { key: string } => item.key !== null && item.agent !== null,
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
