/**
 * triage/context-builder.ts — Context composition for failure cycles.
 *
 * Migrated from context-injection.ts to consolidate all failure-related
 * context into the triage subsystem. These pure string builders produce
 * prompt fragments that are persisted as `pendingContext` by the triage
 * handler and consumed by copilot-agent during the next invocation.
 *
 * Functions:
 *   - buildRetryContext — previous-attempt summary for in-memory retries
 *   - buildDownstreamFailureContext — redevelopment context from post-deploy failures
 *   - buildRevertWarning — clean-slate revert recommendation
 *   - buildTriageRejectionContext — triage reroute notification
 *   - checkRetryDedup — retry dedup guard (migrated from node-wrapper)
 */

import fs from "node:fs";
import path from "node:path";
import type { ItemSummary, TriageRecord, ExecutionRecord } from "../types.js";
import { RESET_OPS, REDEVELOPMENT_RESET_OPS } from "../types.js";
import type { PipelineState } from "../types.js";
// Direct import of the file-state I/O helpers. `context-builder` is part of
// the triage subsystem and is allowed to read state synchronously; wrapping
// it behind the StateStore port would force every caller to thread the port
// through. `readStateOrThrow` throws on missing files (catch-able below);
// the old CLI-backed `readState` would call process.exit mid-session.
import { readStateOrThrow } from "../adapters/file-state/io.js";
import { computeErrorSignature } from "./error-fingerprint.js";
import { getHeadSha } from "../session/dag-utils.js";

// ---------------------------------------------------------------------------
// Retry context (in-memory attempt > 1)
// ---------------------------------------------------------------------------

/**
 * Build retry context from a previous failed attempt.
 * Injected when attemptCounts > 1 so the agent doesn't start from scratch.
 */
export function buildRetryContext(
  prevAttempt: ItemSummary,
  atRevertThreshold: boolean,
): string {
  const isTimeout = prevAttempt.outcome === "error" &&
    (prevAttempt.errorMessage?.includes("Timeout") || prevAttempt.errorMessage?.includes("timeout"));

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
    // When the revert warning will fire, skip incremental advice — the agent should wipe and restart
    atRevertThreshold
      ? ""
      : isTimeout
        // Timeout-specific scope reduction: previous session ran out of time, not failed with an error
        ? `\nThe previous session ran out of time (not a code error). ` +
          `Start by checking what was already done: \`git status\`, run tests. ` +
          `Focus ONLY on unfinished work — do NOT re-read the full codebase or redo completed steps. ` +
          (prevAttempt.filesChanged.length > 0
            ? `The files listed above were already modified — verify they are correct, then move to the next task.`
            : `Check git log for any commits from the prior attempt.`)
        : `\nStart by checking what was already done (git status, run tests) rather than re-reading the full codebase from scratch.`,
  ];
  return retryLines.filter(Boolean).join("\n");
}

// ---------------------------------------------------------------------------
// Downstream failure context (redevelopment cycles)
// ---------------------------------------------------------------------------

/**
 * Extract structured diagnosis from the pipeline state's `lastTriageRecord`.
 * The kernel persists this after every triage node execution — it contains
 * the full classification result (domain, reason, RAG matches, LLM output).
 *
 * Returns a formatted "### Automated Diagnosis" section, or empty string if
 * no triage record is available.
 */
function extractDiagnosisFromState(slug?: string): string {
  if (!slug) return "";

  let record: TriageRecord | null | undefined;
  try {
    const appRoot = process.env.APP_ROOT || "";
    const stateDir = path.join(appRoot, "in-progress");
    const statePath = path.join(stateDir, `${slug}_STATE.json`);
    if (fs.existsSync(statePath)) {
      const raw = JSON.parse(fs.readFileSync(statePath, "utf-8"));
      record = raw.lastTriageRecord;
    }
  } catch { /* noop */ }

  if (!record) return "";

  const parts = ["\n### Automated Diagnosis (from triage system)"];
  parts.push(`**Root Cause:** ${record.reason}`);
  parts.push(`**Fault Domain:** ${record.domain}`);
  parts.push(`**Classification Source:** ${record.source}${record.rag_matches?.[0]?.snippet ? ` (RAG match: "${record.rag_matches[0].snippet}")` : ""}`);
  parts.push(`**Error Signature:** ${record.error_signature}`);
  if (record.llm_invoked && record.llm_reason) {
    parts.push(`**LLM Assessment:** ${record.llm_reason}`);
  }
  parts.push("\n**Use this diagnosis as your starting point. Do NOT re-investigate from scratch.**");

  return parts.join("\n");
}

/**
 * Check whether the current downstream error signature matches a prior
 * redevelopment cycle's error. Returns a warning string if the dev agent
 * failed to fix the issue (identical error after redevelopment), else "".
 */
function buildIdenticalErrorWarning(
  downstreamFailures: readonly ItemSummary[],
  slug?: string,
): string {
  if (!slug) return "";
  const currentError = downstreamFailures[downstreamFailures.length - 1]?.errorMessage;
  if (!currentError) return "";

  const currentSig = computeErrorSignature(currentError);

  // readState is async (lazy-loaded .mjs), but this function is called
  // synchronously from a string builder. Use a sync fallback via the
  // filesystem directly to avoid breaking the call chain.
  let errorLog: Array<{ itemKey: string; errorSignature?: string | null }> = [];
  try {
    const appRoot = process.env.APP_ROOT || "";
    const stateDir = path.join(appRoot, "in-progress");
    const statePath = path.join(stateDir, `${slug}_STATE.json`);
    if (fs.existsSync(statePath)) {
      const raw = JSON.parse(fs.readFileSync(statePath, "utf-8"));
      errorLog = raw.errorLog ?? [];
    }
  } catch { /* noop */ }

  try {
    const priorRedevEntries = errorLog.filter(
      (e) => (REDEVELOPMENT_RESET_OPS as readonly string[]).includes(e.itemKey) && e.errorSignature,
    );
    const matchCount = priorRedevEntries.filter(
      (e) => e.errorSignature === currentSig,
    ).length;

    if (matchCount >= 1) {
      return `\n\n## ⚠️ IDENTICAL ERROR DETECTED (${matchCount + 1}× same root cause)`
        + `\nThe downstream test failed with the **IDENTICAL error signature** as the previous redevelopment cycle.`
        + `\nYour last change did NOT address the root cause.`
        + `\n\n**Do NOT repeat the same fix.** Re-read the error output above with fresh eyes and try a fundamentally different approach.`
        + (matchCount >= 2
          ? `\n\n**ESCALATION WARNING:** This is the ${matchCount + 1}th identical failure. If you cannot resolve this, the pipeline will be blocked for human review.`
          : "");
    }
  } catch { /* state read failed — no warning */ }

  return "";
}

/**
 * Build downstream failure context when a dev item is re-invoked
 * after a post-deploy failure (live-ui, integration-test).
 * Returns empty string if no downstream failures exist.
 */
export function buildDownstreamFailureContext(
  itemKey: string,
  pipelineSummaries: readonly ItemSummary[],
  ciWorkflowFilePatterns?: string[],
  /** Config-driven commit scope warning text (from apm.yml config.ci_scope_warning). */
  ciScopeWarning?: string,
  /** Feature slug — used for cross-cycle error signature comparison. */
  slug?: string,
  /** Whether this node receives downstream failure context (from resolveCircuitBreaker). */
  allowsRevertBypass?: boolean,
): string {
  if (!allowsRevertBypass) return "";

  const downstreamFailures = pipelineSummaries.filter(
    (s) => s.outcome !== "completed",
  ).filter((s) => s.key !== itemKey);
  if (downstreamFailures.length === 0) return "";

  // --- K2: Extract structured diagnosis from triage system ---
  const diagnosisSection = extractDiagnosisFromState(slug);

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

  // Inject config-driven scope warning when CI/CD files are detected in the error
  let scopeGuidance = "";
  if (ciScopeWarning) {
    const lastError = downstreamFailures[downstreamFailures.length - 1]?.errorMessage ?? "";
    const cicdFilePatterns = [".github/workflows", ...(ciWorkflowFilePatterns ?? [])];
    const involvesCicd = cicdFilePatterns.some((p) => lastError.includes(p));
    if (involvesCicd) {
      scopeGuidance = `\n\n${ciScopeWarning}`;
    }
  }

  // Cross-cycle error signature comparison — detect "same error after redevelopment"
  const identicalErrorWarning = buildIdenticalErrorWarning(downstreamFailures, slug);

  return `\n\n## Redevelopment Context (CRITICAL)\nThe following post-deploy verification steps failed. Fix the root cause in your code:\n${diagnosisSection}\n${failureDetails}\n\nFocus on the errors above — they describe exactly what broke in production.${scopeGuidance}${identicalErrorWarning}`;
}

// ---------------------------------------------------------------------------
// Revert warning (clean-slate recommendation)
// ---------------------------------------------------------------------------

/**
 * Build the clean-slate revert warning for agents stuck in a loop.
 * Returns empty string if the threshold hasn't been reached or the node
 * doesn't allow revert bypass (per circuit_breaker config).
 */
export function buildRevertWarning(
  itemKey: string,
  effectiveDevAttempts: number,
  /** Whether this node allows revert bypass (from resolveCircuitBreaker). */
  allowsRevertBypass?: boolean,
  /** Threshold for injecting revert warning (from resolveCircuitBreaker). */
  revertWarningAt?: number,
): string {
  const threshold = revertWarningAt ?? 3;
  if (!allowsRevertBypass || effectiveDevAttempts < threshold) return "";

  return `\n\n## 🚨 CRITICAL SYSTEM WARNING\nYou have failed to fix this feature ${effectiveDevAttempts} times. You are likely trapped in a hallucination loop. `
    + `RECOMMENDED ACTION: Run \`bash tools/autonomous-factory/agent-branch.sh revert\` to physically wipe the codebase clean back to the main branch. `
    + `Then, re-explore the codebase and build this feature using a completely different architectural approach.`;
}

// ---------------------------------------------------------------------------
// Triage rejection context (reroute notification)
// ---------------------------------------------------------------------------

/**
 * Build triage-rejection context when an agent is re-invoked after a
 * triage reroute reset nodes for redevelopment.
 * Returns the rejection reason so the agent knows what to fix.
 *
 * @param slug - Feature slug
 * @param narrative - Domain-specific explanation injected into the prompt.
 *   Default: generic "previous deployment wave failed" message.
 */
export async function buildTriageRejectionContext(
  slug: string,
  narrative?: string,
): Promise<string> {
  try {
    const state = readStateOrThrow(slug);
    // Check both legacy RESET_PHASES entries and new RESET_FOR_REROUTE entries
    const rejectionEntries = state.errorLog.filter((e) =>
      e.itemKey === RESET_OPS.RESET_PHASES || e.itemKey === RESET_OPS.RESET_FOR_REROUTE
    );
    if (rejectionEntries.length === 0) return "";
    const latest = rejectionEntries[rejectionEntries.length - 1];
    const header = narrative
      ?? "A downstream failure triggered redevelopment:";
    return (
      `\n\n## ⚠️ TRIAGE REROUTE — REDEVELOPMENT REQUIRED\n`
      + `${header}\n\n`
      + `> ${latest.message}\n\n`
      + `You MUST address this requirement before completing this task.`
    );
  } catch {
    return "";
  }
}

/** @deprecated Use `buildTriageRejectionContext`. */
export const buildPhaseRejectionContext = buildTriageRejectionContext;

/** @deprecated Use `buildTriageRejectionContext`. */
export const buildInfraRollbackContext = (slug: string) => buildTriageRejectionContext(slug,
  "The previous application deployment wave failed because the following infrastructure was missing or misconfigured:");

// ---------------------------------------------------------------------------
// Retry dedup guard (migrated from node-wrapper)
// ---------------------------------------------------------------------------

/**
 * Check whether the execution log shows a repeated identical error with no
 * code changes. If the same error signature was produced at the same HEAD,
 * retrying is pointless.
 *
 * Returns a description of why the retry should be blocked, or null to proceed.
 * This is a pre-guard for the triage system — the triage handler calls this
 * before running classification.
 */
export function checkRetryDedup(
  nodeKey: string,
  attempt: number,
  executionLog: ExecutionRecord[],
  repoRoot: string,
  allowsRevertBypass: boolean,
): { halt: boolean; reason: string } | null {
  if (attempt <= 1) return null;

  const priorRecords = executionLog
    .filter((r) => r.nodeKey === nodeKey && r.outcome !== "completed")
    .sort((a, b) => b.attempt - a.attempt);

  if (priorRecords.length === 0) return null;

  const lastRecord = priorRecords[0];
  if (!lastRecord.errorSignature) return null;

  const currentHead = getHeadSha(repoRoot);
  if (!currentHead || currentHead !== lastRecord.headAfter) return null;

  // Same HEAD, same error signature on last attempt — halt unless circuit
  // breaker allows a revert bypass (one-time escape hatch for dev agents).
  if (!allowsRevertBypass) {
    return {
      halt: true,
      reason: `Non-retryable: identical error signature (${lastRecord.errorSignature}) at unchanged HEAD ${currentHead.slice(0, 8)}. Halting to avoid retry loop.`,
    };
  }

  // Dev agents: check if we've already granted the bypass (via >1 identical records)
  const identicalCount = priorRecords.filter(
    (r) => r.errorSignature === lastRecord.errorSignature && r.headAfter === currentHead,
  ).length;

  if (identicalCount >= 2) {
    // Already bypassed once — now truly halt
    return {
      halt: true,
      reason: `Non-retryable after revert bypass: identical error signature (${lastRecord.errorSignature}) persisted across ${identicalCount} attempts at HEAD ${currentHead.slice(0, 8)}.`,
    };
  }

  // First time: allow bypass (the revert warning will be in pendingContext)
  return null;
}

// ---------------------------------------------------------------------------
// Full context composer (for triage handler)
// ---------------------------------------------------------------------------

/**
 * Compose all failure-related context fragments into a single
 * `pendingContext` string for the target node after triage routing.
 *
 * This is the single entry point that the triage handler calls to build
 * the complete context that will be injected into the next agent session.
 */
export function composeTriageContext(opts: {
  slug: string;
  itemKey: string;
  attempt: number;
  effectiveAttempts: number;
  pipelineSummaries: readonly ItemSummary[];
  previousAttempt?: ItemSummary;
  allowsRevertBypass: boolean;
  revertWarningAt?: number;
  ciWorkflowFilePatterns?: string[];
  ciScopeWarning?: string;
  rejectionContext?: string;
}): string {
  const parts: string[] = [];

  // 1. Retry context (if re-attempt)
  if (opts.previousAttempt && opts.attempt > 1) {
    const atRevertThreshold = opts.allowsRevertBypass &&
      opts.effectiveAttempts >= (opts.revertWarningAt ?? 3);
    parts.push(buildRetryContext(opts.previousAttempt, atRevertThreshold));
  }

  // 2. Downstream failure context (redevelopment)
  const dsCtx = buildDownstreamFailureContext(
    opts.itemKey,
    opts.pipelineSummaries,
    opts.ciWorkflowFilePatterns,
    opts.ciScopeWarning,
    opts.slug,
    opts.allowsRevertBypass,
  );
  if (dsCtx) parts.push(dsCtx);

  // 3. Revert warning
  const revertCtx = buildRevertWarning(
    opts.itemKey,
    opts.effectiveAttempts,
    opts.allowsRevertBypass,
    opts.revertWarningAt,
  );
  if (revertCtx) parts.push(revertCtx);

  // 4. Triage rejection context (if provided)
  if (opts.rejectionContext) parts.push(opts.rejectionContext);

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Effective attempt counter (migrated from context-injection.ts)
// ---------------------------------------------------------------------------

/**
 * Compute the effective attempt count for items that track persisted cycles.
 * Combines in-memory attemptCounts (resets on orchestrator restart) with
 * persisted redevelopment cycle count from state (survives restarts).
 *
 * When `allowsRevertBypass` is true, persisted cycles are factored in.
 * Otherwise returns inMemoryAttempts.
 */
export async function computeEffectiveDevAttempts(
  itemKey: string,
  inMemoryAttempts: number,
  slug: string,
  allowsRevertBypass?: boolean,
): Promise<number> {
  if (!allowsRevertBypass) return inMemoryAttempts;
  try {
    const pipeState = readStateOrThrow(slug);
    const persistedCycles = pipeState.errorLog.filter(
      (e) => (REDEVELOPMENT_RESET_OPS as readonly string[]).includes(e.itemKey),
    ).length;
    return Math.max(inMemoryAttempts, persistedCycles);
  } catch {
    return inMemoryAttempts;
  }
}
