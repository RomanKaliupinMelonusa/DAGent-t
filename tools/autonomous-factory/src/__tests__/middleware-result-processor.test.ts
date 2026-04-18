/**
 * Tests for handlers/middlewares/result-processor.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resultProcessorMiddleware } from "../handlers/middlewares/result-processor.js";
import type { NodeContext, NodeResult } from "../handlers/types.js";

const ctx = {
  itemKey: "x",
  logger: { event: () => {}, warn: () => {}, error: () => {}, info: () => {} },
} as unknown as NodeContext;

describe("resultProcessorMiddleware", () => {
  it("passes through successful results unchanged", async () => {
    const result: NodeResult = { outcome: "completed", summary: {}, handlerOutput: { scriptOutput: "ok" } };
    const out = await resultProcessorMiddleware.run(ctx, async () => result);
    assert.deepEqual(out, result);
  });

  it("condenses scriptOutput into errorMessage on failure", async () => {
    const big = "line\n".repeat(5000);
    const result: NodeResult = {
      outcome: "failed",
      summary: {},
      handlerOutput: { scriptOutput: big },
    };
    const out = await resultProcessorMiddleware.run(ctx, async () => result);
    assert.equal(out.outcome, "failed");
    assert.ok(typeof out.errorMessage === "string");
    assert.ok(out.errorMessage!.length < big.length);
  });

  it("preserves existing errorMessage as prefix when non-redundant", async () => {
    const result: NodeResult = {
      outcome: "failed",
      errorMessage: "Process killed after 15m timeout.",
      summary: {},
      handlerOutput: { scriptOutput: "error-output-xyz" },
    };
    const out = await resultProcessorMiddleware.run(ctx, async () => result);
    assert.match(out.errorMessage ?? "", /Process killed after 15m timeout/);
    assert.match(out.errorMessage ?? "", /error-output-xyz/);
  });

  it("leaves errorMessage alone when scriptOutput is absent", async () => {
    const result: NodeResult = { outcome: "failed", errorMessage: "handler says no", summary: {} };
    const out = await resultProcessorMiddleware.run(ctx, async () => result);
    assert.equal(out.errorMessage, "handler says no");
  });
});
