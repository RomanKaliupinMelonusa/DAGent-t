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
import { parseTriageDiagnostic } from "../triage.js";
import { writePipelineSummary, writeTerminalLog } from "../reporting.js";
import type { PipelineRunConfig, PipelineRunState } from "../session-runner.js";

// ---------------------------------------------------------------------------
// Workflow node helpers
// ---------------------------------------------------------------------------

/** Resolve the workflow node definition for an item key. */
export function getWorkflowNode(apmContext: ApmCompiledOutput, itemKey: string): ApmWorkflowNode | undefined {
  return apmContext.workflows?.default?.nodes?.[itemKey];
}

export function getTimeout(itemKey: string, apmContext: ApmCompiledOutput): number {
  const node = getWorkflowNode(apmContext, itemKey);
  return (node?.timeout_minutes ?? 15) * 60_000;
}

/**
 * Walk the DAG backward from `startKey` to find all upstream nodes
 * where `category === "dev"`. Uses BFS on inverted edges (predecessors).
 * Returns dev-category node keys in discovery order (nearest first).
 */
export function findUpstreamDevKeys(
  nodes: Record<string, ApmWorkflowNode>,
  startKey: string,
): string[] {
  // Build inverted adjacency list: child → parents
  const parents: Record<string, string[]> = {};
  for (const [key, node] of Object.entries(nodes)) {
    for (const dep of node.depends_on ?? []) {
      (parents[key] ??= []).push(dep);
    }
  }

  const visited = new Set<string>();
  const queue: string[] = [...(parents[startKey] ?? [])];
  const devKeys: string[] = [];

  while (queue.length > 0) {
    const key = queue.shift()!;
    if (visited.has(key)) continue;
    visited.add(key);
    const node = nodes[key];
    if (!node) continue;
    if (node.category === "dev") devKeys.push(key);
    for (const parent of parents[key] ?? []) {
      if (!visited.has(parent)) queue.push(parent);
    }
  }

  return devKeys;
}

/**
 * Map workflow nodes to their owned directory prefixes for scoped git-diff
 * attribution. Prevents cross-agent pollution when backend-dev and frontend-dev
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
// Report flushing
// ---------------------------------------------------------------------------

/** Flush both report files (summary + terminal log) after each item completes */
export function flushReports(config: PipelineRunConfig, state: PipelineRunState): void {
  const { appRoot, repoRoot, baseBranch, slug, apmContext } = config;
  writePipelineSummary(appRoot, repoRoot, slug, state.pipelineSummaries, apmContext, state.baseTelemetry);
  writeTerminalLog(appRoot, repoRoot, baseBranch, slug, state.pipelineSummaries, apmContext, state.baseTelemetry);
}
