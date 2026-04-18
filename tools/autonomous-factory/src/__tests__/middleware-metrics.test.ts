/**
 * Tests for handlers/middlewares/metrics.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { metricsMiddleware } from "../handlers/middlewares/metrics.js";
import type { NodeContext, NodeResult } from "../handlers/types.js";

function makeCtx() {
  const events: Array<{ kind: string; key: string | null; data?: Record<string, unknown> }> = [];
  const ctx = {
    itemKey: "mw-metrics",
    attempt: 2,
    effectiveAttempts: 3,
    logger: {
      event: (kind: string, key: string | null, data?: Record<string, unknown>) =>
        events.push({ kind, key, data }),
      warn: () => {}, error: () => {}, info: () => {},
    },
  } as unknown as NodeContext;
  (ctx as unknown as { __events: typeof events }).__events = events;
  return ctx;
}

describe("metricsMiddleware", () => {
  it("emits node.metric with outcome + duration on success", async () => {
    const ctx = makeCtx();
    await metricsMiddleware.run(ctx, async () => ({ outcome: "completed", summary: {} }));
    const events = (ctx as unknown as { __events: Array<{ kind: string; data: Record<string, unknown> }> }).__events;
    const metric = events.find((e) => e.kind === "node.metric");
    assert.ok(metric);
    assert.equal(metric!.data.outcome, "completed");
    assert.equal(typeof metric!.data.duration_ms, "number");
    assert.equal(metric!.data.attempt, 2);
  });

  it("emits crashed outcome + rethrows when handler throws", async () => {
    const ctx = makeCtx();
    await assert.rejects(
      metricsMiddleware.run(ctx, async () => { throw new Error("boom"); }),
      /boom/,
    );
    const events = (ctx as unknown as { __events: Array<{ kind: string; data: Record<string, unknown> }> }).__events;
    const metric = events.find((e) => e.kind === "node.metric");
    assert.ok(metric);
    assert.equal(metric!.data.outcome, "crashed");
    assert.equal(metric!.data.error, "boom");
  });

  it("emits failed outcome when handler returns failure", async () => {
    const ctx = makeCtx();
    const result: NodeResult = { outcome: "failed", summary: {}, errorMessage: "x" };
    await metricsMiddleware.run(ctx, async () => result);
    const events = (ctx as unknown as { __events: Array<{ kind: string; data: Record<string, unknown> }> }).__events;
    const metric = events.find((e) => e.kind === "node.metric");
    assert.equal(metric!.data.outcome, "failed");
  });
});
