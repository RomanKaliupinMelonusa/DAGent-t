/**
 * node-wrapper.ts — Execution envelope decorator for DAG node handlers.
 *
 * Sits between the kernel (thin scheduler) and handler plugins (copilot-agent,
 * local-exec, etc.). Provides cross-cutting execution tracking that doesn't
 * belong in the kernel or the handler:
 *
 *   1. **Execution identity** — generates a unique executionId (UUID v4) per invocation.
 *   2. **HEAD snapshots** — records git HEAD before and after handler execution.
 *   3. **Execution record persistence** — writes a durable ExecutionRecord that
 *      survives orchestrator restarts and feeds triage dedup/analysis.
 *   4. **PendingContext lifecycle** — notes existence, clears after consumption.
 *   5. **Error classification** — tags infrastructure timeouts with errorClass
 *      so triage can make routing decisions.
 *   6. **Error signature** — computes stable fingerprints for failed executions.
 *
 * The wrapper does NOT make routing decisions (retry, halt, salvage). All
 * routing authority belongs to the triage system. The wrapper only tracks
 * and classifies.
 *
 * Design: The wrapper does NOT mutate pipeline state (no completeItem/failItem).
 * It returns enriched NodeResult with metadata that the kernel and triage act on.
 */

import { randomUUID } from "node:crypto";
import type { NodeHandler, NodeContext, NodeResult, SkipResult } from "./handlers/types.js";
import type { ExecutionRecord, PipelineState } from "./types.js";
import type { ResolvedCircuitBreaker } from "./session/shared.js";
import { computeErrorSignature } from "./triage/error-fingerprint.js";
import { getHeadSha } from "./session/shared.js";
import { setPendingContext, persistExecutionRecord } from "./state.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NodeWrapperConfig {
  /** Resolved circuit breaker config for this node. */
  circuitBreaker: ResolvedCircuitBreaker;
  /** In-memory attempt count for this item (1-based). */
  attempt: number;
  /** Feature slug. */
  slug: string;
  /** Repository root path. */
  repoRoot: string;
  /** Git HEAD before handler execution (from kernel's preStepRefs). */
  headBefore?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check whether the pipeline item has pending context that will be consumed
 * by the inner handler during this execution.
 */
function hasPendingContext(pipelineState: Readonly<PipelineState>, itemKey: string): boolean {
  const item = pipelineState.items.find((i) => i.key === itemKey);
  return !!item?.pendingContext;
}

/**
 * Classify infrastructure timeout errors.
 * Returns "infrastructure-timeout" if the error is a session/SDK timeout,
 * null otherwise. The triage system uses this for routing decisions.
 */
function classifyTimeoutError(errorMessage?: string): string | null {
  if (!errorMessage) return null;
  const isTimeout = errorMessage.includes("Timeout") ||
    errorMessage.includes("timeout") ||
    errorMessage.includes("SIGTERM");
  return isTimeout ? "infrastructure-timeout" : null;
}

// ---------------------------------------------------------------------------
// Wrapper factory
// ---------------------------------------------------------------------------

/**
 * Create a node wrapper that decorates a handler with execution tracking.
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
      const executionId = ctx.executionId;
      const stepStart = Date.now();

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

      // --- Post-execute: classify infrastructure timeouts ---
      if (result.outcome !== "completed" && result.errorMessage) {
        const errorClass = classifyTimeoutError(result.errorMessage);
        if (errorClass) {
          result = {
            ...result,
            handlerOutput: {
              ...result.handlerOutput,
              errorClass,
            },
          };
        }
      }

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

      // --- Post-execute: persist execution record ---
      const headAfter = getHeadSha(config.repoRoot) ?? undefined;
      try {
        const execRecord: ExecutionRecord = {
          executionId,
          nodeKey: ctx.itemKey,
          attempt: config.attempt,
          outcome: result.outcome,
          errorMessage: result.outcome !== "completed" ? result.errorMessage : undefined,
          errorSignature: result.outcome !== "completed" && result.errorMessage
            ? computeErrorSignature(result.errorMessage)
            : undefined,
          headBefore: config.headBefore,
          headAfter,
          filesChanged: [...(result.summary.filesChanged ?? [])],
          durationMs: Date.now() - stepStart,
          startedAt: new Date(stepStart).toISOString(),
          finishedAt: new Date().toISOString(),
        };
        await persistExecutionRecord(config.slug, execRecord);
      } catch {
        ctx.logger.event("item.end", ctx.itemKey, {
          outcome: result.outcome,
          note: "failed to persist execution record",
        });
      }

      // Expose headAfter in handlerOutput for the kernel to merge into itemSummary
      result = {
        ...result,
        handlerOutput: {
          ...result.handlerOutput,
          headAfterAttempt: headAfter,
        },
      };

      return result;
    },
  };
}
