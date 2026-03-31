/**
 * session-runner.ts — Runs a single pipeline item as a Copilot SDK session.
 *
 * Extracted from the `runItemSession()` closure in watchdog.ts to make the
 * orchestrator loop readable and each concern independently debuggable.
 *
 * Handles:
 *   - Circuit breaker (identical-error dedup)
 *   - Auto-skip for no-op test/post-deploy items
 *   - Deterministic bypasses for push-code and poll-ci
 *   - SDK session lifecycle (create, wire events, send prompt, disconnect)
 *   - Context injection (retry, downstream failure, revert warning)
 *   - Post-deploy failure triage and redevelopment reroute
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { approveAll } from "@github/copilot-sdk";
import type { CopilotClient, MCPServerConfig } from "@github/copilot-sdk";
import { getStatus, failItem, resetForDev, completeItem, salvageForDraft } from "./state.js";
import { getAgentConfig, buildTaskPrompt } from "./agents.js";
import type { AgentContext } from "./agents.js";
import type { ApmCompiledOutput } from "./apm-types.js";
import type { NextAction, ItemSummary, PlaywrightLogEntry } from "./types.js";
import { DEV_ITEMS, POST_DEPLOY_ITEMS, TEST_ITEMS } from "./types.js";
import { triageFailure, parseTriageDiagnostic } from "./triage.js";
import { getAutoSkipBaseRef, getGitChangedFiles, getDirectoryPrefixes } from "./auto-skip.js";
import { writePipelineSummary, writeTerminalLog, writePlaywrightLog, writeFlightData } from "./reporting.js";
import {
  buildRetryContext,
  buildDownstreamFailureContext,
  buildInfraRollbackContext,
  buildRevertWarning,
  computeEffectiveDevAttempts,
  writeChangeManifest,
} from "./context-injection.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Session timeouts per pipeline phase (ms) */
const TIMEOUT_DEV      = 1_200_000; // 20 min (dev items — heaviest workload)
const TIMEOUT_TEST     = 600_000;   // 10 min (unit test items — just running tests)
const TIMEOUT_DEFAULT  = 900_000;   // 15 min (fallback)
const TIMEOUT_DEPLOY   = 900_000;   // 15 min (push-code/poll-ci now deterministic; fallback agent gets 15 min)
const TIMEOUT_FINALIZE = 1_200_000; // 20 min (docs-archived, live-ui, integration-test)

const DEPLOY_ITEMS = new Set(["push-infra", "create-draft-pr", "poll-infra-plan", "push-app", "poll-app-ci"]);
const FINALIZE_ITEMS = new Set(["code-cleanup", "docs-archived"]);
const LONG_ITEMS = new Set(["live-ui", "integration-test"]);

/**
 * Shell command patterns that write files.
 * Used to detect file mutations done via bash/write_bash tool calls
 * (e.g. `sed -i`, `tee`, `echo >`) instead of SDK write_file/edit_file.
 * Each regex captures the target file path in group 1.
 * Exported for unit testing.
 */
export const SHELL_WRITE_PATTERNS: readonly RegExp[] = [
  /\bsed\s+-i(?:\s+'[^']*'|\s+"[^"]*"|\s+[^\s]+)*\s+([^\s;|&>]+)/,    // sed -i 's/x/y/' <file>
  /\btee\s+(?:-a\s+)?([^\s;|&>]+)/,                                       // tee <file> or tee -a <file>
  /\bcat\s*>\s*([^\s;|&]+)/,                                               // cat > <file>
  /\becho\s+.*?>{1,2}\s*([^\s;|&>]+)/,                                     // echo ... > <file> or echo ... >> <file>
  /\bprintf\s+.*?>{1,2}\s*([^\s;|&>]+)/,                                   // printf ... > <file> or printf ... >> <file>
  /\bcp\s+(?:-[a-zA-Z]+\s+)?[^\s]+\s+([^\s;|&]+)/,                        // cp <src> <dest>
  /\bmv\s+(?:-[a-zA-Z]+\s+)?[^\s]+\s+([^\s;|&]+)/,                        // mv <src> <dest>
];

/**
 * Extract file paths written by a shell command.
 * Matches against SHELL_WRITE_PATTERNS and returns workspace-relative paths.
 * Exported for unit testing.
 */
export function extractShellWrittenFiles(cmd: string, repoRoot: string): string[] {
  const files: string[] = [];
  for (const re of SHELL_WRITE_PATTERNS) {
    const m = cmd.match(re);
    if (m?.[1]) {
      const raw = m[1].replace(/["']/g, "");
      // Resolve relative to repo root and normalize
      const abs = path.isAbsolute(raw) ? raw : path.resolve(repoRoot, raw);
      const rel = path.relative(repoRoot, abs);
      // Exclude paths outside the repo or pipeline state files
      if (!rel.startsWith("..") && !rel.includes("_STATE.json") && !rel.includes("_TRANS.md")) {
        files.push(rel);
      }
    }
  }
  return files;
}

/**
 * Delay (ms) after CI deployment completes before running post-deploy tests.
 * Azure Functions and SWA can take 30-60s to propagate after a deployment
 * workflow reports success. Without this delay, integration tests hit stale
 * deployment artifacts and produce false 404s.
 */
const POST_DEPLOY_PROPAGATION_DELAY_MS = 30_000;

/**
 * Cognitive Circuit Breaker — default tool call limits per session.
 * Used when an agent does not declare per-agent toolLimits in apm.yml.
 * Soft limit: logs a structured warning to console (visible in _TERMINAL-LOG.md).
 * Hard limit: force-disconnects the session to prevent runaway compute waste.
 */
export const TOOL_COUNT_SOFT_LIMIT_DEFAULT = 30;
export const TOOL_COUNT_HARD_LIMIT_DEFAULT = 40;

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
  repoRoot: string,
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

// ---------------------------------------------------------------------------
// Circuit breaker
// ---------------------------------------------------------------------------

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
export function shouldSkipRetry(
  repoRoot: string,
  itemKey: string,
  pipelineSummaries: readonly ItemSummary[],
): boolean {
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
// Shared mutable state passed from the orchestrator
// ---------------------------------------------------------------------------

/** All mutable state that persists across pipeline iterations */
export interface PipelineRunState {
  /** Collected summaries across the whole pipeline run */
  pipelineSummaries: ItemSummary[];
  /** Track attempt number per item key across retries */
  attemptCounts: Record<string, number>;
  /** One-time circuit breaker bypass for DEV items eligible for clean-slate revert */
  circuitBreakerBypassed: Set<string>;
  /** Track git commit SHA before each dev step for reliable change detection */
  preStepRefs: Record<string, string>;
  /**
   * Telemetry from a prior session's _SUMMARY.md, parsed once at boot time.
   * Guarantees monotonic metric accumulation across sessions — every flush
   * simply adds baseTelemetry to the current session's totals.
   */
  baseTelemetry: import("./reporting.js").PreviousSummaryTotals | null;
}

/** Immutable config for the pipeline run */
export interface PipelineRunConfig {
  slug: string;
  appRoot: string;
  repoRoot: string;
  baseBranch: string;
  apmContext: ApmCompiledOutput;
  roamAvailable: boolean;
}

export interface SessionResult {
  summary: ItemSummary;
  halt: boolean;
  createPr: boolean;
}

// ---------------------------------------------------------------------------
// Main session runner
// ---------------------------------------------------------------------------

/**
 * Run a single pipeline item — the core of each DAG step.
 * Handles auto-skip, deterministic bypasses, SDK sessions, and triage.
 */
export async function runItemSession(
  client: CopilotClient,
  next: NextAction & { key: string },
  config: PipelineRunConfig,
  state: PipelineRunState,
): Promise<SessionResult> {
  const { slug, appRoot, repoRoot, baseBranch, apmContext, roamAvailable } = config;
  const { pipelineSummaries, attemptCounts, circuitBreakerBypassed, preStepRefs } = state;

  attemptCounts[next.key] = (attemptCounts[next.key] ?? 0) + 1;

  // --- Circuit breaker: skip if identical error + no code changed since last attempt ---
  if (attemptCounts[next.key] > 2 && shouldSkipRetry(repoRoot, next.key, pipelineSummaries)) {
    // For DEV items, grant one bypass so the clean-slate revert warning can fire.
    // The revert wipes ALL feature code (not just the delta between attempts),
    // so it may resolve the root cause even when shouldSkipRetry sees no change.
    if (DEV_ITEMS.has(next.key) && !circuitBreakerBypassed.has(next.key)) {
      console.log(`\n  ⚡ Circuit breaker deferred for ${next.key} — granting clean-slate revert opportunity`);
      circuitBreakerBypassed.add(next.key);
    } else {
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
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        errorMessage: "Circuit breaker: identical error repeated without code changes",
      };
      try { skipSummary.headAfterAttempt = execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf-8", timeout: 5_000 }).trim(); } catch { /* non-fatal */ }
      pipelineSummaries.push(skipSummary);
      flushReports(config, state);
      return { summary: skipSummary, halt: true, createPr: false };
    }
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
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };

  // --- Auto-skip no-op test/post-deploy items ---
  const autoSkipResult = await tryAutoSkip(next, config, state, itemSummary, stepStart);
  if (autoSkipResult) return autoSkipResult;

  // ── Post-deploy propagation delay ─────────────────────────────────────
  if (LONG_ITEMS.has(next.key) && attemptCounts[next.key] <= 1) {
    console.log(`  ⏳ Waiting ${POST_DEPLOY_PROPAGATION_DELAY_MS / 1000}s for deployment propagation before ${next.key}...`);
    await new Promise((resolve) => setTimeout(resolve, POST_DEPLOY_PROPAGATION_DELAY_MS));
  }

  // ── Deterministic bypasses (no agent session) ─────────────────────────
  if (next.key === "push-infra" || next.key === "push-app") {
    return runPushCode(next.key, config, state, itemSummary, stepStart);
  }
  if (next.key === "poll-infra-plan" || next.key === "poll-app-ci") {
    return runPollCi(next.key, config, state, itemSummary, stepStart, roamAvailable);
  }

  // ── Agent session ─────────────────────────────────────────────────────
  return runAgentSession(client, next, config, state, itemSummary, stepStart);
}

// ---------------------------------------------------------------------------
// Auto-skip logic
// ---------------------------------------------------------------------------

/** Cache for live-ui infra change detection, used by agent context */
let liveUiInfraChanges: boolean | undefined;

async function tryAutoSkip(
  next: NextAction & { key: string },
  config: PipelineRunConfig,
  state: PipelineRunState,
  itemSummary: ItemSummary,
  stepStart: number,
): Promise<SessionResult | null> {
  const { slug, appRoot, repoRoot, baseBranch, apmContext } = config;
  const { pipelineSummaries, preStepRefs } = state;

  // Reset per-item
  liveUiInfraChanges = undefined;

  const autoSkipRef = getAutoSkipBaseRef(repoRoot, baseBranch, preStepRefs);
  const appRel = path.relative(repoRoot, appRoot);
  const dirPrefixes = getDirectoryPrefixes(appRel, apmContext.config?.directories as Record<string, string | null> | undefined);

  const completeSkip = async (intent: string): Promise<SessionResult> => {
    await completeItem(slug, next.key);
    itemSummary.outcome = "completed";
    itemSummary.finishedAt = new Date().toISOString();
    itemSummary.durationMs = Date.now() - stepStart;
    itemSummary.intents.push(intent);
    pipelineSummaries.push(itemSummary);
    flushReports(config, state);
    console.log(`  ✅ ${next.key} complete (auto-skipped)`);
    return { summary: itemSummary, halt: false, createPr: false };
  };

  if (next.key === "integration-test" || next.key === "backend-unit-test") {
    const backendRef = autoSkipRef("backend-dev");
    if (backendRef) {
      const gitChanged = getGitChangedFiles(repoRoot, backendRef);
      const hasBackendChanges = gitChanged.some((f) => dirPrefixes.backend.some((p) => f.startsWith(p)));
      if (!hasBackendChanges) {
        console.log(`  ⏭ Auto-skipping ${next.key} — no backend/infra/packages file changes since ${backendRef.slice(0, 8)}`);
        return completeSkip("Auto-skipped: no backend/infra changes detected (git diff)");
      }
    }
  }

  if (next.key === "frontend-unit-test") {
    const frontendRef = autoSkipRef("frontend-dev");
    if (frontendRef) {
      const gitChanged = getGitChangedFiles(repoRoot, frontendRef);
      const hasFrontendChanges = gitChanged.some((f) => dirPrefixes.frontend.some((p) => f.startsWith(p)));
      if (!hasFrontendChanges) {
        console.log(`  ⏭ Auto-skipping ${next.key} — no frontend/e2e file changes since ${frontendRef.slice(0, 8)}`);
        return completeSkip("Auto-skipped: no frontend changes detected (git diff)");
      }
    }
  }

  // live-ui: also check infra/ changes — CORS/APIM/IAM changes silently break
  // the frontend API connection and MUST be caught by real browser verification.
  if (next.key === "live-ui") {
    const frontendRef = autoSkipRef("frontend-dev") ?? autoSkipRef("backend-dev");
    if (frontendRef) {
      const gitChanged = getGitChangedFiles(repoRoot, frontendRef);
      const hasFrontendChanges = gitChanged.some((f) => dirPrefixes.frontend.some((p) => f.startsWith(p)));
      const hasInfraChanges = gitChanged.some((f) => dirPrefixes.infra.some((p) => f.startsWith(p)));
      liveUiInfraChanges = hasInfraChanges;
      if (!hasFrontendChanges && !hasInfraChanges) {
        console.log(`  ⏭ Auto-skipping ${next.key} — no frontend/e2e/infra file changes since ${frontendRef.slice(0, 8)}`);
        return completeSkip("Auto-skipped: no frontend/e2e/infra changes detected (git diff)");
      }
      if (hasInfraChanges && !hasFrontendChanges) {
        console.log(`  ▶ Running ${next.key} — infra changes detected (forcing browser verification for CORS/APIM/IAM)`);
      }
    }
  }

  return null; // No auto-skip — continue to session
}

// ---------------------------------------------------------------------------
// Deterministic bypasses
// ---------------------------------------------------------------------------

/** Last pushed commit SHA — captured by runPushCode, consumed by runPollCi */
let lastPushedSha: string | null = null;

async function runPushCode(
  itemKey: string,
  config: PipelineRunConfig,
  state: PipelineRunState,
  itemSummary: ItemSummary,
  stepStart: number,
): Promise<SessionResult> {
  const { slug, appRoot, repoRoot, baseBranch, apmContext } = config;
  const { pipelineSummaries } = state;

  console.log(`  📦 ${itemKey}: Running deterministic push (no agent session)`);
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

    // Capture the exact commit SHA that was pushed (for SHA-pinned CI polling)
    try {
      lastPushedSha = execSync("git rev-parse HEAD", {
        cwd: repoRoot, encoding: "utf-8", timeout: 5_000,
      }).trim();
    } catch { lastPushedSha = null; }

    // Mark complete
    await completeItem(slug, itemKey);
    console.log(`  ✅ ${itemKey} complete (deterministic)`);

    itemSummary.outcome = "completed";
    itemSummary.finishedAt = new Date().toISOString();
    itemSummary.durationMs = Date.now() - stepStart;
    itemSummary.intents.push("Deterministic push — no agent session");
    pipelineSummaries.push(itemSummary);
    flushReports(config, state);
    return { summary: itemSummary, halt: false, createPr: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`  ✖ Deterministic push failed: ${message}`);
    try {
      await failItem(slug, itemKey, `Deterministic push failed: ${message}`);
    } catch { /* best-effort */ }
    itemSummary.outcome = "failed";
    itemSummary.errorMessage = `Deterministic push failed: ${message}`;
    itemSummary.finishedAt = new Date().toISOString();
    itemSummary.durationMs = Date.now() - stepStart;
    pipelineSummaries.push(itemSummary);
    flushReports(config, state);
    return { summary: itemSummary, halt: false, createPr: false };
  }
}

/** Max retries for transient network errors (exit code 2) before giving up */
const MAX_TRANSIENT_RETRIES = 5;
/** Backoff between transient retries (ms) */
const TRANSIENT_BACKOFF_MS = 30_000;

async function runPollCi(
  itemKey: string,
  config: PipelineRunConfig,
  state: PipelineRunState,
  itemSummary: ItemSummary,
  stepStart: number,
  roamAvailable: boolean,
): Promise<SessionResult> {
  const { slug, appRoot, repoRoot } = config;
  const { pipelineSummaries } = state;

  const inProgressDir = path.join(appRoot, "in-progress");
  const diagFile = path.join(inProgressDir, `${slug}_CI-FAILURE.log`);

  // Build poll command args — pass commit SHA if available for pinned filtering
  const pollScript = path.join(repoRoot, "tools", "autonomous-factory", "poll-ci.sh");
  const pollCmd = lastPushedSha
    ? `bash "${pollScript}" --commit "${lastPushedSha}"`
    : `bash "${pollScript}"`;

  console.log(`  ⏳ ${itemKey}: Running deterministic CI poll (no agent session)`);
  if (lastPushedSha) {
    console.log(`     SHA-pinned to ${lastPushedSha.slice(0, 8)}`);
  }

  // Transient retry loop — exit code 2 from poll-ci.sh means network error.
  // Sleep and retry WITHOUT touching DAG state.
  for (let transientAttempt = 0; transientAttempt <= MAX_TRANSIENT_RETRIES; transientAttempt++) {
    try {
      const pollOutput = execSync(pollCmd, {
        cwd: repoRoot, stdio: "pipe",
        maxBuffer: 5 * 1024 * 1024,
        timeout: 1_200_000,
        env: {
          ...process.env,
          POLL_MAX_RETRIES: "60",
          IN_PROGRESS_DIR: inProgressDir,
          SLUG: slug,
          ...(config.apmContext.config?.ciWorkflows
            ? {
                CI_WORKFLOW_FILTER: (config.apmContext.config.ciWorkflows as Record<string, string>)[
                  itemKey === "poll-infra-plan" ? "infra" : "app"
                ] ?? "",
              }
            : {}),
          ...(config.apmContext.config?.ciJobs
            ? {
                CI_JOB_MATCH_BACKEND: (config.apmContext.config.ciJobs as Record<string, string>).backend,
                CI_JOB_MATCH_FRONTEND: (config.apmContext.config.ciJobs as Record<string, string>).frontend,
                CI_JOB_MATCH_SCHEMAS: (config.apmContext.config.ciJobs as Record<string, string>).schemas,
                CI_JOB_MATCH_INFRA: (config.apmContext.config.ciJobs as Record<string, string>).infra,
              }
            : {}),
        },
      });

      const successLog = pollOutput.toString();
      if (successLog) console.log(successLog);

      // ── poll-infra-plan: download plan artifact and post to Draft PR ──
      if (itemKey === "poll-infra-plan") {
        try {
          const branch = `feature/${slug}`;
          // Find the latest successful infra CI run on this branch
          const runIdOutput = execSync(
            `gh run list --branch "${branch}" --workflow deploy-infra.yml --status success --limit 1 --json databaseId -q '.[0].databaseId'`,
            { cwd: repoRoot, stdio: "pipe", timeout: 30_000 },
          ).toString().trim();

          if (runIdOutput) {
            // Dedup: skip if we already posted a plan comment for this CI run
            const marker = `<!-- tf-plan-run-${runIdOutput} -->`;
            let alreadyPosted = false;
            try {
              const existingComments = execSync(
                `gh pr view "${branch}" --json comments --jq '.comments[].body'`,
                { cwd: repoRoot, stdio: "pipe", timeout: 30_000 },
              ).toString();
              alreadyPosted = existingComments.includes(marker);
            } catch { /* ignore — proceed to post */ }

            if (alreadyPosted) {
              console.log(`  📋 Terraform plan already posted for run ${runIdOutput} — skipping`);
            } else {
              const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "plan-"));
              execSync(`gh run download ${runIdOutput} -n plan-output -D "${tmpDir}"`, {
                cwd: repoRoot, stdio: "pipe", timeout: 60_000,
              });
              const planFile = path.join(tmpDir, "plan-output.txt");
              if (fs.existsSync(planFile)) {
                const planText = fs.readFileSync(planFile, "utf-8").trim();
                const commentBody = [
                  marker,
                  "### Terraform Plan — `success`",
                  "",
                  "<details><summary>Click to expand plan output</summary>",
                  "",
                  "```",
                  planText,
                  "```",
                  "",
                  "</details>",
                  "",
                  "> Comment `/dagent approve-infra` to apply this plan.",
                ].join("\n");
                const commentFile = path.join(tmpDir, "plan-comment.md");
                fs.writeFileSync(commentFile, commentBody, "utf-8");
                execSync(`gh pr comment "${branch}" --body-file "${commentFile}"`, {
                  cwd: repoRoot, stdio: "pipe", timeout: 30_000,
                });
                console.log(`  📋 Posted Terraform plan to Draft PR`);
              }
              fs.rmSync(tmpDir, { recursive: true, force: true });
            }
          }
        } catch (planErr) {
          console.warn(`  ⚠ Could not post plan to PR: ${planErr instanceof Error ? planErr.message : String(planErr)}`);
        }
      }

      await completeItem(slug, itemKey);
      console.log(`  ✅ ${itemKey} complete (all workflows passed)`);

      itemSummary.outcome = "completed";
      itemSummary.finishedAt = new Date().toISOString();
      itemSummary.durationMs = Date.now() - stepStart;
      itemSummary.intents.push("Deterministic CI poll — all workflows passed");
      pipelineSummaries.push(itemSummary);
      flushReports(config, state);
      return { summary: itemSummary, halt: false, createPr: false };
    } catch (err: unknown) {
      const execErr = err as { stdout?: Buffer; stderr?: Buffer; message?: string; status?: number };
      const ciLogs = execErr.stdout?.toString() ?? "";
      const ciStderr = execErr.stderr?.toString() ?? "";
      const capturedOutput = [ciLogs, ciStderr].filter(Boolean).join("\n");
      const message = execErr.message ?? String(err);

      // ── Exit code 2: Transient network error — sleep and retry ────
      // Do NOT alter DAG state. Do NOT call failItem(). Just wait.
      if (execErr.status === 2) {
        if (transientAttempt < MAX_TRANSIENT_RETRIES) {
          console.warn(`  ⚠ Transient CI poll error (attempt ${transientAttempt + 1}/${MAX_TRANSIENT_RETRIES}), retrying in ${TRANSIENT_BACKOFF_MS / 1000}s...`);
          await new Promise((resolve) => setTimeout(resolve, TRANSIENT_BACKOFF_MS));
          continue; // Retry — no state mutation
        }
        // Exhausted transient retries — treat as timeout
        console.warn(`  ⏳ Exhausted ${MAX_TRANSIENT_RETRIES} transient retries. Treating as timeout.`);
        await failItem(slug, itemKey, `CI polling hit ${MAX_TRANSIENT_RETRIES} transient network errors — will retry`);
        itemSummary.outcome = "failed";
        itemSummary.errorMessage = `CI polling transient errors exhausted — will retry`;
        itemSummary.finishedAt = new Date().toISOString();
        itemSummary.durationMs = Date.now() - stepStart;
        pipelineSummaries.push(itemSummary);
        flushReports(config, state);
        return { summary: itemSummary, halt: false, createPr: false };
      }

      // Re-echo for terminal visibility
      if (ciLogs) console.log(ciLogs);
      if (ciStderr) console.error(ciStderr);

      // ── Exit code 3 (cancellation) — NOT a code bug ────────────────
      if (execErr.status === 3) {
        console.warn(`  ⏳ CI polling was manually cancelled. Will retry on next loop.`);
        await failItem(slug, itemKey, `CI polling was manually cancelled — will retry`);
        itemSummary.outcome = "failed";
        itemSummary.errorMessage = `CI polling was manually cancelled — will retry`;
        itemSummary.finishedAt = new Date().toISOString();
        itemSummary.durationMs = Date.now() - stepStart;
        pipelineSummaries.push(itemSummary);
        flushReports(config, state);
        return { summary: itemSummary, halt: false, createPr: false };
      }

      console.error(`  ✖ CI poll failed or had failures: ${message}`);

      // ── File-based diagnostic handoff ──────────────────────────────
      let failureContext: string;
      try {
        const diagContent = fs.readFileSync(diagFile, "utf-8").trim();
        failureContext = diagContent || capturedOutput || message;
        if (diagContent) {
          console.log(`  📄 Read CI diagnostics from ${path.relative(repoRoot, diagFile)}`);
        }
      } catch {
        failureContext = capturedOutput || message;
      }

      await failItem(slug, itemKey, failureContext);

      itemSummary.outcome = "failed";
      itemSummary.errorMessage = failureContext;
      itemSummary.finishedAt = new Date().toISOString();
      itemSummary.durationMs = Date.now() - stepStart;
      pipelineSummaries.push(itemSummary);
      flushReports(config, state);

      const diagnostic = parseTriageDiagnostic(failureContext);
      const errorMsg = diagnostic ? diagnostic.diagnostic_trace : failureContext;
      return handleFailureReroute(slug, itemKey, failureContext, errorMsg, config, state, itemSummary, roamAvailable);
    }
  }

  // Should not reach here, but safety net
  return { summary: itemSummary, halt: false, createPr: false };
}

// ---------------------------------------------------------------------------
// Agent session
// ---------------------------------------------------------------------------

async function runAgentSession(
  client: CopilotClient,
  next: NextAction & { key: string },
  config: PipelineRunConfig,
  state: PipelineRunState,
  itemSummary: ItemSummary,
  stepStart: number,
): Promise<SessionResult> {
  const { slug, appRoot, repoRoot, baseBranch, apmContext, roamAvailable } = config;
  const { pipelineSummaries, attemptCounts, preStepRefs } = state;

  // Build agent context — manifest-driven fields replace hardcoded constants
  const currentState = await getStatus(slug);
  const agentContext: AgentContext = {
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

  const agentConfig = getAgentConfig(next.key, agentContext, apmContext);
  const timeout = getTimeout(next.key);

  // Create SDK session
  const session = await client.createSession({
    model: agentConfig.model,
    workingDirectory: repoRoot,
    onPermissionRequest: approveAll,
    systemMessage: { mode: "replace", content: agentConfig.systemMessage },
    ...(agentConfig.mcpServers
      ? { mcpServers: agentConfig.mcpServers as Record<string, MCPServerConfig> }
      : {}),
  });

  // Wire session event listeners
  const agentToolLimits = apmContext.agents[next.key]?.toolLimits;

  // Throttled heartbeat — writes _FLIGHT_DATA.json at most every 1.5 s
  // without calling the heavy Markdown/Git reporting functions.
  let lastHeartbeat = 0;
  let isSessionActive = true;
  const triggerHeartbeat = () => {
    if (!isSessionActive) return;
    if (Date.now() - lastHeartbeat < 1500) return;
    lastHeartbeat = Date.now();
    const liveSummaries = [...state.pipelineSummaries, { ...itemSummary, outcome: "in-progress" as const }];
    writeFlightData(config.appRoot, config.slug, liveSummaries, true);
  };

  wireToolLogging(session, itemSummary, repoRoot, agentToolLimits, triggerHeartbeat);
  const playwrightLog = wirePlaywrightLogging(session, next.key, triggerHeartbeat);
  wireIntentLogging(session, itemSummary);
  wireMessageCapture(session, itemSummary);
  wireUsageTracking(session, itemSummary, triggerHeartbeat);

  // Build task prompt with context injection
  let taskPrompt = buildTaskPrompt(
    { key: next.key, label: next.label },
    slug,
    appRoot,
  );

  const effectiveDevAttempts = await computeEffectiveDevAttempts(
    next.key,
    attemptCounts[next.key],
    slug,
  );

  // Inject retry context from previous attempt
  if (attemptCounts[next.key] > 1) {
    const prevAttempt = [...pipelineSummaries]
      .reverse()
      .find((s) => s.key === next.key);
    if (prevAttempt) {
      const atRevertThreshold = DEV_ITEMS.has(next.key) && effectiveDevAttempts >= 3;
      taskPrompt += buildRetryContext(prevAttempt, atRevertThreshold);
      console.log(`  📎 Injected retry context from attempt ${prevAttempt.attempt}`);
    }
  }

  // Inject downstream failure context
  const downstreamCtx = buildDownstreamFailureContext(next.key, pipelineSummaries);
  if (downstreamCtx) {
    taskPrompt += downstreamCtx;
    const downstreamCount = pipelineSummaries.filter(
      (s) => POST_DEPLOY_ITEMS.has(s.key) && s.outcome !== "completed",
    ).length;
    const involvesCicd = downstreamCtx.includes("Commit Scope Warning");
    console.log(
      `  🔗 Injected downstream failure context from ${downstreamCount} post-deploy item(s)${involvesCicd ? " (with CI/CD scope guidance)" : ""}`,
    );
  }

  // Inject clean-slate revert warning
  const revertWarning = buildRevertWarning(next.key, effectiveDevAttempts);
  if (revertWarning) {
    taskPrompt += revertWarning;
    console.log(
      `  🚨 Injected clean-slate revert warning (attempts: ${attemptCounts[next.key]} in-memory, ${effectiveDevAttempts - attemptCounts[next.key] >= 0 ? effectiveDevAttempts - attemptCounts[next.key] : 0} from persisted cycles, effective: ${effectiveDevAttempts})`,
    );
  }

  // Inject infra rollback context for infra-architect redevelopment
  if (next.key === "infra-architect") {
    const infraCtx = await buildInfraRollbackContext(slug);
    if (infraCtx) {
      taskPrompt += infraCtx;
      console.log(`  🏗 Injected infra rollback context from redevelop-infra error log`);
    }
  }

  // Write change manifest for docs-expert
  if (next.key === "docs-archived") {
    await writeChangeManifest(slug, appRoot, repoRoot, pipelineSummaries);
  }

  // --- Send prompt and wait ---
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
      flushReports(config, state);
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
        flushReports(config, state);
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
    isSessionActive = false;
    await session.disconnect();
  }

  // Record timing
  itemSummary.finishedAt = new Date().toISOString();
  itemSummary.durationMs = Date.now() - stepStart;

  // Record HEAD for circuit breaker (identical-error dedup)
  try { itemSummary.headAfterAttempt = execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf-8", timeout: 5_000 }).trim(); } catch { /* non-fatal */ }

  // NOTE: git diff augmentation removed — it caused cross-agent attribution
  // pollution when backend-dev and frontend-dev run in parallel. File tracking
  // now relies solely on SDK tool.execution_start events (write_file, edit_file,
  // create_file) plus shell write pattern detection in wireToolLogging().

  pipelineSummaries.push(itemSummary);
  flushReports(config, state);

  const isPlaywrightSession = next.key === "live-ui";
  if (isPlaywrightSession && playwrightLog.length > 0) {
    writePlaywrightLog(appRoot, repoRoot, slug, playwrightLog);
  }

  // After publish-pr, signal the orchestrator to archive and exit
  if (next.key === "publish-pr") {
    return { summary: itemSummary, halt: false, createPr: true };
  }

  // Re-read state to check status
  const postState = await getStatus(slug);
  const item = postState.items.find((i) => i.key === next.key);

  if (item?.status === "failed") {
    itemSummary.outcome = "failed";
    itemSummary.errorMessage = item.error ?? "Unknown failure";
    // Post-deploy & unit test failure reroute
    if (POST_DEPLOY_ITEMS.has(next.key) || TEST_ITEMS.has(next.key)) {
      const rawError = item.error ?? "Unknown failure";
      const diagnostic = parseTriageDiagnostic(rawError);
      const errorMsg = diagnostic ? diagnostic.diagnostic_trace : rawError;
      return handleFailureReroute(slug, next.key, rawError, errorMsg, config, state, itemSummary, roamAvailable);
    }
    // Infra-architect permission escalation → route to elevated deploy
    console.log(`  ⚠ ${next.key} failed — retrying on next loop iteration`);
  } else {
    console.log(`  ✅ ${next.key} complete`);
  }

  return { summary: itemSummary, halt: false, createPr: false };
}

// ---------------------------------------------------------------------------
// Post-deploy triage helpers
// ---------------------------------------------------------------------------

/**
 * Unified post-deploy failure handler — triages the error, routes to redevelopment,
 * and re-indexes the semantic graph. Used by both poll-ci (deterministic) and
 * agent sessions (live-ui, integration-test).
 */
async function handleFailureReroute(
  slug: string,
  itemKey: string,
  rawError: string,
  errorMsg: string,
  config: PipelineRunConfig,
  _state: PipelineRunState,
  itemSummary: ItemSummary,
  roamAvailable: boolean,
): Promise<SessionResult> {
  const { repoRoot } = config;

  const pipeState = await getStatus(slug);
  const naItems = new Set(
    pipeState.items.filter((i) => i.status === "na").map((i) => i.key),
  );
  const dirs = config.apmContext.config?.directories as Record<string, string | null> | undefined;
  const resetKeys = triageFailure(itemKey, rawError, naItems, dirs);

  // Empty array = unfixable error ("blocked" fault domain) — trigger Graceful Degradation
  if (resetKeys.length === 0) {
    console.error(`\n  🛑 BLOCKED: Unfixable error detected in ${itemKey} — triggering Graceful Degradation.`);
    console.error(`     Pipeline will skip tests and open a Draft PR for human remediation.`);
    try {
      await failItem(slug, itemKey, `BLOCKED: Unfixable error — ${errorMsg}`);
      await salvageForDraft(slug, itemKey);

      // Write flag for PR creator agent
      const draftFlagPath = path.join(config.appRoot, "in-progress", `${slug}.blocked-draft`);
      fs.writeFileSync(draftFlagPath, errorMsg, "utf-8");
    } catch (e) {
      console.error("  ✖ Failed to salvage pipeline state", e);
      return { summary: itemSummary, halt: true, createPr: false };
    }
    // halt: false — main loop continues to docs-archived → publish-pr
    return { summary: itemSummary, halt: false, createPr: false };
  }

  // ── Guard: detect unreachable dev items behind an incomplete approval gate ──
  // When poll-infra-plan (or other Wave 1 items) fail with a backend/frontend
  // error, triage routes to Wave 2 dev items. But if infra-handoff is not yet
  // done/na, those dev items can never run — resetting them plus the poll item
  // creates an infinite retry loop against the same failing CI run.
  const WAVE2_GATE = "infra-handoff";
  const gateStatus = pipeState.items.find((i) => i.key === WAVE2_GATE)?.status;
  const wave2Open = gateStatus === "done" || gateStatus === "na";
  const WAVE2_DEV_KEYS = new Set(["backend-dev", "backend-unit-test", "frontend-dev", "frontend-unit-test"]);

  if (!wave2Open) {
    const gatedKeys = resetKeys.filter((k) => WAVE2_DEV_KEYS.has(k));
    if (gatedKeys.length > 0) {
      console.warn(`\n  🚧 Triaged dev items [${gatedKeys.join(", ")}] are gated behind infra approval — cannot run in current wave.`);
      console.warn(`     This is likely a pre-existing CI failure unrelated to the current feature.`);
      console.warn(`     Fix the failing tests on the base branch or feature branch, then re-run the pipeline.`);
      // Don't reset — let the pipeline naturally block on the next getNextAvailable() call.
      // The item was already marked as failed by the caller.
      return { summary: itemSummary, halt: false, createPr: false };
    }
  }

  console.log(`\n  🔄 Post-deploy failure in ${itemKey} — rerouting to redevelopment`);
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

  return { summary: itemSummary, halt: false, createPr: false };
}

// ---------------------------------------------------------------------------
// Session event wiring
// ---------------------------------------------------------------------------

// Using `any` for the session parameter because the SDK's Session type is not exported
// and we only use the `.on()` method for event subscription.
/* eslint-disable @typescript-eslint/no-explicit-any */

function wireToolLogging(
  session: any,
  itemSummary: ItemSummary,
  repoRoot: string,
  toolLimits?: { soft?: number; hard?: number },
  triggerHeartbeat?: () => void,
): void {
  const softLimit = toolLimits?.soft ?? TOOL_COUNT_SOFT_LIMIT_DEFAULT;
  const hardLimit = toolLimits?.hard ?? TOOL_COUNT_HARD_LIMIT_DEFAULT;
  let softWarningFired = false;
  let hardLimitFired = false;
  session.on("tool.execution_start", (event: any) => {
    // After hard limit, ignore all further tool events
    if (hardLimitFired) return;

    const name = event.data.toolName;
    const label = TOOL_LABELS[name] ?? `🔧 ${name}`;
    const args = event.data.arguments as Record<string, unknown> | undefined;
    const detail = toolSummary(repoRoot, name, args);
    console.log(`  ${label}${detail}`);

    const category = TOOL_CATEGORIES[name] ?? name;
    itemSummary.toolCounts[category] = (itemSummary.toolCounts[category] ?? 0) + 1;

    // Cognitive Circuit Breaker — hard kill (soft interception is on tool.execution_complete)
    const totalCalls = Object.values(itemSummary.toolCounts).reduce((a, b) => a + b, 0);
    if (totalCalls >= hardLimit) {
      hardLimitFired = true;
      console.error(
        `\n  ✖ HARD LIMIT: Agent exceeded ${hardLimit} tool calls. ` +
        `Force-disconnecting session to prevent runaway compute waste.\n`,
      );
      itemSummary.errorMessage = `Cognitive circuit breaker: exceeded ${hardLimit} tool calls`;
      itemSummary.outcome = "error";
      session.disconnect().catch(() => { /* best-effort */ });
      return;
    }

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

        // Detect shell-based file writes (replaces the removed git diff augmentation)
        const shellFiles = extractShellWrittenFiles(cmd, repoRoot);
        for (const sf of shellFiles) {
          if (!itemSummary.filesChanged.includes(sf)) {
            itemSummary.filesChanged.push(sf);
          }
        }
      }
    }
  });

  // Soft interception: inject the Frustration Prompt into the tool result
  // so the LLM actually reads it on its next turn. console.warn is invisible
  // to the agent — this mutates the content the SDK sends back to the model.
  session.on("tool.execution_complete", (event: any) => {
    if (hardLimitFired) return;

    const totalCalls = Object.values(itemSummary.toolCounts).reduce((a, b) => a + b, 0);

    if (!softWarningFired && totalCalls >= softLimit) {
      softWarningFired = true;

      const frustrationPrompt =
        `\n\n⚠️ SYSTEM NOTICE: You have executed ${totalCalls} tool calls in this session ` +
        `(soft limit: ${softLimit}). You appear to be stuck in a debugging loop. ` +
        `If you are fighting a persistent testing framework limitation, document it ` +
        `with pipeline:doc-note and test.skip() the test. If this is a real ` +
        `implementation bug, use \`npm run pipeline:fail\` to trigger a redevelopment ` +
        `cycle. DO NOT continue debugging — decide now.`;

      // Mutate the result content that will be sent back to the LLM
      if (event.data.result && typeof event.data.result.content === "string") {
        event.data.result.content += frustrationPrompt;
      } else {
        event.data.result = { content: frustrationPrompt };
      }

      console.warn(
        `\n  ⚠️  COGNITIVE CIRCUIT BREAKER INJECTED: Agent passed soft limit of ${softLimit} calls.\n`,
      );
    }

    triggerHeartbeat?.();
  });
}

function wirePlaywrightLogging(session: any, itemKey: string, triggerHeartbeat?: () => void): PlaywrightLogEntry[] {
  const playwrightLog: PlaywrightLogEntry[] = [];
  if (itemKey !== "live-ui") return playwrightLog;

  session.on("tool.execution_start", (event: any) => {
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

  session.on("tool.execution_complete", (event: any) => {
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

    triggerHeartbeat?.();
  });

  return playwrightLog;
}

function wireIntentLogging(session: any, itemSummary: ItemSummary): void {
  session.on("assistant.intent", (event: any) => {
    console.log(`\n  💡 ${event.data.intent}\n`);
    itemSummary.intents.push(event.data.intent);
  });
}

function wireMessageCapture(session: any, itemSummary: ItemSummary): void {
  session.on("assistant.message", (event: any) => {
    const content = event.data.content.replace(/\n/g, " ").trim();
    if (content) {
      itemSummary.messages.push(content);
    }
  });
}

function wireUsageTracking(session: any, itemSummary: ItemSummary, triggerHeartbeat?: () => void): void {
  session.on("assistant.usage", (event: any) => {
    const d = event.data;
    const inp = d.inputTokens ?? 0;
    const out = d.outputTokens ?? 0;
    const cacheR = d.cacheReadTokens ?? 0;
    const cacheC = d.cacheWriteTokens ?? 0;
    if (inp === 0 && out === 0 && cacheR === 0 && cacheC === 0) return;
    itemSummary.inputTokens += inp;
    itemSummary.outputTokens += out;
    itemSummary.cacheReadTokens += cacheR;
    itemSummary.cacheWriteTokens += cacheC;
    console.log(`  📊 Tokens: +${inp}in / +${out}out / +${cacheR}cache-read / +${cacheC}cache-write`);
    triggerHeartbeat?.();
  });
}

/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Report flushing
// ---------------------------------------------------------------------------

/** Flush both report files (summary + terminal log) after each item completes */
function flushReports(config: PipelineRunConfig, state: PipelineRunState): void {
  const { appRoot, repoRoot, baseBranch, slug, apmContext } = config;
  writePipelineSummary(appRoot, repoRoot, slug, state.pipelineSummaries, apmContext, state.baseTelemetry);
  writeTerminalLog(appRoot, repoRoot, baseBranch, slug, state.pipelineSummaries, apmContext, state.baseTelemetry);
}
