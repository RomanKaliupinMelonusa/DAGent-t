/**
 * handlers/middlewares/metrics.ts — Single-point structured metric emission.
 *
 * Wraps `handler.execute()` and emits a `node.metric` event with timing and
 * outcome after every node completes. Downstream observability sinks
 * (JSONL file, Datadog bridge, etc.) subscribe to the logger and need to
 * inspect only this one event kind — no scattered `performance.now()`
 * calls across handlers.
 *
 * Opt-in: the engine default chain does NOT include this middleware.
 * Apps enable it by listing "metrics" in `config.node_middleware.default`
 * or in a `by_handler` entry.
 */

import type { NodeMiddleware, MiddlewareNext } from "../middleware.js";
import type { NodeContext, NodeResult } from "../types.js";

export const metricsMiddleware: NodeMiddleware = {
  name: "metrics",

  async run(ctx: NodeContext, next: MiddlewareNext): Promise<NodeResult> {
    const startMs = Date.now();
    let result: NodeResult;
    try {
      result = await next();
    } catch (err) {
      const durationMs = Date.now() - startMs;
      ctx.logger.event("node.metric", ctx.itemKey, {
        outcome: "crashed",
        duration_ms: durationMs,
        attempt: ctx.attempt,
        effective_attempts: ctx.effectiveAttempts,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }

    const durationMs = Date.now() - startMs;
    ctx.logger.event("node.metric", ctx.itemKey, {
      outcome: result.outcome,
      duration_ms: durationMs,
      attempt: ctx.attempt,
      effective_attempts: ctx.effectiveAttempts,
      signal: result.signal,
      has_handler_output: !!result.handlerOutput,
    });

    return result;
  },
};
