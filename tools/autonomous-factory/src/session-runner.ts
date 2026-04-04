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
import { getStatus, failItem, resetForDev, resetForRedeploy, completeItem, salvageForDraft } from "./state.js";
import { getAgentConfig, buildTaskPrompt } from "./agents.js";
import type { AgentContext } from "./agents.js";
import type { ApmCompiledOutput, ApmConfig } from "./apm-types.js";
import type { NextAction, ItemSummary, PlaywrightLogEntry } from "./types.js";
import { executeHook, buildHookEnv } from "./hooks.js";
import { DEV_ITEMS, POST_DEPLOY_ITEMS, TEST_ITEMS } from "./types.js";
import { triageFailure, parseTriageDiagnostic } from "./triage.js";
import { getAutoSkipBaseRef, getMergeBase, getGitChangedFiles, getDirectoryPrefixes } from "./auto-skip.js";
import { writePipelineSummary, writeTerminalLog, writePlaywrightLog, writeFlightData } from "./reporting.js";
import {
  buildRetryContext,
  buildDownstreamFailureContext,
  buildInfraRollbackContext,
  buildRevertWarning,
  computeEffectiveDevAttempts,
  writeChangeManifest,
} from "./context-injection.js";
import { buildSessionHooks, buildCustomTools } from "./tool-harness.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Session timeouts per pipeline phase (ms) */
const TIMEOUT_DEV      = 1_200_000; // 20 min (dev items — heaviest workload)
const TIMEOUT_TEST     = 600_000;   // 10 min (unit test items — just running tests)
const TIMEOUT_DEFAULT  = 900_000;   // 15 min (fallback)
const TIMEOUT_DEPLOY   = 900_000;   // 15 min (push-code/poll-ci now deterministic; fallback agent gets 15 min)
const TIMEOUT_FINALIZE = 1_200_000; // 20 min (docs-archived, live-ui, integration-test)

const DEPLOY_ITEMS = new Set(["push-infra", "poll-infra-plan", "push-app", "poll-app-ci"]);
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
 * Maximum total time (ms) to wait for data-plane readiness before proceeding.
 * If all probes time out, the agent session starts anyway — the agent will
 * produce a structured diagnostic that triage can route.
 */
const READINESS_PROBE_TIMEOUT_MS = 180_000;

/**
 * HTTP status codes that indicate the data plane is live.
 * 200 = healthy, 401/403 = endpoint exists but auth required.
 */
const READINESS_OK_CODES = new Set([200, 401, 403]);

/**
 * Deterministic readiness probe — replaces the fixed-duration sleep.
 *
 * Primary: delegates to the `validateApp` hook from apm.yml, looping with
 * exponential backoff until the hook returns success (exit 0). This lets each
 * app define what "ready" means (e.g., feature routes propagated, not just
 * the root URL returning 200).
 *
 * Fallback: when no validateApp hook is configured, parses `infra-interfaces.md`
 * for base URLs and polls them with curl (backward compat).
 *
 * Stack-agnostic: only needs bash hooks or HTTP endpoints, not CI-provider commands.
 */
async function pollReadiness(config: PipelineRunConfig): Promise<void> {
  const hookCmd = config.apmContext.config?.hooks?.validateApp;

  // ── Primary path: hook-based readiness ──────────────────────────────────
  if (hookCmd) {
    console.log("  🔍 Readiness probe: polling via validateApp hook...");
    const start = Date.now();
    let delay = 2_000;
    const maxDelay = 30_000;

    while (Date.now() - start < READINESS_PROBE_TIMEOUT_MS) {
      const failure = runValidateApp(config);
      if (failure === null) {
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        console.log(`  ✅ App ready (validateApp hook passed) after ${elapsed}s`);
        return;
      }
      console.log(`  🔍 validateApp: ${failure.slice(0, 120)} (retrying in ${delay / 1000}s)`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, maxDelay);
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.warn(`  ⚠ Readiness probe timed out after ${elapsed}s — proceeding anyway`);
    return;
  }

  // ── Fallback: URL-based polling from infra-interfaces.md ────────────────
  const interfacesPath = path.join(config.appRoot, "in-progress", "infra-interfaces.md");
  if (!fs.existsSync(interfacesPath)) {
    console.log("  ⏳ No validateApp hook and no infra-interfaces.md — falling back to 60s propagation delay");
    await new Promise((resolve) => setTimeout(resolve, 60_000));
    return;
  }

  // Parse base URLs from the ## Endpoints section
  const content = fs.readFileSync(interfacesPath, "utf-8");
  const urls: string[] = [];
  let inEndpoints = false;
  for (const line of content.split("\n")) {
    if (/^##\s+Endpoints/i.test(line)) { inEndpoints = true; continue; }
    if (inEndpoints && /^##\s/.test(line)) break; // Next section
    if (inEndpoints) {
      const match = line.match(/https?:\/\/[^\s)>]+/);
      if (match) urls.push(match[0].replace(/\/+$/, ""));
    }
  }

  if (urls.length === 0) {
    console.log("  ⏳ No endpoint URLs found in infra-interfaces.md — falling back to 60s delay");
    await new Promise((resolve) => setTimeout(resolve, 60_000));
    return;
  }

  console.log(`  🔍 Readiness probe: checking ${urls.length} endpoint(s)...`);

  const start = Date.now();
  let delay = 2_000; // Start at 2s, exponential backoff
  const maxDelay = 30_000;

  while (Date.now() - start < READINESS_PROBE_TIMEOUT_MS) {
    let allReady = true;
    for (const url of urls) {
      try {
        const result = execSync(
          `curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${url}"`,
          { encoding: "utf-8", timeout: 15_000 },
        ).trim();
        const code = parseInt(result, 10);
        if (READINESS_OK_CODES.has(code)) {
          continue; // This URL is ready
        }
        allReady = false;
        console.log(`  🔍 ${url} → HTTP ${code} (not ready, retrying in ${delay / 1000}s)`);
      } catch {
        allReady = false;
        console.log(`  🔍 ${url} → connection failed (retrying in ${delay / 1000}s)`);
      }
    }

    if (allReady) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`  ✅ All endpoints ready after ${elapsed}s`);
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, delay));
    delay = Math.min(delay * 2, maxDelay);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.warn(`  ⚠ Readiness probe timed out after ${elapsed}s — proceeding anyway`);
}

/**
 * Map agent item keys to their owned directory prefixes for scoped git-diff
 * attribution. Prevents cross-agent pollution when backend-dev and frontend-dev
 * run in parallel. Returns empty array for agents without a clear directory scope
 * (e.g. code-cleanup, docs-archived), which falls back to "all non-state files".
 */
function getAgentDirectoryPrefixes(
  itemKey: string,
  appRel: string,
  directories?: Record<string, string | null>,
): string[] {
  const prefix = appRel ? `${appRel}/` : "";
  const backendDir = directories?.backend ?? "backend";
  const frontendDir = directories?.frontend ?? "frontend";
  const infraDir = directories?.infra ?? "infra";
  const e2eDir = directories?.e2e ?? "e2e";
  const packagesDir = "packages";

  switch (itemKey) {
    case "backend-dev":
    case "backend-unit-test":
    case "integration-test":
      return [`${prefix}${backendDir}/`, `${prefix}${packagesDir}/`, `${prefix}${infraDir}/`, ".github/"];
    case "frontend-dev":
    case "frontend-unit-test":
    case "live-ui":
      return [`${prefix}${frontendDir}/`, `${prefix}${packagesDir}/`, `${prefix}${e2eDir}/`, ".github/"];
    case "schema-dev":
      return [`${prefix}${packagesDir}/`];
    case "infra-architect":
      return [`${prefix}${infraDir}/`];
    default:
      return []; // No scope restriction — use all non-state files
  }
}

/**
 * Cognitive Circuit Breaker — absolute last-resort fallback.
 * Only used if apm.yml has neither per-agent toolLimits nor config.defaultToolLimits.
 * All real configuration should be in apm.yml.
 */
const TOOL_LIMIT_FALLBACK_SOFT = 30;
const TOOL_LIMIT_FALLBACK_HARD = 40;

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
  shell:        "🖥  StructuredShell",
  file_read:    "📄 SafeRead",
  view:         "👁  View",
  grep_search:  "🔍 Search",
  list_dir:     "📂 List",
  report_intent:"💭 Intent",
};

/** Group tool names into summary categories */
const TOOL_CATEGORIES: Record<string, string> = {
  read_file: "file-read",
  file_read: "file-read",
  view: "file-read",
  write_file: "file-write",
  edit_file: "file-edit",
  bash: "shell",
  write_bash: "shell",
  shell: "shell",
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
    case "write_bash":
    case "shell": {
      const cmd = String(args.command ?? "").split("\n")[0].slice(0, 80);
      const cwd = args.cwd ? ` (cwd: ${args.cwd})` : "";
      return cmd ? ` → ${cmd}${cwd}` : "";
    }
    case "file_read":
      return args.file_path ? ` → ${path.relative(repoRoot, String(args.file_path))}` : "";
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
 * Normalize a diagnostic trace for semantic comparison across retry cycles.
 * Strips dynamic metadata (git SHAs, timestamps, line numbers) that LLMs and
 * build systems inject, which would cause exact-match dedup to fail on
 * semantically identical errors.
 *
 * Based on standard enterprise log-aggregation normalization patterns.
 */
export function normalizeDiagnosticTrace(trace: string): string {
  return trace
    // ── Specific patterns first (before general SHA regex eats their targets) ──
    // Run IDs and numeric identifiers that change between CI runs
    // (must precede SHA regex — pure-digit run IDs like 12345678 are valid hex)
    .replace(/run\s+\d+/gi, "run <ID>")
    // "commit abc123" references (must precede general SHA regex)
    .replace(/commit\s+[0-9a-f]{7,40}/gi, "commit <SHA>")
    // HEAD (abc123) references (must precede general SHA regex)
    .replace(/HEAD\s*\([0-9a-f]+\)/gi, "HEAD (<SHA>)")
    // ── General patterns ──
    // Git SHAs (7-40 hex chars at word boundaries) — catches remaining bare SHAs
    .replace(/\b[0-9a-f]{7,40}\b/g, "<SHA>")
    // ISO timestamps (2026-03-24T01:22:42.123Z)
    .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z?/g, "<TS>")
    // Variable line numbers in error messages
    .replace(/line\s*~?\d+/gi, "line <N>")
    // Collapse whitespace
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Circuit breaker: skip retrying an item if the root cause is identical to the
 * previous attempt AND no meaningful code was committed in between.
 *
 * Compares normalized diagnostic_trace (not the full error JSON) to handle
 * dynamic metadata (SHAs, timestamps, line numbers) that LLMs inject. This
 * prevents groundhog-day loops where the triage correctly identifies the fix
 * but the dev agent can't persist it (e.g., commit scope mismatch).
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

  // Normalize traces to strip dynamic metadata (SHAs, timestamps, line numbers)
  // before comparison. LLMs inject build-specific entropy that defeats exact-match.
  if (normalizeDiagnosticTrace(lastTrace) !== normalizeDiagnosticTrace(prevTrace)) return false;

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
  /**
   * Last pushed commit SHA per push-item key ("push-infra" | "push-app").
   * Captured by runPushCode(), consumed by runPollCi() for SHA-pinned CI polling.
   * Scoped per-item to prevent cross-contamination if multiple push items ever
   * run in the same batch.
   */
  lastPushedShas: Record<string, string>;
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

      // For DEV items stuck in timeout loops, salvage to Draft PR instead of
      // halting — gives humans something to review rather than losing all work.
      const lastError = pipelineSummaries
        .filter((s) => s.key === next.key && s.outcome !== "completed")
        .pop()?.errorMessage ?? "";
      const isTimeoutLoop = lastError.toLowerCase().includes("timeout");

      if (DEV_ITEMS.has(next.key) && isTimeoutLoop) {
        console.log(`  📝 DEV item ${next.key} stuck in timeout loop — triggering Graceful Degradation to Draft PR`);
        try {
          await failItem(slug, next.key, "Circuit breaker: timeout loop — salvaging to Draft PR");
          await salvageForDraft(slug, next.key);
          const draftFlagPath = path.join(appRoot, "in-progress", `${slug}.blocked-draft`);
          fs.writeFileSync(draftFlagPath, `Circuit breaker: ${next.key} timeout loop after ${attemptCounts[next.key]} attempts`, "utf-8");
        } catch (e) {
          console.error("  ✖ Failed to salvage pipeline state", e);
          return { summary: skipSummary, halt: true, createPr: false };
        }
        return { summary: skipSummary, halt: false, createPr: false };
      }

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

  // ── Post-deploy readiness probe ────────────────────────────────────────
  // Replaces the fixed-duration sleep with a stack-agnostic readiness probe.
  // Parses infra-interfaces.md for endpoint URLs and polls with exponential
  // backoff until the data plane responds (HTTP 200/401/403) or timeout.
  if (LONG_ITEMS.has(next.key)) {
    await pollReadiness(config);
  }

  // ── Deterministic bypasses (no agent session) ─────────────────────────
  // DEPLOY_ITEMS must NEVER create an LLM session. push-* and poll-* are
  // handled by shell scripts — zero tokens, deterministic, no hallucination.
  if (DEPLOY_ITEMS.has(next.key)) {
    if (next.key === "push-infra" || next.key === "push-app") {
      return runPushCode(next.key, config, state, itemSummary, stepStart);
    }
    if (next.key === "poll-infra-plan" || next.key === "poll-app-ci") {
      return runPollCi(next.key, config, state, itemSummary, stepStart, roamAvailable);
    }
    // Safety: if a new deploy item is added to DEPLOY_ITEMS but not handled
    // above, fail loudly rather than falling through to an LLM session.
    throw new Error(
      `BUG: Deploy item "${next.key}" is in DEPLOY_ITEMS but has no deterministic handler. ` +
      `Never route deploy items to LLM sessions. Either add a handler or remove it from DEPLOY_ITEMS.`,
    );
  }

  // publish-pr is deterministic — reads artifacts, updates PR body, promotes
  // draft to ready. Zero LLM tokens.
  if (next.key === "publish-pr") {
    return runPublishPr(config, state, itemSummary, stepStart);
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
// Self-Mutating Validation Hooks
// ---------------------------------------------------------------------------

/**
 * Validate deployed application endpoints after CI completes.
 * Delegates to the `hooks.validateApp` command from apm.yml config.
 * The hook script is a self-mutating bash file — agents append endpoint
 * checks as they create new routes/services.
 *
 * Returns a failure reason string if exit code 1, or `null` if pass.
 */
function runValidateApp(config: PipelineRunConfig): string | null {
  const { appRoot, apmContext } = config;
  const hookCmd = apmContext.config?.hooks?.validateApp;
  if (!hookCmd) return null;

  const env = buildHookEnv(apmContext.config, {
    APP_ROOT: appRoot,
    REPO_ROOT: config.repoRoot,
  });

  try {
    const result = executeHook(hookCmd, env, appRoot, 60_000);
    if (!result) return null;
    if (result.exitCode === 1 && result.stdout) {
      return result.stdout;
    }
    return null; // Pass
  } catch {
    return null; // Inconclusive — let agent handle it
  }
}

/**
 * Validate deployed infrastructure reachability after infra-handoff.
 * Delegates to the `hooks.validateInfra` command from apm.yml config.
 * The hook script is a self-mutating bash file — @infra-architect appends
 * reachability checks as new data-plane resources are provisioned.
 *
 * Returns a failure reason string if exit code 1, or `null` if pass.
 */
function runValidateInfra(config: PipelineRunConfig): string | null {
  const { appRoot, apmContext } = config;
  const hookCmd = apmContext.config?.hooks?.validateInfra;
  if (!hookCmd) return null;

  const env = buildHookEnv(apmContext.config, {
    APP_ROOT: appRoot,
    REPO_ROOT: config.repoRoot,
  });

  try {
    const result = executeHook(hookCmd, env, appRoot, 60_000);
    if (!result) return null;
    if (result.exitCode === 1 && result.stdout) {
      return result.stdout;
    }
    return null; // Pass
  } catch {
    return null; // Inconclusive — let agent handle it
  }
}

// ---------------------------------------------------------------------------
// Deterministic bypasses
// ---------------------------------------------------------------------------

/** Map push items to their poll counterparts for SHA lookup */
const PUSH_TO_POLL: Record<string, string> = {
  "poll-infra-plan": "push-infra",
  "poll-app-ci": "push-app",
};

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
      state.lastPushedShas[itemKey] = execSync("git rev-parse HEAD", {
        cwd: repoRoot, encoding: "utf-8", timeout: 5_000,
      }).trim();
    } catch { /* non-fatal */ }

    // ── State-aware force-deploy sentinel ────────────────────────────────
    // Pipeline state commits use [skip ci], which can bury real code commits
    // and prevent path-based CI triggers from firing. To guarantee deployments,
    // touch a `.deploy-trigger` sentinel file in each directory that actually
    // changed, then commit+push WITHOUT [skip ci]. This is pure Git math —
    // $0.00, fully CI-provider-agnostic.
    if (itemKey === "push-app") {
      try {
        const dirs = apmContext.config?.directories as Record<string, string | null> | undefined;
        const mergeBase = getMergeBase(repoRoot, baseBranch);
        if (mergeBase && dirs) {
          const appRel = path.relative(repoRoot, appRoot);
          const dirPrefixes = getDirectoryPrefixes(appRel, dirs);
          const changedFiles = getGitChangedFiles(repoRoot, mergeBase);

          const sentinelsTouched: string[] = [];
          for (const [domain, prefixes] of Object.entries(dirPrefixes)) {
            const hasChanges = changedFiles.some((f) => prefixes.some((p) => f.startsWith(p)));
            if (hasChanges) {
              const dirPath = dirs[domain];
              if (dirPath) {
                const sentinelPath = path.join(appRoot, dirPath, ".deploy-trigger");
                fs.writeFileSync(sentinelPath, new Date().toISOString() + "\n", "utf-8");
                sentinelsTouched.push(`${appRel}/${dirPath}/.deploy-trigger`);
              }
            }
          }

          if (sentinelsTouched.length > 0) {
            console.log(`  🚀 Deploy sentinel: touching ${sentinelsTouched.length} trigger(s): ${sentinelsTouched.join(", ")}`);
            try {
              execSync(`bash "${commitScript}" all "ci(${slug}): trigger deployment"`, {
                cwd: repoRoot, stdio: "pipe", timeout: 30_000,
                env: { ...process.env, APP_ROOT: appRoot },
              });
            } catch { /* no changes — sentinel already up to date */ }
            execSync(`bash "${branchScript}" push`, {
              cwd: repoRoot, stdio: "inherit", timeout: 60_000,
              env: { ...process.env, BASE_BRANCH: baseBranch },
            });
            // Update SHA to the sentinel commit for CI polling
            try {
              state.lastPushedShas[itemKey] = execSync("git rev-parse HEAD", {
                cwd: repoRoot, encoding: "utf-8", timeout: 5_000,
              }).trim();
            } catch { /* non-fatal */ }
          }
        }
      } catch (sentinelErr) {
        // Non-fatal — the initial push already went through
        console.warn(`  ⚠ Deploy sentinel failed: ${sentinelErr instanceof Error ? sentinelErr.message : String(sentinelErr)}`);
      }
    }

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

  // Resolve the pushed SHA from the corresponding push item
  const pushItemKey = PUSH_TO_POLL[itemKey];
  const lastPushedSha = pushItemKey ? state.lastPushedShas[pushItemKey] ?? null : null;

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
          const infraPlanFile = config.apmContext.config?.ciWorkflows?.infraPlanFile ?? "deploy-infra.yml";
          const runIdOutput = execSync(
            `gh run list --branch "${branch}" --workflow ${infraPlanFile} --status success --limit 1 --json databaseId -q '.[0].databaseId'`,
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

      // ── poll-app-ci: validate deployed app endpoints ──────────────────
      // Runs the self-mutating validateApp hook. If the app is dead despite
      // CI passing, fail immediately and trigger triage before expensive
      // post-deploy agents (live-ui, integration-test) boot up.
      if (itemKey === "poll-app-ci") {
        const appFailure = runValidateApp(config);
        if (appFailure) {
          console.error(`  🚫 App validation failed after CI: ${appFailure}`);
          const failMsg = JSON.stringify({ fault_domain: "deployment-stale", diagnostic_trace: `validateApp hook: ${appFailure}` });
          try { await failItem(slug, itemKey, failMsg); } catch { /* best-effort */ }
          itemSummary.outcome = "failed";
          itemSummary.errorMessage = failMsg;
          itemSummary.finishedAt = new Date().toISOString();
          itemSummary.durationMs = Date.now() - stepStart;
          itemSummary.intents.push(`App validation failed — blocking before post-deploy agents`);
          pipelineSummaries.push(itemSummary);
          flushReports(config, state);
          return handleFailureReroute(slug, itemKey, failMsg, appFailure, config, state, itemSummary, roamAvailable);
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
// Deterministic publish-pr handler
// ---------------------------------------------------------------------------

/**
 * Replaces the former LLM-based publish-pr agent. Deterministically:
 * 1. Reads existing Draft PR body
 * 2. Appends Wave 2 artifacts (_SUMMARY.md, _RISK-ASSESSMENT.md, _ARCHITECTURE.md)
 * 3. Promotes Draft → Ready for Review
 * 4. Commits state changes and returns createPr: true to trigger archiving
 */
async function runPublishPr(
  config: PipelineRunConfig,
  state: PipelineRunState,
  itemSummary: ItemSummary,
  stepStart: number,
): Promise<SessionResult> {
  const { slug, appRoot, repoRoot } = config;
  const { pipelineSummaries } = state;
  const inProgressDir = path.join(appRoot, "in-progress");
  const commitScript = path.join(repoRoot, "tools", "autonomous-factory", "agent-commit.sh");

  console.log(`  📋 publish-pr: Running deterministic PR publish (no agent session)`);
  let tmpDir: string | null = null;
  try {
    // 1. Get existing PR number
    const prNumber = execSync(`gh pr view --json number -q '.number'`, {
      cwd: repoRoot, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], timeout: 30_000,
    }).trim();
    if (!prNumber) throw new Error("No existing Draft PR found");
    console.log(`     Found existing PR #${prNumber}`);

    // 2. Fetch existing body
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "publish-pr-"));
    const existingBodyFile = path.join(tmpDir, "existing.md");
    const existingBody = execSync(`gh pr view ${prNumber} --json body -q '.body'`, {
      cwd: repoRoot, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], timeout: 30_000,
    });
    fs.writeFileSync(existingBodyFile, existingBody, "utf-8");

    // 3. Build Wave 2 appendix from pipeline artifacts
    const appendixParts: string[] = [
      "",
      "---",
      "",
      "## Wave 2 — Application Development Results",
      "",
    ];

    // Summary
    const summaryPath = path.join(inProgressDir, `${slug}_SUMMARY.md`);
    if (fs.existsSync(summaryPath)) {
      const summary = fs.readFileSync(summaryPath, "utf-8").trim();
      appendixParts.push("### Pipeline Summary", "", summary, "");
    }

    // Risk Assessment
    const riskPath = path.join(inProgressDir, `${slug}_RISK-ASSESSMENT.md`);
    if (fs.existsSync(riskPath)) {
      const risk = fs.readFileSync(riskPath, "utf-8").trim();
      appendixParts.push("### Risk Assessment", "", risk, "");
    }

    // Architecture
    const archPath = path.join(inProgressDir, `${slug}_ARCHITECTURE.md`);
    if (fs.existsSync(archPath)) {
      const arch = fs.readFileSync(archPath, "utf-8").trim();
      appendixParts.push("### Architecture", "", arch, "");
    }

    // Playwright Log
    const playwrightPath = path.join(inProgressDir, `${slug}_PLAYWRIGHT-LOG.md`);
    if (fs.existsSync(playwrightPath)) {
      const playwright = fs.readFileSync(playwrightPath, "utf-8").trim();
      appendixParts.push("### E2E Test Results", "", playwright, "");
    }

    // 4. Combine and update PR body (never overwrite — always append)
    const combinedFile = path.join(tmpDir, "combined.md");
    const combinedBody = existingBody + appendixParts.join("\n");
    fs.writeFileSync(combinedFile, combinedBody, "utf-8");
    execSync(`gh pr edit ${prNumber} --body-file "${combinedFile}"`, {
      cwd: repoRoot, stdio: "pipe", timeout: 30_000,
    });
    console.log(`     Updated PR #${prNumber} body with Wave 2 appendix`);

    // 5. Promote Draft → Ready for Review
    try {
      execSync(`gh pr ready ${prNumber}`, {
        cwd: repoRoot, stdio: "pipe", timeout: 30_000,
      });
      console.log(`     Promoted PR #${prNumber} to ready-for-review`);
    } catch {
      // PR may already be ready (not a draft) — non-fatal
      console.warn(`     ⚠ Could not promote PR (may already be ready)`);
    }

    // 6. Complete pipeline item
    await completeItem(slug, "publish-pr");

    // 7. Commit state changes
    try {
      execSync(`bash "${commitScript}" all "chore(${slug}): publish PR #${prNumber}"`, {
        cwd: repoRoot, stdio: "pipe", timeout: 30_000,
        env: { ...process.env, APP_ROOT: appRoot },
      });
    } catch { /* no changes to commit — OK */ }

    console.log(`  ✅ publish-pr complete (deterministic)`);
    itemSummary.outcome = "completed";
    itemSummary.finishedAt = new Date().toISOString();
    itemSummary.durationMs = Date.now() - stepStart;
    itemSummary.intents.push("Deterministic PR publish — no agent session");
    pipelineSummaries.push(itemSummary);
    flushReports(config, state);
    return { summary: itemSummary, halt: false, createPr: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`  ✖ Deterministic PR publish failed: ${message}`);
    try {
      await failItem(slug, "publish-pr", `Deterministic PR publish failed: ${message}`);
    } catch { /* best-effort */ }
    itemSummary.outcome = "failed";
    itemSummary.errorMessage = `Deterministic PR publish failed: ${message}`;
    itemSummary.finishedAt = new Date().toISOString();
    itemSummary.durationMs = Date.now() - stepStart;
    pipelineSummaries.push(itemSummary);
    flushReports(config, state);
    return { summary: itemSummary, halt: false, createPr: false };
  } finally {
    if (tmpDir) {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
    }
  }
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
    environment: apmContext.config?.environment as Record<string, string> | undefined,
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
    tools: buildCustomTools(repoRoot),
    hooks: buildSessionHooks(repoRoot),
    ...(agentConfig.mcpServers
      ? { mcpServers: agentConfig.mcpServers as Record<string, MCPServerConfig> }
      : {}),
  });

  // Wire session event listeners
  const manifestDefaults = apmContext.config?.defaultToolLimits;
  const agentToolLimits = apmContext.agents[next.key]?.toolLimits;
  // Resolution order: per-agent → manifest default → last-resort fallback
  const resolvedToolLimits = {
    soft: agentToolLimits?.soft ?? manifestDefaults?.soft ?? TOOL_LIMIT_FALLBACK_SOFT,
    hard: agentToolLimits?.hard ?? manifestDefaults?.hard ?? TOOL_LIMIT_FALLBACK_HARD,
  };

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

  wireToolLogging(session, itemSummary, repoRoot, resolvedToolLimits, timeout, triggerHeartbeat);
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
  const downstreamCtx = buildDownstreamFailureContext(
    next.key,
    pipelineSummaries,
    apmContext.config?.ciWorkflows?.filePatterns as string[] | undefined,
  );
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

  // Git-diff fallback for filesChanged tracking.
  // SDK tool.execution_start events (write_file, edit_file, create_file) are
  // the primary source, but they can miss files written by shell commands that
  // don't match SHELL_WRITE_PATTERNS (e.g. tool-generated code, npm scripts).
  //
  // To avoid cross-agent attribution pollution in parallel runs, the diff is
  // scoped to the agent's directories (from APM config.directories).
  if (itemSummary.filesChanged.length === 0 && preStepRefs[next.key]) {
    try {
      const diffOutput = execSync(
        `git diff --name-only ${preStepRefs[next.key]}..HEAD`,
        { cwd: repoRoot, encoding: "utf-8", timeout: 10_000 },
      ).trim();
      if (diffOutput) {
        const appRel = path.relative(repoRoot, appRoot);
        const dirs = apmContext.config?.directories as Record<string, string | null> | undefined;
        // Build allowed directory prefixes for this agent to prevent cross-attribution
        const allowedPrefixes = getAgentDirectoryPrefixes(next.key, appRel, dirs);
        const diffFiles = diffOutput.split("\n").filter(Boolean);
        const scopedFiles = allowedPrefixes.length > 0
          ? diffFiles.filter((f) => allowedPrefixes.some((p) => f.startsWith(p)))
          : diffFiles.filter((f) => !f.includes("in-progress/"));
        for (const f of scopedFiles) {
          if (!itemSummary.filesChanged.includes(f)) {
            itemSummary.filesChanged.push(f);
          }
        }
        if (scopedFiles.length > 0) {
          console.log(`  📂 Git-diff fallback: attributed ${scopedFiles.length} file(s) to ${next.key}`);
        }
      }
    } catch { /* non-fatal — SDK tracking is the primary source */ }
  }

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
    // ── Infra-handoff post-completion: validate infrastructure reachability ──
    // Runs the self-mutating validateInfra hook after the agent successfully
    // documents infra outputs. If newly provisioned resources are unreachable,
    // fail with "infra" fault domain → triage resets ["infra-architect", "infra-handoff"].
    if (next.key === "infra-handoff") {
      const infraFailure = runValidateInfra(config);
      if (infraFailure) {
        console.error(`  🚫 Infra validation failed after ${next.key}: ${infraFailure}`);
        const failMsg = JSON.stringify({ fault_domain: "infra", diagnostic_trace: `validateInfra hook: ${infraFailure}` });
        try { await failItem(slug, next.key, failMsg); } catch { /* best-effort */ }
        itemSummary.outcome = "failed";
        itemSummary.errorMessage = failMsg;
        flushReports(config, state);
        return handleFailureReroute(slug, next.key, failMsg, infraFailure, config, state, itemSummary, roamAvailable);
      }
    }
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
  const ciFilePatterns = config.apmContext.config?.ciWorkflows?.filePatterns as string[] | undefined;
  const resetKeys = triageFailure(itemKey, rawError, naItems, dirs, ciFilePatterns);

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

  // Branch: if triage targets only deploy/post-deploy items (no dev or test code
  // changes needed), use the separate re-deploy budget instead of burning a full
  // redevelopment cycle. This handles "deployment-stale" faults deterministically.
  // TEST_ITEMS also imply code changes (test failures need dev fixes), so they
  // route to the full redevelopment path alongside DEV_ITEMS.
  const hasDevOrTestItems = resetKeys.some((k) => DEV_ITEMS.has(k) || TEST_ITEMS.has(k));

  try {
    if (hasDevOrTestItems) {
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
    } else {
      const result = await resetForRedeploy(slug, resetKeys, errorMsg);
      if (result.halted) {
        console.error(
          `  ✖ HALTED: ${result.cycleCount} re-deploy cycles exhausted. Exiting.`,
        );
        return { summary: itemSummary, halt: true, createPr: false };
      }
      console.log(
        `     Re-deploy cycle ${result.cycleCount}/3 — pipeline will restart from deploy`,
      );
      // No roam re-indexing needed — no code changes, just re-push and re-poll
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
  toolLimits: { soft: number; hard: number },
  sessionTimeout: number,
  triggerHeartbeat?: () => void,
): void {
  const softLimit = toolLimits.soft;
  const hardLimit = toolLimits.hard;
  let softWarningFired = false;
  let hardLimitFired = false;
  /** Pre-timeout wrap-up signal — fires at 80% of session timeout */
  let preTimeoutFired = false;
  const sessionStartMs = Date.now();
  const preTimeoutThresholdMs = sessionTimeout * 0.8;
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

    if (name === "bash" || name === "write_bash" || name === "shell") {
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

    // Track file_read file paths
    if (name === "file_read") {
      const fp = args?.file_path ? path.relative(repoRoot, String(args.file_path)) : null;
      if (fp && !itemSummary.filesRead.includes(fp)) {
        itemSummary.filesRead.push(fp);
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

    // Pre-timeout wrap-up signal — at 80% of session timeout, inject a
    // "wrap up NOW" directive so the LLM can commit and complete gracefully
    // instead of being hard-killed by the timeout.
    if (!preTimeoutFired && (Date.now() - sessionStartMs) >= preTimeoutThresholdMs) {
      preTimeoutFired = true;
      const remainingSec = Math.round((sessionTimeout - (Date.now() - sessionStartMs)) / 1000);
      const wrapUpPrompt =
        `\n\n⏰ SYSTEM NOTICE: Session timeout approaching — ~${remainingSec}s remaining. ` +
        `You MUST wrap up NOW. Commit whatever work you have completed so far via ` +
        `agent-commit.sh, then call pipeline:complete if the feature is functional, ` +
        `or pipeline:fail with a diagnostic if it is not. ` +
        `Do NOT start new exploratory work. Prioritize: commit → test → complete/fail.`;

      if (event.data.result && typeof event.data.result.content === "string") {
        event.data.result.content += wrapUpPrompt;
      } else {
        event.data.result = { content: wrapUpPrompt };
      }

      console.warn(
        `\n  ⏰ PRE-TIMEOUT WARNING INJECTED: ~${remainingSec}s remaining before session timeout.\n`,
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
