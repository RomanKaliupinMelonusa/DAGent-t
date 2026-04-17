/**
 * node-wrapper.ts — Generic self-protection decorator for DAG node execution.
 *
 * Sits between the kernel (thin scheduler) and handler plugins (copilot-agent,
 * local-exec, etc.). Encapsulates cross-cutting failure intelligence that
 * doesn't belong in the kernel:
 *
 *   1. **Pre-execute guards** — retry dedup (same error + same HEAD = halt),
 *      pendingContext injection, revert warning, max-attempts check.
 *   2. **Post-execute signals** — timeout salvage escalation, on_failure
 *      routing signal to the dispatch layer.
 *
 * The wrapper reads persisted ExecutionRecords from the pipeline state and
 * writes pendingContext (consumed by copilot-agent prompt builders).
 *
 * Design: The wrapper does NOT mutate pipeline state (no completeItem/failItem).
 * It returns enriched NodeResult with control signals that the kernel acts on.
 */

import type { NodeHandler, NodeContext, NodeResult, SkipResult } from "./handlers/types.js";
import type { ExecutionRecord, PipelineState } from "./types.js";
import type { ResolvedCircuitBreaker } from "./session/shared.js";
import { computeErrorSignature } from "./triage/error-fingerprint.js";
import { getHeadSha } from "./session/shared.js";
import { setPendingContext } from "./state.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NodeWrapperConfig {
  /** Resolved circuit breaker config for this node. */
  circuitBreaker: ResolvedCircuitBreaker;
  /** In-memory attempt count for this item (1-based). */
  attempt: number;
  /** Effective attempt count (in-memory + persisted redevelopment cycles). */
  effectiveAttempts: number;
  /** Feature slug. */
  slug: string;
  /** Repository root path. */
  repoRoot: string;
}

// ---------------------------------------------------------------------------
// Pre-execute guards
// ---------------------------------------------------------------------------

/**
 * Check whether the execution log shows a repeated identical error with no
 * code changes. If the same error signature was produced at the same HEAD,
 * retrying is pointless — return a halt signal.
 *
 * Returns a NodeResult if the item should be halted, null to proceed.
 */
function checkRetryDedup(
  ctx: NodeContext,
  config: NodeWrapperConfig,
  executionLog: ExecutionRecord[],
): NodeResult | null {
  if (config.attempt <= 1) return null;

  const priorRecords = executionLog
    .filter((r) => r.nodeKey === ctx.itemKey && r.outcome !== "completed")
    .sort((a, b) => b.attempt - a.attempt);

  if (priorRecords.length === 0) return null;

  const lastRecord = priorRecords[0];
  if (!lastRecord.errorSignature) return null;

  const currentHead = getHeadSha(config.repoRoot);
  if (!currentHead || currentHead !== lastRecord.headAfter) return null;

  // Same HEAD, same error signature on last attempt — halt unless circuit
  // breaker allows a revert bypass (one-time escape hatch for dev agents).
  if (!config.circuitBreaker.allowsRevertBypass) {
    return {
      outcome: "failed",
      errorMessage: `Non-retryable: identical error signature (${lastRecord.errorSignature}) at unchanged HEAD ${currentHead.slice(0, 8)}. Halting to avoid retry loop.`,
      summary: {},
      signals: { halt: true },
    };
  }

  // Dev agents: check if we've already granted the bypass (via >1 identical records)
  const identicalCount = priorRecords.filter(
    (r) => r.errorSignature === lastRecord.errorSignature && r.headAfter === currentHead,
  ).length;

  if (identicalCount >= 2) {
    // Already bypassed once — now truly halt
    return {
      outcome: "failed",
      errorMessage: `Non-retryable after revert bypass: identical error signature (${lastRecord.errorSignature}) persisted across ${identicalCount} attempts at HEAD ${currentHead.slice(0, 8)}.`,
      summary: {},
      signals: { halt: true },
    };
  }

  // First time: allow bypass (the revert warning will be in pendingContext)
  return null;
}

/**
 * Check whether the pipeline item has pending context that will be consumed
 * by the inner handler during this execution.
 */
function hasPendingContext(pipelineState: Readonly<PipelineState>, itemKey: string): boolean {
  const item = pipelineState.items.find((i) => i.key === itemKey);
  return !!item?.pendingContext;
}

// ---------------------------------------------------------------------------
// Post-execute analysis
// ---------------------------------------------------------------------------

/**
 * Check if a failed result from a timeout-susceptible node should trigger
 * the salvage-draft signal (open a Draft PR for human review rather than
 * losing all work).
 */
function checkTimeoutSalvage(
  result: NodeResult,
  config: NodeWrapperConfig,
): NodeResult {
  if (result.outcome === "completed") return result;
  if (!config.circuitBreaker.allowsTimeoutSalvage) return result;

  const isTimeout = result.errorMessage?.includes("Timeout") ||
    result.errorMessage?.includes("timeout") ||
    result.errorMessage?.includes("SIGTERM");

  if (!isTimeout) return result;

  // Signal the kernel to salvage as draft instead of full failure
  return {
    ...result,
    signals: {
      ...result.signals,
      "salvage-draft": true,
    },
  };
}

// ---------------------------------------------------------------------------
// Wrapper factory
// ---------------------------------------------------------------------------

/**
 * Create a node wrapper that decorates a handler with self-protection logic.
 *
 * Usage in the kernel:
 * ```ts
 * const wrapped = createNodeWrapper(handler, wrapperConfig);
 * const result = await wrapped.execute(ctx);
 * ```
 */
export function createNodeWrapper(
  inner: NodeHandler,
  config: NodeWrapperConfig,
): NodeHandler {
  return {
    name: `wrapped:${inner.name}`,
    metadata: inner.metadata,

    shouldSkip: inner.shouldSkip?.bind(inner),

    async execute(ctx: NodeContext): Promise<NodeResult> {
      const executionLog = ctx.pipelineState.executionLog ?? [];

      // --- Pre-execute guard: retry dedup ---
      const dedupResult = checkRetryDedup(ctx, config, executionLog);
      if (dedupResult) {
        ctx.logger.event("item.skip", ctx.itemKey, {
          skip_type: "retry_dedup",
          reason: dedupResult.errorMessage,
        });
        return dedupResult;
      }

      // --- Pre-execute: note if pendingContext exists (handler reads it from ctx.pipelineState) ---
      const hadPendingContext = hasPendingContext(ctx.pipelineState, ctx.itemKey);
      if (hadPendingContext) {
        ctx.logger.event("handoff.inject", ctx.itemKey, {
          injection_types: ["pending_context"],
        });
      }

      // --- Execute inner handler ---
      let result: NodeResult;
      try {
        result = await inner.execute(ctx);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result = { outcome: "error", errorMessage: message, summary: {} };
      }

      // --- Post-execute: clear pendingContext so it doesn't leak into the next attempt ---
      if (hadPendingContext) {
        try {
          await setPendingContext(config.slug, ctx.itemKey, null);
        } catch { /* non-fatal — stale context is misleading but not fatal */ }
      }

      // --- Post-execute: timeout salvage ---
      result = checkTimeoutSalvage(result, config);

      // --- Post-execute: compute error signature for failed results ---
      if (result.outcome !== "completed" && result.errorMessage) {
        const sig = computeErrorSignature(result.errorMessage);
        result = {
          ...result,
          handlerOutput: {
            ...result.handlerOutput,
            errorSignature: sig,
          },
        };
      }

      return result;
    },
  };
}
