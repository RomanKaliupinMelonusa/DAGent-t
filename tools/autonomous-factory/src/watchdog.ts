/**
 * watchdog.ts — Deterministic headless orchestrator loop.
 *
 * Replaces the LLM-based @watchdog agent with a TypeScript state machine that:
 *   1. Reads pipeline state via the programmatic API (state.ts → pipeline-state.mjs)
 *   2. Spins up a Copilot SDK session per specialist task
 *   3. Waits for the agent to complete or fail
 *   4. Advances to the next pipeline item
 *
 * Entry point: `npm run agent:run <feature-slug>`
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { CopilotClient, approveAll } from "@github/copilot-sdk";
import type { MCPServerConfig } from "@github/copilot-sdk";
import { getNext, getNextAvailable, getStatus, failItem, resetForDev, completeItem, readState } from "./state.js";
import { getAgentConfig, buildTaskPrompt } from "./agents.js";
import type { AgentContext } from "./agents.js";
import { loadApmContext } from "./apm-context-loader.js";
import { ApmCompileError, ApmBudgetExceededError } from "./apm-types.js";
import type { ApmCompiledOutput } from "./apm-types.js";
import type { NextAction } from "./types.js";
import { triageFailure, parseTriageDiagnostic } from "./triage.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Repo root resolved relative to this file: tools/autonomous-factory/src → repo */
const repoRoot = path.resolve(import.meta.dirname, "../../..");

/** Session timeouts per pipeline phase (ms) */
const TIMEOUT_DEV      = 1_200_000; // 20 min (dev items — heaviest workload)
const TIMEOUT_TEST     = 600_000;   // 10 min (unit test items — just running tests)
const TIMEOUT_DEFAULT  = 900_000;   // 15 min (fallback)
const TIMEOUT_DEPLOY   = 900_000;   // 15 min (push-code/poll-ci now deterministic; fallback agent gets 15 min)
const TIMEOUT_FINALIZE = 1_200_000; // 20 min (docs-archived, live-ui, integration-test)

const DEV_ITEMS = new Set(["backend-dev", "frontend-dev", "schema-dev"]);
const TEST_ITEMS = new Set(["backend-unit-test", "frontend-unit-test"]);
const DEPLOY_ITEMS = new Set(["push-code", "poll-ci"]);
const FINALIZE_ITEMS = new Set(["code-cleanup", "docs-archived"]);
const LONG_ITEMS = new Set(["live-ui", "integration-test"]);

/** Post-deploy items that can trigger a redevelopment reroute on failure */
const POST_DEPLOY_ITEMS = new Set(["live-ui", "integration-test", "poll-ci"]);

/**
 * Delay (ms) after CI deployment completes before running post-deploy tests.
 * Azure Functions and SWA can take 30-60s to propagate after a deployment
 * workflow reports success. Without this delay, integration tests hit stale
 * deployment artifacts and produce false 404s.
 */
const POST_DEPLOY_PROPAGATION_DELAY_MS = 30_000;

// triageFailure and parseTriageDiagnostic are imported from ./triage.js above

function getTimeout(itemKey: string): number {
  if (DEV_ITEMS.has(itemKey)) return TIMEOUT_DEV;
  if (TEST_ITEMS.has(itemKey)) return TIMEOUT_TEST;
  if (DEPLOY_ITEMS.has(itemKey)) return TIMEOUT_DEPLOY;
  if (FINALIZE_ITEMS.has(itemKey)) return TIMEOUT_FINALIZE;
  if (LONG_ITEMS.has(itemKey)) return TIMEOUT_FINALIZE;
  return TIMEOUT_DEFAULT;
}

// ---------------------------------------------------------------------------
// Logging helpers
// ---------------------------------------------------------------------------

/** Friendly labels for built-in SDK tools */
const TOOL_LABELS: Record<string, string> = {
  read_file:    "📄 Read",
  write_file:   "✏️  Write",
  edit_file:    "✏️  Edit",
  bash:         "🖥  Shell",
  write_bash:   "🖥  Shell (write)",
  view:         "👁  View",
  grep_search:  "🔍 Search",
  list_dir:     "📂 List",
  report_intent:"💭 Intent",
};

/** Group tool names into summary categories */
const TOOL_CATEGORIES: Record<string, string> = {
  read_file: "file-read",
  view: "file-read",
  write_file: "file-write",
  edit_file: "file-edit",
  bash: "shell",
  write_bash: "shell",
  grep_search: "search",
  list_dir: "search",
  report_intent: "intent",
};

/** Extract a short description from tool arguments */
function toolSummary(
  toolName: string,
  args: Record<string, unknown> | undefined,
): string {
  if (!args) return "";
  switch (toolName) {
    case "read_file":
    case "view":
      return args.filePath ? ` → ${path.relative(repoRoot, String(args.filePath))}` : "";
    case "write_file":
    case "edit_file":
      return args.filePath ? ` → ${path.relative(repoRoot, String(args.filePath))}` : "";
    case "bash":
    case "write_bash": {
      const cmd = String(args.command ?? "").split("\n")[0].slice(0, 80);
      return cmd ? ` → ${cmd}` : "";
    }
    case "grep_search":
      return args.query ? ` → "${args.query}"` : "";
    case "list_dir":
      return args.path ? ` → ${path.relative(repoRoot, String(args.path))}` : "";
    case "report_intent":
      return args.intent ? ` → ${args.intent}` : "";
    default:
      return "";
  }
}

/** Summary of decisions collected from each item's session */
interface ItemSummary {
  key: string;
  label: string;
  agent: string;
  phase: string;
  attempt: number;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  outcome: "completed" | "failed" | "error";
  /** Agent-reported intents (high-level "what I'm doing" messages) */
  intents: string[];
  /** Final assistant messages (full text, not truncated) */
  messages: string[];
  /** Files read by the agent */
  filesRead: string[];
  /** Files written or edited by the agent */
  filesChanged: string[];
  /** Shell commands executed with exit context */
  shellCommands: ShellEntry[];
  /** Tool call counts by category */
  toolCounts: Record<string, number>;
  /** Error message if the step failed */
  errorMessage?: string;
  /** Git HEAD after this attempt — used for identical-error dedup */
  headAfterAttempt?: string;
}

interface ShellEntry {
  command: string;
  timestamp: string;
  /** Whether this was a pipeline:complete/fail or agent-commit call */
  isPipelineOp: boolean;
}

/** Detailed Playwright log entry */
interface PlaywrightLogEntry {
  timestamp: string;
  tool: string;
  args?: Record<string, unknown>;
  success?: boolean;
  result?: string;
}

/** Collected summaries across the whole pipeline run */
const pipelineSummaries: ItemSummary[] = [];

/**
 * Circuit breaker: skip retrying an item if the root cause is identical to the
 * previous attempt AND no meaningful code was committed in between.
 *
 * Compares structured diagnostic_trace (not the full error JSON) and checks
 * whether git changes since the last attempt are limited to pipeline state
 * files (in-progress/). This prevents groundhog-day loops where the triage
 * correctly identifies the fix but the dev agent can't persist it (e.g.,
 * commit scope mismatch).
 */
function shouldSkipRetry(itemKey: string): boolean {
  const prevAttempts = pipelineSummaries.filter(
    (s) => s.key === itemKey && s.outcome !== "completed",
  );
  if (prevAttempts.length < 2) return false;

  const last = prevAttempts[prevAttempts.length - 1];
  const prev = prevAttempts[prevAttempts.length - 2];
  if (!last.errorMessage || !prev.errorMessage) return false;

  // Extract diagnostic_trace from structured errors for comparison
  // (full error JSON includes timestamps/metadata that differ between attempts)
  const lastDiag = parseTriageDiagnostic(last.errorMessage);
  const prevDiag = parseTriageDiagnostic(prev.errorMessage);
  const lastTrace = lastDiag?.diagnostic_trace ?? last.errorMessage;
  const prevTrace = prevDiag?.diagnostic_trace ?? prev.errorMessage;

  if (lastTrace !== prevTrace) return false;

  // Check if only pipeline state files changed between attempts
  if (last.headAfterAttempt && prev.headAfterAttempt &&
      last.headAfterAttempt !== prev.headAfterAttempt) {
    try {
      const changedFiles = execSync(
        `git diff --name-only ${prev.headAfterAttempt} ${last.headAfterAttempt}`,
        { cwd: repoRoot, encoding: "utf-8", timeout: 10_000 },
      ).trim();
      if (changedFiles) {
        const files = changedFiles.split("\n").filter(Boolean);
        const onlyStateFiles = files.every((f) => f.includes("in-progress/"));
        if (!onlyStateFiles) return false; // Real code was changed — allow retry
      }
    } catch {
      // If git diff fails, fall back to HEAD comparison
      return false;
    }
  }

  return true;
}

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

/**
 * Compute the merge-base between HEAD and the target branch.
 * Falls back to null if git fails (e.g. shallow clone).
 */
function getMergeBase(targetBranch: string): string | null {
  try {
    // Ensure we have the remote ref available
    const remoteBranch = `origin/${targetBranch}`;
    return execSync(`git merge-base HEAD ${remoteBranch}`, {
      cwd: repoRoot, encoding: "utf-8", timeout: 10_000,
    }).trim() || null;
  } catch {
    return null;
  }
}

/**
 * Returns a function that picks the best base ref for auto-skip diffs.
 * Prefers the per-step snapshot (first dev run), but falls back to the
 * merge-base with the target branch when a redevelopment cycle overwrites
 * the snapshot with a no-op run (which would cause false auto-skips).
 */
function getAutoSkipBaseRef(
  targetBranch: string,
  preStepRefs: Record<string, string>,
): (devKey: string) => string | null {
  // Cache the merge-base so we only compute it once per loop iteration
  let mergeBase: string | null | undefined;
  return (devKey: string): string | null => {
    const stepRef = preStepRefs[devKey];
    if (stepRef) return stepRef;
    if (mergeBase === undefined) {
      mergeBase = getMergeBase(targetBranch);
    }
    return mergeBase;
  };
}

/**
 * Get the list of files changed since a given git ref, using `git diff --name-only`.
 * Returns workspace-relative paths (e.g. "backend/src/functions/fn-list-generations.ts").
 */
function getGitChangedFiles(sinceRef: string): string[] {
  try {
    const output = execSync(`git diff --name-only ${sinceRef} HEAD`, {
      cwd: repoRoot,
      encoding: "utf-8",
      timeout: 10_000,
    }).trim();
    return output ? output.split("\n").filter(Boolean) : [];
  } catch {
    return [];
  }
}

/**
 * Build path prefix lists for auto-skip change detection from apm.yml config.directories.
 * Throws if directories config is missing — every app must declare its layout explicitly.
 */
function getDirectoryPrefixes(
  appRel: string,
  dirs: Record<string, string | null> | undefined,
): { backend: string[]; frontend: string[]; infra: string[] } {
  if (!dirs) {
    throw new Error(
      "Missing config.directories in apm.yml. " +
      "Each app must declare its directory layout (backend, frontend, infra, etc.) in the config section.",
    );
  }
  const d = dirs;
  const pfx = (key: string) => {
    const val = d[key];
    return val ? `${appRel}/${val}/` : null;
  };
  return {
    backend: [pfx("backend"), pfx("infra"), pfx("packages"), pfx("schemas")].filter(Boolean) as string[],
    frontend: [pfx("frontend"), pfx("e2e")].filter(Boolean) as string[],
    infra: [pfx("infra")].filter(Boolean) as string[],
  };
}

async function main(): Promise<void> {
  client = new CopilotClient();
  await client.start();

  // --- Fix: Create feature branch BEFORE dev agents run ---
  // Without this, dev agents commit to the base branch, contaminating it.
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

  // --- Pre-flight: Check for junk untracked files in repo root ---
  try {
    const untracked = execSync("git ls-files --others --exclude-standard", {
      cwd: repoRoot, encoding: "utf-8", timeout: 10_000,
    }).trim();
    if (untracked) {
      const junkFiles = untracked.split("\n").filter((f) => !f.includes("/"));
      if (junkFiles.length > 0) {
        console.warn(`\n  ⚠ WARNING: Found unexpected untracked files in repo root:`);
        junkFiles.forEach((f) => console.warn(`      - ${f}`));
        console.warn(`    These may be artifacts from malformed CLI commands. Please delete them.\n`);
      }
    }
  } catch { /* non-fatal */ }

  // --- Initialize APM context (compile-on-demand, fatal budget validation) ---
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

  // --- Pre-flight: APIM route coverage check (manifest-driven) ---
  // Warn if any backend app.http() route lacks a matching APIM OpenAPI operation.
  // This catches the #1 cause of post-deploy live-ui 404 failures.
  // Skipped entirely when manifest has no preflight.apimRouteCheck config.
  if (apmContext.config?.preflight?.apimRouteCheck) {
    const { functionGlob, specGlob } = apmContext.config.preflight.apimRouteCheck;
    try {
      const fnFiles = execSync(
        `grep -rl 'app.http(' ${path.relative(repoRoot, path.join(appRoot, functionGlob))} 2>/dev/null || true`,
        { cwd: repoRoot, encoding: "utf-8", timeout: 10_000 },
      ).trim();
      const specFiles = execSync(
        `cat ${path.relative(repoRoot, path.join(appRoot, specGlob))} 2>/dev/null || true`,
        { cwd: repoRoot, encoding: "utf-8", timeout: 10_000 },
      );
      if (fnFiles) {
        const routeRegex = /route:\s*["']([^"']+)["']/g;
        const registeredRoutes: string[] = [];
        for (const fnFile of fnFiles.split("\n").filter(Boolean)) {
          const fnContent = fs.readFileSync(path.join(repoRoot, fnFile), "utf-8");
          let match: RegExpExecArray | null;
          while ((match = routeRegex.exec(fnContent)) !== null) {
            registeredRoutes.push(match[1]);
          }
        }
        const missingRoutes = registeredRoutes.filter(
          (route) => !specFiles.includes(`/${route}`),
        );
        if (missingRoutes.length > 0) {
          console.warn(`\n  ⚠ WARNING: Backend routes missing APIM OpenAPI operations:`);
          missingRoutes.forEach((r) => console.warn(`      - /${r}`));
          console.warn(`    These will cause 404s in the live deployment. Add them to the API spec.\n`);
        }
      }
    } catch { /* non-fatal */ }
  }

  // --- Pre-flight: Scan in-progress/ for non-standard files ---
  // Temp scripts created by agents (e.g. browser-check.mjs) should not be committed.
  try {
    const inProgressFiles = execSync(`ls ${path.relative(repoRoot, path.join(appRoot, "in-progress/"))} 2>/dev/null || true`, {
      cwd: repoRoot, encoding: "utf-8", timeout: 5_000,
    }).trim();
    if (inProgressFiles) {
      const allowedPatterns = /(_SPEC\.md|_STATE\.json|_TRANS\.md|_SUMMARY\.md|_CHANGES\.json|_PLAYWRIGHT-LOG\.md|^README\.md$|^screenshots$)/;
      const junkInProgress = inProgressFiles.split("\n").filter(
        (f) => f && !allowedPatterns.test(f),
      );
      if (junkInProgress.length > 0) {
        console.warn(`\n  ⚠ WARNING: Non-standard files in in-progress/:`);
        junkInProgress.forEach((f) => console.warn(`      - ${f}`));
        console.warn(`    These may be temp scripts from agent workarounds. Consider deleting them.\n`);
      }
    }
  } catch { /* non-fatal */ }

  // --- Pre-flight: Azure CLI auth check ---
  // Warn early if `az login` hasn't been run so the user can fix it
  // before the pipeline spends 30+ minutes reaching integration-test.
  try {
    execSync("az account show --query name -o tsv", {
      cwd: repoRoot, encoding: "utf-8", timeout: 10_000, stdio: "pipe",
    });
    console.log("  ✔ Azure CLI authenticated\n");
  } catch {
    console.warn(
      "  ⚠ Azure CLI not authenticated (az login required).\n" +
      "    Integration tests will be skipped or fail at the post-deploy phase.\n" +
      "    Run 'az login' in another terminal now if you need integration tests.\n",
    );
  }

  // --- Phase 0: Build semantic graph with roam-code ---
  const roamAvailable = (() => {
    try {
      execSync("roam --version", { cwd: repoRoot, timeout: 5_000, stdio: "pipe" });
      return true;
    } catch {
      return false;
    }
  })();

  if (roamAvailable) {
    console.log("  🧠 Phase 0: Building semantic graph with roam index...");
    try {
      execSync("roam index", {
        cwd: repoRoot,
        stdio: "inherit",
        timeout: 120_000,
      });
      console.log("  ✔ Semantic graph ready (.roam/index.db)\n");
    } catch (err) {
      console.error(`  ✖ roam index failed: ${err instanceof Error ? err.message : err}`);
      console.warn("  ⚠ Continuing without semantic graph — agents will use standard tools\n");
    }
  } else {
    console.warn(
      "  ⚠ roam-code not available — agents will use standard tools.\n" +
      "    Run 'bash tools/autonomous-factory/setup-roam.sh' to install roam-code.\n",
    );
  }

  /** Track attempt number per item key across retries */
  const attemptCounts: Record<string, number> = {};

  /** Track git commit SHA before each dev step for reliable change detection */
  const preStepRefs: Record<string, string> = {};

  // --- Helper: Run a single pipeline item session ---
  // Extracted to enable parallel execution of multiple items via Promise.allSettled.
  async function runItemSession(
    next: { key: string; label: string; agent: string | null; phase: string | null; status: string },
  ): Promise<{ summary: ItemSummary; halt: boolean; createPr: boolean }> {
    attemptCounts[next.key] = (attemptCounts[next.key] ?? 0) + 1;

    // Circuit breaker: skip if identical error + no code changed since last attempt
    if (attemptCounts[next.key] > 2 && shouldSkipRetry(next.key)) {
      console.log(`\n  ⚡ Circuit breaker: skipping ${next.key} — identical error with no code changes since last attempt`);
      const skipSummary: ItemSummary = {
        key: next.key,
        label: next.label,
        agent: next.agent ?? "unknown",
        phase: next.phase ?? "unknown",
        attempt: attemptCounts[next.key],
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: 0,
        outcome: "failed",
        intents: ["Circuit breaker: identical error, no code changes — skipped"],
        messages: [],
        filesRead: [],
        filesChanged: [],
        shellCommands: [],
        toolCounts: {},
        errorMessage: "Circuit breaker: identical error repeated without code changes",
      };
      try { skipSummary.headAfterAttempt = execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf-8", timeout: 5_000 }).trim(); } catch { /* non-fatal */ }
      pipelineSummaries.push(skipSummary);
      writePipelineSummary(slug);
      return { summary: skipSummary, halt: true, createPr: false };
    }

    console.log(
      `\n${"═".repeat(70)}\n  Phase: ${next.phase} | Item: ${next.key} | Agent: ${next.agent}\n${"═".repeat(70)}`,
    );

    // Snapshot HEAD before dev steps (for auto-skip change detection)
    // Also snapshot before ALL items for accurate filesChanged tracking via git diff
    if (!preStepRefs[next.key]) {
      try {
        preStepRefs[next.key] = execSync("git rev-parse HEAD", {
          cwd: repoRoot, encoding: "utf-8", timeout: 5_000,
        }).trim();
      } catch { /* non-fatal */ }
    }

    // Collect session-level summary
    const stepStart = Date.now();
    const itemSummary: ItemSummary = {
      key: next.key,
      label: next.label,
      agent: next.agent ?? "unknown",
      phase: next.phase ?? "unknown",
      attempt: attemptCounts[next.key],
      startedAt: new Date().toISOString(),
      finishedAt: "",
      durationMs: 0,
      outcome: "completed",
      intents: [],
      messages: [],
      filesRead: [],
      filesChanged: [],
      shellCommands: [],
      toolCounts: {},
    };

    // --- Auto-skip no-op test/post-deploy items ---
    // Directory prefixes are derived from manifest.directories (falls back to legacy defaults)
    const autoSkipRef = getAutoSkipBaseRef(baseBranch, preStepRefs);
    const appRel = path.relative(repoRoot, appRoot);
    const dirPrefixes = getDirectoryPrefixes(appRel, apmContext.config?.directories as Record<string, string | null> | undefined);

    if (next.key === "integration-test" || next.key === "backend-unit-test") {
      const backendRef = autoSkipRef("backend-dev");
      if (backendRef) {
        const gitChanged = getGitChangedFiles(backendRef);
        const hasBackendChanges = gitChanged.some((f) => dirPrefixes.backend.some((p) => f.startsWith(p)));
        if (!hasBackendChanges) {
          console.log(`  ⏭ Auto-skipping ${next.key} — no backend/infra/packages file changes since ${backendRef.slice(0, 8)}`);
          await completeItem(slug, next.key);
          itemSummary.outcome = "completed";
          itemSummary.finishedAt = new Date().toISOString();
          itemSummary.durationMs = Date.now() - stepStart;
          itemSummary.intents.push("Auto-skipped: no backend/infra changes detected (git diff)");
          pipelineSummaries.push(itemSummary);
          writePipelineSummary(slug);
          writeTerminalLog(slug);
          console.log(`  ✅ ${next.key} complete (auto-skipped)`);
          return { summary: itemSummary, halt: false, createPr: false };
        }
      }
    }

    if (next.key === "frontend-unit-test") {
      const frontendRef = autoSkipRef("frontend-dev");
      if (frontendRef) {
        const gitChanged = getGitChangedFiles(frontendRef);
        const hasFrontendChanges = gitChanged.some((f) => dirPrefixes.frontend.some((p) => f.startsWith(p)));
        if (!hasFrontendChanges) {
          console.log(`  ⏭ Auto-skipping ${next.key} — no frontend/e2e file changes since ${frontendRef.slice(0, 8)}`);
          await completeItem(slug, next.key);
          itemSummary.outcome = "completed";
          itemSummary.finishedAt = new Date().toISOString();
          itemSummary.durationMs = Date.now() - stepStart;
          itemSummary.intents.push("Auto-skipped: no frontend changes detected (git diff)");
          pipelineSummaries.push(itemSummary);
          writePipelineSummary(slug);
          writeTerminalLog(slug);
          console.log(`  ✅ ${next.key} complete (auto-skipped)`);
          return { summary: itemSummary, halt: false, createPr: false };
        }
      }
    }

    // live-ui: also check infra/ changes — CORS/APIM/IAM changes silently break
    // the frontend API connection and MUST be caught by real browser verification.
    // We cache the result so the context-building block below can reuse it without
    // a second shell spawn.
    let liveUiInfraChanges: boolean | undefined;
    if (next.key === "live-ui") {
      const frontendRef = autoSkipRef("frontend-dev") ?? autoSkipRef("backend-dev");
      if (frontendRef) {
        const gitChanged = getGitChangedFiles(frontendRef);
        const hasFrontendChanges = gitChanged.some((f) => dirPrefixes.frontend.some((p) => f.startsWith(p)));
        const hasInfraChanges = gitChanged.some((f) => dirPrefixes.infra.some((p) => f.startsWith(p)));
        liveUiInfraChanges = hasInfraChanges;
        if (!hasFrontendChanges && !hasInfraChanges) {
          console.log(`  ⏭ Auto-skipping ${next.key} — no frontend/e2e/infra file changes since ${frontendRef.slice(0, 8)}`);
          await completeItem(slug, next.key);
          itemSummary.outcome = "completed";
          itemSummary.finishedAt = new Date().toISOString();
          itemSummary.durationMs = Date.now() - stepStart;
          itemSummary.intents.push("Auto-skipped: no frontend/e2e/infra changes detected (git diff)");
          pipelineSummaries.push(itemSummary);
          writePipelineSummary(slug);
          writeTerminalLog(slug);
          console.log(`  ✅ ${next.key} complete (auto-skipped)`);
          return { summary: itemSummary, halt: false, createPr: false };
        }
        if (hasInfraChanges && !hasFrontendChanges) {
          console.log(`  ▶ Running ${next.key} — infra changes detected (forcing browser verification for CORS/APIM/IAM)`);
        }
      }
    }

    // ── Post-deploy propagation delay ─────────────────────────────────────
    // After CI reports deployment success, Azure Functions and SWA can take
    // 30-60s to propagate the new code. Without this delay, integration tests
    // hit stale deployment artifacts and produce false 404 failures.
    // Note: Uses LONG_ITEMS (live-ui, integration-test) not POST_DEPLOY_ITEMS,
    // because poll-ci doesn't need Azure propagation time.
    if (LONG_ITEMS.has(next.key) && attemptCounts[next.key] <= 1) {
      console.log(`  ⏳ Waiting ${POST_DEPLOY_PROPAGATION_DELAY_MS / 1000}s for deployment propagation before ${next.key}...`);
      await new Promise((resolve) => setTimeout(resolve, POST_DEPLOY_PROPAGATION_DELAY_MS));
    }

    // ── Deterministic push-code bypass (no agent session) ─────────────────
    if (next.key === "push-code") {
      console.log("  📦 push-code: Running deterministic push (no agent session)");
      try {
        const commitScript = path.join(repoRoot, "tools", "autonomous-factory", "agent-commit.sh");
        const branchScript = path.join(repoRoot, "tools", "autonomous-factory", "agent-branch.sh");

        // Commit any uncommitted changes across all scopes
        try {
          execSync(`bash "${commitScript}" all "feat(${slug}): push code for CI"`, {
            cwd: repoRoot, stdio: "pipe", timeout: 30_000,
            env: { ...process.env, APP_ROOT: appRoot },
          });
        } catch { /* no changes to commit — OK */ }

        // Push via branch wrapper (validates branch, retries once)
        execSync(`bash "${branchScript}" push`, {
          cwd: repoRoot, stdio: "inherit", timeout: 60_000,
          env: { ...process.env, BASE_BRANCH: baseBranch },
        });

        // Mark complete
        await completeItem(slug, next.key);
        console.log("  ✅ push-code complete (deterministic)");

        itemSummary.outcome = "completed";
        itemSummary.finishedAt = new Date().toISOString();
        itemSummary.durationMs = Date.now() - stepStart;
        itemSummary.intents.push("Deterministic push — no agent session");
        pipelineSummaries.push(itemSummary);
        writePipelineSummary(slug);
        writeTerminalLog(slug);
        return { summary: itemSummary, halt: false, createPr: false };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`  ✖ Deterministic push failed: ${message}`);
        // Fail the item instead of falling back to an agent session.
        // Agent sessions for push-code historically caused destructive git
        // operations (reset --hard, cherry-pick) and 15-minute timeouts.
        try {
          await failItem(slug, next.key, `Deterministic push failed: ${message}`);
        } catch { /* best-effort */ }
        itemSummary.outcome = "failed";
        itemSummary.errorMessage = `Deterministic push failed: ${message}`;
        itemSummary.finishedAt = new Date().toISOString();
        itemSummary.durationMs = Date.now() - stepStart;
        pipelineSummaries.push(itemSummary);
        writePipelineSummary(slug);
        writeTerminalLog(slug);
        return { summary: itemSummary, halt: false, createPr: false };
      }
    }

    // ── Deterministic poll-ci bypass (no agent session) ─────────────────
    if (next.key === "poll-ci") {
      console.log("  ⏳ poll-ci: Running deterministic CI poll (no agent session)");
      try {
        const pollScript = path.join(repoRoot, "tools", "autonomous-factory", "poll-ci.sh");
        const pollOutput = execSync(`bash "${pollScript}"`, {
          cwd: repoRoot, stdio: "pipe",
          timeout: 1_200_000,  // 20 min max for CI to complete
          env: { ...process.env, POLL_MAX_RETRIES: "60" },
        });

        // Re-echo stdout for terminal visibility (pipe suppresses live output)
        const successLog = pollOutput.toString();
        if (successLog) console.log(successLog);

        // All CI workflows passed
        await completeItem(slug, next.key);
        console.log("  ✅ poll-ci complete (all workflows passed)");

        itemSummary.outcome = "completed";
        itemSummary.finishedAt = new Date().toISOString();
        itemSummary.durationMs = Date.now() - stepStart;
        itemSummary.intents.push("Deterministic CI poll — all workflows passed");
        pipelineSummaries.push(itemSummary);
        writePipelineSummary(slug);
        writeTerminalLog(slug);
        return { summary: itemSummary, halt: false, createPr: false };
      } catch (err: unknown) {
        // execSync attaches stdout/stderr buffers to the Error on non-zero exit.
        // Capture the CI failure logs (including truncated runner output from poll-ci.sh)
        // so the triage loop can inspect them for fault-domain keywords.
        const execErr = err as { stdout?: Buffer; stderr?: Buffer; message?: string };
        const ciLogs = execErr.stdout?.toString() ?? "";
        const ciStderr = execErr.stderr?.toString() ?? "";
        const capturedOutput = [ciLogs, ciStderr].filter(Boolean).join("\n");

        // Re-echo for terminal visibility
        if (ciLogs) console.log(ciLogs);
        if (ciStderr) console.error(ciStderr);

        const message = execErr.message ?? String(err);
        console.error(`  ✖ CI poll failed or had failures: ${message}`);

        // Persist failure with the truncated CI logs into pipeline state
        // so the POST_DEPLOY_ITEMS triage loop can route to resetForDev.
        const failureContext = capturedOutput || message;
        await failItem(slug, next.key, failureContext);

        // Route directly through POST_DEPLOY_ITEMS triage — no agent session needed.
        // The CI logs contain sufficient signal for deterministic keyword triage.
        itemSummary.outcome = "failed";
        itemSummary.errorMessage = failureContext;
        itemSummary.finishedAt = new Date().toISOString();
        itemSummary.durationMs = Date.now() - stepStart;
        pipelineSummaries.push(itemSummary);
        writePipelineSummary(slug);
        writeTerminalLog(slug);

        const state = await getStatus(slug);
        const naItems = new Set(
          state.items.filter((i) => i.status === "na").map((i) => i.key),
        );
        const diagnostic = parseTriageDiagnostic(failureContext);
        const errorMsg = diagnostic ? diagnostic.diagnostic_trace : failureContext;
        const resetKeys = triageFailure(next.key, failureContext, naItems);

        console.log(`\n  🔄 CI failure in poll-ci — rerouting to redevelopment`);
        console.log(`     Root cause triage → resetting: ${resetKeys.join(", ")}`);

        try {
          const result = await resetForDev(slug, resetKeys, errorMsg);
          if (result.halted) {
            console.error(
              `  ✖ HALTED: ${result.cycleCount} redevelopment cycles exhausted. Exiting.`,
            );
            return { summary: itemSummary, halt: true, createPr: false };
          }
          console.log(
            `     Redevelopment cycle ${result.cycleCount}/5 — pipeline will restart from dev`,
          );

          // Re-index semantic graph after redevelopment reroute
          if (roamAvailable) {
            console.log("  🧠 Re-indexing semantic graph after CI failure reroute...");
            try {
              execSync("roam index", { cwd: repoRoot, stdio: "inherit", timeout: 120_000 });
            } catch { /* non-fatal */ }
          }
        } catch {
          console.error("  ✖ Could not trigger redevelopment reroute. Exiting.");
          return { summary: itemSummary, halt: true, createPr: false };
        }

        return { summary: itemSummary, halt: false, createPr: false };
      }
    }

    // Build agent context — manifest-driven fields replace hardcoded constants
    const currentState = await getStatus(slug);
    const context: AgentContext = {
      featureSlug: slug,
      specPath: path.join(appRoot, "in-progress", `${slug}_SPEC.md`),
      deployedUrl: currentState.deployedUrl,
      workflowType: currentState.workflowType,
      repoRoot,
      appRoot,
      itemKey: next.key,
      baseBranch,
      ...(liveUiInfraChanges && { infraChanges: true }),
      defaultSwaUrl: apmContext.config?.urls?.swa,
      defaultFuncUrl: apmContext.config?.urls?.functionApp,
      defaultApimUrl: apmContext.config?.urls?.apim,
      defaultFuncAppName: apmContext.config?.azureResources?.functionAppName,
      defaultResourceGroup: apmContext.config?.azureResources?.resourceGroup,
      testCommands: apmContext.config?.testCommands as Record<string, string | null> | undefined,
      commitScopes: apmContext.config?.commitScopes,
    };

    const config = getAgentConfig(next.key, context, apmContext);
    const timeout = getTimeout(next.key);

    // Create SDK session
    const session = await client!.createSession({
      model: config.model,
      workingDirectory: repoRoot,
      onPermissionRequest: approveAll,
      systemMessage: { mode: "replace", content: config.systemMessage },
      ...(config.mcpServers
        ? { mcpServers: config.mcpServers as Record<string, MCPServerConfig> }
        : {}),
    });

    // Log tool executions with rich context
    session.on("tool.execution_start", (event) => {
      const name = event.data.toolName;
      const label = TOOL_LABELS[name] ?? `🔧 ${name}`;
      const args = event.data.arguments as Record<string, unknown> | undefined;
      const detail = toolSummary(name, args);
      console.log(`  ${label}${detail}`);

      const category = TOOL_CATEGORIES[name] ?? name;
      itemSummary.toolCounts[category] = (itemSummary.toolCounts[category] ?? 0) + 1;

      const filePath = args?.filePath ? path.relative(repoRoot, String(args.filePath)) : null;
      if (filePath) {
        if (name === "write_file" || name === "edit_file" || name === "create_file" || name === "create") {
          if (!itemSummary.filesChanged.includes(filePath)) itemSummary.filesChanged.push(filePath);
        } else if (name === "read_file" || name === "view") {
          if (!itemSummary.filesRead.includes(filePath)) itemSummary.filesRead.push(filePath);
        }
      }

      if (name === "bash" || name === "write_bash") {
        const cmd = String(args?.command ?? "").split("\n")[0].slice(0, 200);
        if (cmd) {
          const isPipelineOp = /pipeline:(complete|fail|set-note|set-url)|agent-commit\.sh/.test(cmd);
          itemSummary.shellCommands.push({
            command: cmd,
            timestamp: new Date().toISOString(),
            isPipelineOp,
          });
        }
      }
    });

    // Playwright session logging
    const isPlaywrightSession = next.key === "live-ui";
    const playwrightLog: PlaywrightLogEntry[] = [];

    if (isPlaywrightSession) {
      session.on("tool.execution_start", (event) => {
        const name = event.data.toolName;
        if (!name.startsWith("playwright-")) return;
        const args = event.data.arguments as Record<string, unknown> | undefined;
        const entry: PlaywrightLogEntry = {
          timestamp: new Date().toISOString(),
          tool: name,
          args: args ? { ...args } : undefined,
        };
        playwrightLog.push(entry);

        const shortName = name.replace("playwright-", "");
        let detail = "";
        if (args?.url) detail = ` → ${args.url}`;
        else if (args?.selector) detail = ` → ${args.selector}`;
        else if (args?.code) detail = ` → ${String(args.code).split("\n")[0].slice(0, 80)}`;
        console.log(`  🎭 ${shortName}${detail}`);
      });

      session.on("tool.execution_complete", (event) => {
        let last: PlaywrightLogEntry | undefined;
        for (let i = playwrightLog.length - 1; i >= 0; i--) {
          if (playwrightLog[i].success === undefined) {
            last = playwrightLog[i];
            break;
          }
        }
        if (last) {
          last.success = event.data.success;
          const content = event.data.result?.content;
          if (content) {
            last.result = content.slice(0, 500);
          }
          const status = event.data.success ? "✅" : "❌";
          console.log(`  🎭 ${status} ${last.tool.replace("playwright-", "")} completed`);
        }
      });
    }

    // Log agent intents
    session.on("assistant.intent", (event) => {
      console.log(`\n  💡 ${event.data.intent}\n`);
      itemSummary.intents.push(event.data.intent);
    });

    // Capture final assistant messages
    session.on("assistant.message", (event) => {
      const content = event.data.content.replace(/\n/g, " ").trim();
      if (content) {
        itemSummary.messages.push(content);
      }
    });

    let taskPrompt = buildTaskPrompt(
      { key: next.key, label: next.label },
      slug,
      appRoot,
    );

    // Inject retry context from previous attempt
    if (attemptCounts[next.key] > 1) {
      const prevAttempt = [...pipelineSummaries]
        .reverse()
        .find((s) => s.key === next.key);
      if (prevAttempt) {
        const retryLines = [
          `\n## Previous Attempt Context (attempt ${prevAttempt.attempt})`,
          `The previous session ${prevAttempt.outcome === "error" ? "timed out" : "failed"}: ${prevAttempt.errorMessage ?? "unknown"}`,
          prevAttempt.filesChanged.length > 0
            ? `Files already modified: ${prevAttempt.filesChanged.join(", ")}`
            : "No files were changed.",
          prevAttempt.intents.length > 0
            ? `Last reported intent: "${prevAttempt.intents[prevAttempt.intents.length - 1]}"`
            : "",
          prevAttempt.shellCommands.filter((s) => s.isPipelineOp).length > 0
            ? `Pipeline operations that already succeeded:\n${prevAttempt.shellCommands
                .filter((s) => s.isPipelineOp)
                .map((s) => `  - ${s.command}`)
                .join("\n")}`
            : "",
          `\nStart by checking what was already done (git status, run tests) rather than re-reading the full codebase from scratch.`,
        ];
        taskPrompt += retryLines.filter(Boolean).join("\n");
        console.log(
          `  📎 Injected retry context from attempt ${prevAttempt.attempt}`,
        );
      }
    }

    // Inject downstream failure context when a dev item is re-invoked after a post-deploy failure
    if (DEV_ITEMS.has(next.key)) {
      const downstreamFailures = pipelineSummaries.filter(
        (s) => POST_DEPLOY_ITEMS.has(s.key) && s.outcome !== "completed",
      );
      if (downstreamFailures.length > 0) {
        const failureDetails = downstreamFailures
          .map((f) => [
            `### ${f.key} (attempt ${f.attempt})`,
            `Outcome: ${f.outcome}`,
            f.errorMessage ? `Error: ${f.errorMessage}` : "",
            f.shellCommands.filter((s) => s.isPipelineOp).length > 0
              ? `Pipeline ops:\n${f.shellCommands
                  .filter((s) => s.isPipelineOp)
                  .map((s) => `  - ${s.command}`)
                  .join("\n")}`
              : "",
          ].filter(Boolean).join("\n"))
          .join("\n\n");

        // Detect cross-cutting scope issues: if the error mentions .github/workflows
        // or CI/CD files, warn the agent about commit scope and provide the cicd scope
        const lastError = downstreamFailures[downstreamFailures.length - 1]?.errorMessage ?? "";
        const cicdFilePatterns = [".github/workflows", "deploy-backend.yml", "deploy-frontend.yml", "deploy-infra.yml"];
        const involvesCicd = cicdFilePatterns.some((p) => lastError.includes(p));

        let scopeGuidance = "";
        if (involvesCicd) {
          scopeGuidance = `\n\n## Commit Scope Warning (CRITICAL)\n`
            + `The error above involves CI/CD workflow files under \`.github/workflows/\`. `
            + `These files are NOT covered by the default \`backend\` or \`frontend\` commit scopes.\n\n`
            + `**To commit .github/ changes, use the \`cicd\` scope:**\n`
            + "```bash\n"
            + `bash tools/autonomous-factory/agent-commit.sh cicd "fix(ci): <description>"\n`
            + "```\n"
            + `If your fix spans both backend code AND workflow files, make TWO commits:\n`
            + `1. \`agent-commit.sh backend "fix(backend): ..."\` for backend/ changes\n`
            + `2. \`agent-commit.sh cicd "fix(ci): ..."\` for .github/ changes\n`;
        }

        taskPrompt += `\n\n## Redevelopment Context (CRITICAL)\nThe following post-deploy verification steps failed. Fix the root cause in your code:\n\n${failureDetails}\n\nFocus on the errors above — they describe exactly what broke in production.${scopeGuidance}`;
        console.log(
          `  🔗 Injected downstream failure context from ${downstreamFailures.length} post-deploy item(s)${involvesCicd ? " (with CI/CD scope guidance)" : ""}`,
        );
      }
    }

    // Write change manifest for docs-expert (with per-item docNotes)
    if (next.key === "docs-archived") {
      const manifestPath = path.join(appRoot, "in-progress", `${slug}_CHANGES.json`);
      // Read state to pull per-item docNotes written by dev agents
      let stateItems: Array<{ key: string; docNote?: string | null }> = [];
      try {
        const currentState = await readState(slug);
        stateItems = currentState.items;
      } catch { /* best effort — manifest still useful without docNotes */ }
      const manifest = {
        feature: slug,
        stepsCompleted: pipelineSummaries
          .filter((s) => s.outcome === "completed")
          .map((s) => {
            const stateItem = stateItems.find((i) => i.key === s.key);
            return {
              key: s.key,
              agent: s.agent,
              filesChanged: s.filesChanged,
              docNote: stateItem?.docNote ?? null,
            };
          }),
        allFilesChanged: [...new Set(pipelineSummaries.flatMap((s) => s.filesChanged))],
        summaryIntents: pipelineSummaries
          .filter((s) => s.outcome === "completed")
          .flatMap((s) => s.intents),
      };
      try {
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
        console.log(`  📋 Change manifest written to ${path.relative(repoRoot, manifestPath)}`);
      } catch {
        console.warn("  ⚠ Could not write change manifest — docs-expert will use git diff");
      }
    }

    try {
      await session.sendAndWait({ prompt: taskPrompt }, timeout);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  ✖ Session error: ${message}`);
      itemSummary.outcome = "error";
      itemSummary.errorMessage = message;

      // Fast-fail for fatal SDK / authentication errors (non-retryable)
      const fatalPatterns = ["authentication info", "custom provider", "rate limit"];
      if (fatalPatterns.some((p) => message.toLowerCase().includes(p))) {
        console.error(`  ✖ FATAL: Non-retryable SDK/Auth error. Halting pipeline immediately.`);
        try { await failItem(slug, next.key, message); } catch { /* best-effort */ }
        itemSummary.finishedAt = new Date().toISOString();
        itemSummary.durationMs = Date.now() - stepStart;
        pipelineSummaries.push(itemSummary);
        writePipelineSummary(slug);
        writeTerminalLog(slug);
        return { summary: itemSummary, halt: true, createPr: false };
      }

      try {
        const result = await failItem(slug, next.key, message);
        if (result.halted) {
          console.error(
            `  ✖ HALTED: ${next.key} failed ${result.failCount} times. Exiting.`,
          );
          itemSummary.finishedAt = new Date().toISOString();
          itemSummary.durationMs = Date.now() - stepStart;
          pipelineSummaries.push(itemSummary);
          writePipelineSummary(slug);
          writeTerminalLog(slug);
          return { summary: itemSummary, halt: true, createPr: false };
        }
      } catch {
        console.error("  ✖ Could not record failure in pipeline state. Exiting.");
        itemSummary.finishedAt = new Date().toISOString();
        itemSummary.durationMs = Date.now() - stepStart;
        pipelineSummaries.push(itemSummary);
        return { summary: itemSummary, halt: true, createPr: false };
      }
    } finally {
      await session.disconnect();
    }

    // Record timing
    itemSummary.finishedAt = new Date().toISOString();
    itemSummary.durationMs = Date.now() - stepStart;

    // Record HEAD for circuit breaker (identical-error dedup)
    try { itemSummary.headAfterAttempt = execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf-8", timeout: 5_000 }).trim(); } catch { /* non-fatal */ }

    // Augment filesChanged with git diff — agents modify files via shell
    // commands (sed, tee, echo >), not just write_file/edit_file SDK tools.
    // Without this, allFilesChanged in _CHANGES.json is often empty.
    if (preStepRefs[next.key] && itemSummary.headAfterAttempt) {
      try {
        const gitChanges = getGitChangedFiles(preStepRefs[next.key]);
        for (const f of gitChanges) {
          // Exclude pipeline state files — they're not "real" code changes
          if (!f.includes("in-progress/") && !itemSummary.filesChanged.includes(f)) {
            itemSummary.filesChanged.push(f);
          }
        }
      } catch { /* non-fatal */ }
    }

    pipelineSummaries.push(itemSummary);
    writePipelineSummary(slug);
    writeTerminalLog(slug);

    if (isPlaywrightSession && playwrightLog.length > 0) {
      writePlaywrightLog(slug, playwrightLog);
    }

    // After create-pr, archive feature files deterministically and exit
    if (next.key === "create-pr") {
      archiveFeatureFiles(slug, appRoot, repoRoot);
      console.log("  ✅ create-pr complete — pipeline finished");
      return { summary: itemSummary, halt: false, createPr: true };
    }

    // Re-read state to check status
    const state = await getStatus(slug);
    const item = state.items.find((i) => i.key === next.key);

    if (item?.status === "failed") {
      itemSummary.outcome = "failed";
      itemSummary.errorMessage = item.error ?? "Unknown failure";
      // Post-deploy failure reroute
      if (POST_DEPLOY_ITEMS.has(next.key)) {
        const rawError = item.error ?? "Unknown post-deploy failure";
        // Extract the human-readable trace for downstream context injection.
        // If the agent emitted structured JSON, pass diagnostic_trace (not raw JSON)
        // so dev agents get a readable failure description, not a JSON blob.
        const diagnostic = parseTriageDiagnostic(rawError);
        const errorMsg = diagnostic ? diagnostic.diagnostic_trace : rawError;
        const naItems = new Set(
          state.items.filter((i) => i.status === "na").map((i) => i.key),
        );
        const resetKeys = triageFailure(next.key, rawError, naItems);
        console.log(
          `\n  🔄 Post-deploy failure in ${next.key} — rerouting to redevelopment`,
        );
        console.log(`     Root cause triage → resetting: ${resetKeys.join(", ")}`);
        try {
          const result = await resetForDev(slug, resetKeys, errorMsg);
          if (result.halted) {
            console.error(
              `  ✖ HALTED: ${result.cycleCount} redevelopment cycles exhausted. Exiting.`,
            );
            return { summary: itemSummary, halt: true, createPr: false };
          }
          console.log(
            `     Redevelopment cycle ${result.cycleCount}/5 — pipeline will restart from dev`,
          );

          // Re-index semantic graph after redevelopment reroute
          if (roamAvailable) {
            console.log("  🧠 Re-indexing semantic graph after redevelopment reroute...");
            try {
              execSync("roam index", { cwd: repoRoot, stdio: "inherit", timeout: 120_000 });
            } catch { /* non-fatal */ }
          }
        } catch {
          console.error("  ✖ Could not trigger redevelopment reroute. Exiting.");
          return { summary: itemSummary, halt: true, createPr: false };
        }
      } else {
        console.log(`  ⚠ ${next.key} failed — retrying on next loop iteration`);
      }
    } else {
      console.log(`  ✅ ${next.key} complete`);
    }

    return { summary: itemSummary, halt: false, createPr: false };
  }
  // --- End of runItemSession helper ---

  try {
    while (true) {
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

      if (available.length > 1) {
        console.log(
          `\n${"─".repeat(70)}\n  🔀 Parallel batch: ${available.map((i) => i.key).join(" ‖ ")}\n${"─".repeat(70)}`,
        );
      }

      // Run items in parallel (or sequentially if only one)
      const runnableItems = available.filter(
        (item): item is NextAction & { key: string } => item.key !== null,
      );
      const results = await Promise.allSettled(
        runnableItems.map((item) => runItemSession(item)),
      );

      // Check results for halt or create-pr signals
      let shouldHalt = false;
      let pipelineDone = false;
      for (const result of results) {
        if (result.status === "fulfilled") {
          if (result.value.halt) shouldHalt = true;
          if (result.value.createPr) pipelineDone = true;
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
      try { await client.stop(); } catch { /* best effort */ }
      client = null;
    }

    // Final safety-net write (only if summary wasn't already archived by create-pr)
    if (pipelineSummaries.length > 0) {
      const summaryPath = path.join(appRoot, "in-progress", `${slug}_SUMMARY.md`);
      const archivedPath = path.join(appRoot, "archive", "features", slug, `${slug}_SUMMARY.md`);
      if (!fs.existsSync(archivedPath)) {
        writePipelineSummary(slug);
        writeTerminalLog(slug);
      } else {
        // Clean up any leftover in-progress copy
        try { fs.unlinkSync(summaryPath); } catch { /* already gone */ }
        const termLogPath = path.join(appRoot, "in-progress", `${slug}_TERMINAL-LOG.md`);
        try { fs.unlinkSync(termLogPath); } catch { /* already gone */ }
      }
    }
  }
}

/** Write a detailed Playwright session log for the live-ui step */
function writePlaywrightLog(featureSlug: string, log: PlaywrightLogEntry[]): void {
  const logPath = path.join(appRoot, "in-progress", `${featureSlug}_PLAYWRIGHT-LOG.md`);
  const lines: string[] = [
    `# Playwright Session Log — ${featureSlug}`,
    ``,
    `> Auto-generated by the orchestrator on ${new Date().toISOString()}`,
    ``,
    `## Tool Calls (${log.length} total)`,
    ``,
  ];

  for (const entry of log) {
    const status = entry.success === true ? "✅" : entry.success === false ? "❌" : "⏳";
    const shortTool = entry.tool.replace("playwright-", "");
    lines.push(`### ${status} ${shortTool} — ${entry.timestamp}`);
    lines.push(``);
    if (entry.args) {
      const safeArgs = { ...entry.args };
      // Don't log huge code blocks in full
      if (typeof safeArgs.code === "string" && safeArgs.code.length > 200) {
        safeArgs.code = safeArgs.code.slice(0, 200) + "...";
      }
      lines.push(`**Arguments:**`);
      lines.push("```json");
      lines.push(JSON.stringify(safeArgs, null, 2));
      lines.push("```");
      lines.push(``);
    }
    if (entry.result) {
      lines.push(`**Result (truncated):**`);
      lines.push("```");
      lines.push(entry.result);
      lines.push("```");
      lines.push(``);
    }
  }

  try {
    fs.writeFileSync(logPath, lines.join("\n"), "utf-8");
    console.log(`\n🎭 Playwright log written to ${path.relative(repoRoot, logPath)}`);
  } catch {
    console.error("  ⚠ Could not write Playwright session log");
  }
}

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

    // Clean up any remaining feature files
    const remaining = fs.readdirSync(inProgress).filter(
      (f) => f.startsWith(`${featureSlug}_`),
    );
    for (const f of remaining) {
      fs.unlinkSync(path.join(inProgress, f));
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

/** Format milliseconds as human-readable duration */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  return remSecs > 0 ? `${mins}m ${remSecs}s` : `${mins}m`;
}

/** Emoji for outcome */
function outcomeIcon(outcome: string): string {
  return outcome === "completed" ? "✅" : outcome === "failed" ? "❌" : "💥";
}

/** Write a human-readable markdown summary of the pipeline run */
function writePipelineSummary(featureSlug: string): void {
  const summaryPath = path.join(appRoot, "in-progress", `${featureSlug}_SUMMARY.md`);

  // --- Header ---
  const totalMs = pipelineSummaries.reduce((sum, s) => sum + s.durationMs, 0);
  const completed = pipelineSummaries.filter((s) => s.outcome === "completed").length;
  const failed = pipelineSummaries.filter((s) => s.outcome !== "completed").length;
  const allFiles = new Set<string>();
  for (const s of pipelineSummaries) {
    for (const f of s.filesChanged) allFiles.add(f);
  }

  const lines: string[] = [
    `# Pipeline Summary — ${featureSlug}`,
    ``,
    `> Auto-generated by the orchestrator on ${new Date().toISOString()}`,
    ``,
    `## Overview`,
    ``,
    `| Metric | Value |`,
    `|---|---|`,
    `| Total steps | ${pipelineSummaries.length} (${completed} passed, ${failed} failed/errored) |`,
    `| Total duration | ${formatDuration(totalMs)} |`,
    `| Files changed | ${allFiles.size} |`,
    ``,
  ];

  // --- Per-step detail ---
  lines.push(`## Steps`, ``);

  let currentPhase = "";
  for (const item of pipelineSummaries) {
    // Phase header
    if (item.phase !== currentPhase) {
      currentPhase = item.phase;
      const heading = currentPhase === "pre-deploy" ? "Pre-Deploy"
        : currentPhase === "deploy" ? "Deploy"
        : currentPhase === "post-deploy" ? "Post-Deploy"
        : "Finalize";
      lines.push(`### Phase: ${heading}`, ``);
    }

    const icon = outcomeIcon(item.outcome);
    const duration = formatDuration(item.durationMs);
    const attemptTag = item.attempt > 1 ? ` (attempt ${item.attempt})` : "";
    lines.push(`#### ${icon} ${item.label} — \`${item.key}\`${attemptTag}`);
    lines.push(``);
    lines.push(`| | |`);
    lines.push(`|---|---|`);
    lines.push(`| Agent | ${item.agent} |`);
    lines.push(`| Duration | ${duration} |`);
    lines.push(`| Started | ${item.startedAt} |`);
    if (item.errorMessage) {
      lines.push(`| Error | ${item.errorMessage} |`);
    }
    lines.push(``);

    // Tool usage breakdown
    const toolEntries = Object.entries(item.toolCounts);
    if (toolEntries.length > 0) {
      lines.push(`**Tool usage:** ${toolEntries.map(([k, v]) => `${k}: ${v}`).join(", ")}`);
      lines.push(``);
    }

    // What the agent did (intents = reasoning/decisions)
    if (item.intents.length > 0) {
      lines.push(`**What it did & why:**`);
      for (const intent of item.intents) {
        lines.push(`- ${intent}`);
      }
      lines.push(``);
    }

    // Scope of changes
    if (item.filesChanged.length > 0) {
      lines.push(`**Files changed:**`);
      for (const f of item.filesChanged) {
        lines.push(`- \`${f}\``);
      }
      lines.push(``);
    }

    // Key pipeline operations (commits, state transitions)
    const pipelineOps = item.shellCommands.filter((c) => c.isPipelineOp);
    if (pipelineOps.length > 0) {
      lines.push(`**Pipeline operations:**`);
      for (const op of pipelineOps) {
        // Extract the meaningful part of the command
        const short = op.command
          .replace(/^cd [^ ]+ && /, "")
          .replace(repoRoot, ".")
          .slice(0, 150);
        lines.push(`- \`${short}\``);
      }
      lines.push(``);
    }

    // Agent's own summary (executive notes)
    if (item.messages.length > 0) {
      lines.push(`**Agent summary:**`);
      // Use the last message as the executive summary (agents typically summarize at the end)
      const lastMsg = item.messages[item.messages.length - 1];
      // Truncate very long messages but keep enough for context
      const summary = lastMsg.length > 500 ? lastMsg.slice(0, 500) + "…" : lastMsg;
      lines.push(`> ${summary}`);
      lines.push(``);
    }

    lines.push(`---`, ``);
  }

  // --- Aggregate scope of changes ---
  if (allFiles.size > 0) {
    lines.push(`## Scope of Changes`, ``);
    // Group by directory
    const byDir: Record<string, string[]> = {};
    for (const f of allFiles) {
      const dir = f.includes("/") ? f.split("/").slice(0, 2).join("/") : ".";
      (byDir[dir] ??= []).push(f);
    }
    for (const [dir, files] of Object.entries(byDir).sort()) {
      lines.push(`### \`${dir}/\``);
      for (const f of files.sort()) {
        lines.push(`- \`${f}\``);
      }
      lines.push(``);
    }
  }

  // --- Failure timeline (if any failures occurred) ---
  const failures = pipelineSummaries.filter((s) => s.outcome !== "completed");
  if (failures.length > 0) {
    lines.push(`## Failure Log`, ``);
    lines.push(`| Step | Attempt | Error | Resolution |`);
    lines.push(`|---|---|---|---|`);
    for (const f of failures) {
      // Check if a later run of the same key succeeded
      const laterSuccess = pipelineSummaries.find(
        (s) => s.key === f.key && s.attempt > f.attempt && s.outcome === "completed",
      );
      const resolution = laterSuccess ? `Resolved on attempt ${laterSuccess.attempt}` : "Unresolved";
      lines.push(`| ${f.key} | ${f.attempt} | ${f.errorMessage ?? "—"} | ${resolution} |`);
    }
    lines.push(``);
  }

  try {
    fs.writeFileSync(summaryPath, lines.join("\n"), "utf-8");
    console.log(`\n📋 Pipeline summary written to ${path.relative(repoRoot, summaryPath)}`);
  } catch {
    console.error("  ⚠ Could not write pipeline summary file");
  }
}

/**
 * Write a detailed terminal-style log of the pipeline run.
 * Captures every tool call, shell command, intent, and agent summary per step
 * in chronological order — replicating what the user sees in the terminal.
 */
function writeTerminalLog(featureSlug: string): void {
  const logPath = path.join(appRoot, "in-progress", `${featureSlug}_TERMINAL-LOG.md`);

  const totalMs = pipelineSummaries.reduce((sum, s) => sum + s.durationMs, 0);
  const completed = pipelineSummaries.filter((s) => s.outcome === "completed").length;
  const failed = pipelineSummaries.filter((s) => s.outcome !== "completed").length;

  // Compute actual file changes via git diff if possible
  let gitDiffStat = "";
  try {
    const remoteBranch = `origin/${baseBranch}`;
    gitDiffStat = execSync(
      `git diff --stat ${remoteBranch}..HEAD -- . ':!**/in-progress' ':!**/archive'`,
      { cwd: repoRoot, encoding: "utf-8", timeout: 10_000 },
    ).trim();
  } catch { /* non-fatal */ }

  // Compute git log
  let gitLog = "";
  try {
    const remoteBranch = `origin/${baseBranch}`;
    gitLog = execSync(
      `git log --oneline ${remoteBranch}..HEAD`,
      { cwd: repoRoot, encoding: "utf-8", timeout: 10_000 },
    ).trim();
  } catch { /* non-fatal */ }

  const lines: string[] = [
    `# Terminal Log — ${featureSlug}`,
    ``,
    `> Auto-generated by the orchestrator on ${new Date().toISOString()}`,
    ``,
    `## Overview`,
    ``,
    `| Metric | Value |`,
    `|---|---|`,
    `| Total steps | ${pipelineSummaries.length} (${completed} passed, ${failed} failed/errored) |`,
    `| Total duration | ${formatDuration(totalMs)} |`,
    `| Feature branch | \`feature/${featureSlug}\` |`,
    `| Base branch | \`${baseBranch}\` |`,
    ``,
    `---`,
    ``,
    `## Step-by-Step Execution Log`,
    ``,
  ];

  let currentPhase = "";
  for (const item of pipelineSummaries) {
    // Phase header (matches terminal output format)
    if (item.phase !== currentPhase) {
      currentPhase = item.phase;
      const heading = currentPhase === "pre-deploy" ? "Pre-Deploy"
        : currentPhase === "deploy" ? "Deploy"
        : currentPhase === "post-deploy" ? "Post-Deploy"
        : "Finalize";
      lines.push(`### Phase: ${heading}`, ``);
    }

    const icon = outcomeIcon(item.outcome);
    const duration = formatDuration(item.durationMs);
    const attemptTag = item.attempt > 1 ? ` (attempt ${item.attempt})` : "";
    lines.push(`#### ${icon} ${item.label} — \`${item.key}\`${attemptTag}`);
    lines.push(``);
    lines.push(`| | |`);
    lines.push(`|---|---|`);
    lines.push(`| Agent | ${item.agent} |`);
    lines.push(`| Duration | ${duration} |`);
    lines.push(`| Started | ${item.startedAt} |`);
    lines.push(`| Finished | ${item.finishedAt} |`);
    if (item.errorMessage) {
      lines.push(`| Error | ${item.errorMessage} |`);
    }
    lines.push(``);

    // Tool usage breakdown
    const toolEntries = Object.entries(item.toolCounts);
    if (toolEntries.length > 0) {
      lines.push(`**Tool usage:** ${toolEntries.map(([k, v]) => `${k}: ${v}`).join(", ")}`);
      lines.push(``);
    }

    // Chronological event log (interleaved intents, shell commands, file ops)
    // Build a timeline from shell commands (which have timestamps) and intents
    const events: { ts: string; type: string; detail: string }[] = [];

    for (const cmd of item.shellCommands) {
      const short = cmd.command.replace(repoRoot, ".").slice(0, 120);
      const icon = cmd.isPipelineOp ? "📌" : "🖥";
      events.push({ ts: cmd.timestamp, type: icon, detail: short });
    }

    // Intents don't have timestamps, so interleave them at approximate positions
    for (const intent of item.intents) {
      events.push({ ts: "", type: "💭", detail: intent });
    }

    if (events.length > 0) {
      lines.push(`**Execution trace:**`);
      lines.push("```");
      for (const evt of events) {
        const tsPrefix = evt.ts ? `[${evt.ts.slice(11, 19)}] ` : "          ";
        lines.push(`${tsPrefix}${evt.type}  ${evt.detail}`);
      }
      lines.push("```");
      lines.push(``);
    }

    // Files read
    if (item.filesRead.length > 0) {
      lines.push(`**Files read:** ${item.filesRead.map((f) => `\`${f}\``).join(", ")}`);
      lines.push(``);
    }

    // Files changed
    if (item.filesChanged.length > 0) {
      lines.push(`**Files changed:** ${item.filesChanged.map((f) => `\`${f}\``).join(", ")}`);
      lines.push(``);
    }

    // Pipeline operations
    const pipelineOps = item.shellCommands.filter((c) => c.isPipelineOp);
    if (pipelineOps.length > 0) {
      lines.push(`**Pipeline operations:**`);
      for (const op of pipelineOps) {
        const short = op.command.replace(/^cd [^ ]+ && /, "").replace(repoRoot, ".").slice(0, 150);
        lines.push(`- \`${short}\``);
      }
      lines.push(``);
    }

    // Agent summary
    if (item.messages.length > 0) {
      const lastMsg = item.messages[item.messages.length - 1];
      const summary = lastMsg.length > 800 ? lastMsg.slice(0, 800) + "…" : lastMsg;
      lines.push(`**Agent summary:**`);
      lines.push(`> ${summary}`);
      lines.push(``);
    }

    lines.push(`---`, ``);
  }

  // --- Failure Log ---
  const failures = pipelineSummaries.filter((s) => s.outcome !== "completed");
  if (failures.length > 0) {
    lines.push(`## Failure Log`, ``);
    lines.push(`| Step | Attempt | Timestamp | Error | Resolution |`);
    lines.push(`|---|---|---|---|---|`);
    for (const f of failures) {
      const laterSuccess = pipelineSummaries.find(
        (s) => s.key === f.key && s.attempt > f.attempt && s.outcome === "completed",
      );
      const resolution = laterSuccess
        ? `Resolved on attempt ${laterSuccess.attempt} (${formatDuration(laterSuccess.durationMs)})`
        : "Unresolved";
      lines.push(`| ${f.key} | ${f.attempt} | ${f.startedAt} | ${f.errorMessage ?? "—"} | ${resolution} |`);
    }
    lines.push(``);
  }

  // --- Git Commit History ---
  if (gitLog) {
    lines.push(`## Git Commit History`, ``);
    lines.push("```");
    lines.push(gitLog);
    lines.push("```");
    lines.push(``);
  }

  // --- Files Changed (diff stat) ---
  if (gitDiffStat) {
    lines.push(`## Files Changed (vs base branch)`, ``);
    lines.push("```");
    lines.push(gitDiffStat);
    lines.push("```");
    lines.push(``);
  }

  try {
    fs.writeFileSync(logPath, lines.join("\n"), "utf-8");
  } catch {
    console.error("  ⚠ Could not write terminal log file");
  }
}

main().catch((err) => {
  console.error("Fatal orchestrator error:", err);
  process.exitCode = 1;
});
