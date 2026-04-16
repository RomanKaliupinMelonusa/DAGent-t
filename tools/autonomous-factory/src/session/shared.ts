/**
 * session/shared.ts — Shared utilities used across session submodules.
 *
 * Contains workflow node resolution, DAG traversal, report flushing,
 * circuit breaker logic, and diagnostic normalization.
 */

import path from "node:path";
import { execSync } from "node:child_process";
import type { ApmCompiledOutput } from "../apm-types.js";
import type { ApmWorkflowNode } from "../apm-types.js";
import type { ItemSummary } from "../types.js";
import { extractDiagnosticTrace } from "../types.js";
import { writeFlightData } from "../reporting.js";
import type { PipelineRunConfig, PipelineRunState, SessionResult } from "../session-runner.js";

// ---------------------------------------------------------------------------
// Workflow node helpers
// ---------------------------------------------------------------------------

/** Resolve the workflow definition for a named workflow. */
export function getWorkflow(apmContext: ApmCompiledOutput, workflowName: string) {
  return apmContext.workflows?.[workflowName];
}

/** Resolve the workflow node definition for an item key within a named workflow. */
export function getWorkflowNode(apmContext: ApmCompiledOutput, workflowName: string, itemKey: string): ApmWorkflowNode | undefined {
  return apmContext.workflows?.[workflowName]?.nodes?.[itemKey];
}

/**
 * Get the current HEAD SHA. Returns null on failure (non-fatal).
 * Single abstraction for all git HEAD operations in the kernel.
 */
export function getHeadSha(repoRoot: string): string | null {
  try {
    return execSync("git rev-parse HEAD", {
      cwd: repoRoot, encoding: "utf-8", timeout: 5_000,
    }).trim() || null;
  } catch {
    return null;
  }
}

/** Resolved circuit breaker config with defaults based on node type/category. */
export interface ResolvedCircuitBreaker {
  minAttemptsBeforeSkip: number;
  allowsRevertBypass: boolean;
  allowsTimeoutSalvage: boolean;
  haltOnIdentical: boolean;
  revertWarningAt: number;
}

/**
 * Resolve circuit breaker configuration for a workflow node.
 * All behavior is config-driven — nodes must declare explicit `circuit_breaker`
 * settings in workflows.yml. Only `min_attempts_before_skip` and `revert_warning_at`
 * have universal numeric defaults.
 */
export function resolveCircuitBreaker(node: ApmWorkflowNode | undefined): ResolvedCircuitBreaker {
  const cb = node?.circuit_breaker;
  return {
    minAttemptsBeforeSkip: cb?.min_attempts_before_skip ?? 3,
    allowsRevertBypass: cb?.allows_revert_bypass ?? false,
    allowsTimeoutSalvage: cb?.allows_timeout_salvage ?? false,
    haltOnIdentical: cb?.halt_on_identical ?? false,
    revertWarningAt: cb?.revert_warning_at ?? 3,
  };
}

export function getTimeout(itemKey: string, apmContext: ApmCompiledOutput, workflowName?: string): number {
  const wfName = workflowName ?? Object.keys(apmContext.workflows ?? {})[0] ?? "default";
  const node = getWorkflowNode(apmContext, wfName, itemKey);
  return (node?.timeout_minutes ?? 15) * 60_000;
}

/**
 * Walk the DAG backward from `startKey` to find all upstream nodes
 * matching any of the given categories. Uses BFS on inverted edges (predecessors).
 * Returns matching node keys in discovery order (nearest first).
 */
export function findUpstreamKeysByCategory(
  nodes: Record<string, ApmWorkflowNode>,
  startKey: string,
  categories: ReadonlyArray<string>,
): string[] {
  const categorySet = new Set(categories);
  // Build inverted adjacency list: child → parents
  const parents: Record<string, string[]> = {};
  for (const [key, node] of Object.entries(nodes)) {
    for (const dep of node.depends_on ?? []) {
      (parents[key] ??= []).push(dep);
    }
  }

  const visited = new Set<string>();
  const queue: string[] = [...(parents[startKey] ?? [])];
  const matchedKeys: string[] = [];

  while (queue.length > 0) {
    const key = queue.shift()!;
    if (visited.has(key)) continue;
    visited.add(key);
    const node = nodes[key];
    if (!node) continue;
    if (node.category && categorySet.has(node.category)) matchedKeys.push(key);
    for (const parent of parents[key] ?? []) {
      if (!visited.has(parent)) queue.push(parent);
    }
  }

  return matchedKeys;
}

/**
 * Map workflow nodes to their owned directory prefixes for scoped git-diff
 * attribution. Prevents cross-agent pollution when parallel dev agents
 * run in parallel. Returns empty array for nodes without diff_attribution_dirs
 * (e.g. code-cleanup, docs-archived), which falls back to "all non-state files".
 */
export function getAgentDirectoryPrefixes(
  node: ApmWorkflowNode | undefined,
  appRel: string,
  directories?: Record<string, string | null>,
): string[] {
  if (!node?.diff_attribution_dirs?.length) return [];
  const prefix = appRel ? `${appRel}/` : "";
  return node.diff_attribution_dirs.map((dir) => {
    // Entries ending with "/" are literal path prefixes (e.g. .github/)
    if (dir.endsWith("/")) return dir;
    // Resolve from APM config.directories map, fall back to literal key
    const resolved = directories?.[dir] ?? dir;
    return `${prefix}${resolved}/`;
  });
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
  const lastTrace = extractDiagnosticTrace(last.errorMessage) ?? last.errorMessage;
  const prevTrace = extractDiagnosticTrace(prev.errorMessage) ?? prev.errorMessage;

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
// Report flushing
// ---------------------------------------------------------------------------

/** Flush flight data after each item completes (summary + terminal log are generated once at pipeline end) */
export function flushReports(config: PipelineRunConfig, state: PipelineRunState): void {
  const { appRoot, slug } = config;
  writeFlightData(appRoot, slug, state.pipelineSummaries);
}

// ---------------------------------------------------------------------------
// Telemetry merge
// ---------------------------------------------------------------------------

/**
 * Merge partial handler telemetry into the kernel's item summary.
 * Additive: arrays append (deduplicated for filesChanged), counters accumulate.
 */
export function mergeTelemetry(target: ItemSummary, source: Partial<ItemSummary>): void {
  if (source.intents) target.intents.push(...source.intents);
  if (source.filesChanged) {
    for (const f of source.filesChanged) {
      if (!target.filesChanged.includes(f)) target.filesChanged.push(f);
    }
  }
  if (source.filesRead) target.filesRead.push(...source.filesRead);
  if (source.shellCommands) target.shellCommands.push(...source.shellCommands);
  if (source.toolCounts) {
    for (const [k, v] of Object.entries(source.toolCounts)) {
      target.toolCounts[k] = (target.toolCounts[k] ?? 0) + v;
    }
  }
  if (source.inputTokens) target.inputTokens += source.inputTokens;
  if (source.outputTokens) target.outputTokens += source.outputTokens;
  if (source.cacheReadTokens) target.cacheReadTokens += source.cacheReadTokens;
  if (source.cacheWriteTokens) target.cacheWriteTokens += source.cacheWriteTokens;
  if (source.messages) target.messages.push(...source.messages);
}

// ---------------------------------------------------------------------------
// Finish-item helper
// ---------------------------------------------------------------------------

/**
 * Finalize an item summary, push it to the pipeline summaries, flush reports,
 * and return a SessionResult. Eliminates the repeated 6-line pattern across
 * session-runner.ts and script-executor.ts.
 */
export function finishItem(
  itemSummary: ItemSummary,
  outcome: ItemSummary["outcome"],
  stepStart: number,
  config: PipelineRunConfig,
  state: PipelineRunState,
  opts?: { errorMessage?: string; halt?: boolean; createPr?: boolean; approvalPending?: boolean; intents?: string[] },
): SessionResult {
  itemSummary.outcome = outcome;
  if (opts?.errorMessage) itemSummary.errorMessage = opts.errorMessage;
  if (opts?.intents) itemSummary.intents.push(...opts.intents);
  itemSummary.finishedAt = new Date().toISOString();
  itemSummary.durationMs = Date.now() - stepStart;
  state.pipelineSummaries.push(itemSummary);
  flushReports(config, state);
  return { summary: itemSummary, halt: opts?.halt ?? false, createPr: opts?.createPr ?? false, approvalPending: opts?.approvalPending ?? false };
}
