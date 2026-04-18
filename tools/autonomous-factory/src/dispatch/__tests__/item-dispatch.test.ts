/**
 * Tests for dispatch/item-dispatch.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dispatchItem } from "../item-dispatch.js";
import type { NodeHandler, NodeContext, NodeResult } from "../../handlers/types.js";

/** Minimal NodeContext factory for testing. */
function makeCtx(overrides: Partial<NodeContext> = {}): NodeContext {
  return {
    itemKey: "test-item",
    executionId: "exec-1",
    slug: "feat-1",
    appRoot: "/app",
    repoRoot: "/repo",
    baseBranch: "main",
    attempt: 1,
    effectiveAttempts: 1,
    environment: {},
    apmContext: { agents: {}, workflows: {} } as NodeContext["apmContext"],
    pipelineState: { items: {}, deps: {}, metadata: {} } as unknown as NodeContext["pipelineState"],
    pipelineSummaries: [],
    handlerData: {},
    onHeartbeat: () => {},
    logger: { event: () => {}, warn: () => {}, error: () => {}, info: () => {} } as unknown as NodeContext["logger"],
    ...overrides,
  };
}

function makeHandler(result: NodeResult, skip?: { reason: string } | null): NodeHandler {
  return {
    name: "test-handler",
    async execute() { return result; },
    async shouldSkip() { return skip ?? null; },
  };
}

describe("dispatchItem", () => {
  it("returns complete-item when handler completes", async () => {
    const handler = makeHandler({ outcome: "completed", summary: {} });
    const ctx = makeCtx();
    const res = await dispatchItem(handler, ctx);

    // record-attempt + complete-item
    assert.equal(res.commands.length, 2);
    assert.equal(res.commands[0].type, "record-attempt");
    assert.equal(res.commands[1].type, "complete-item");
  });

  it("returns complete-item when handler skips", async () => {
    const handler = makeHandler(
      { outcome: "completed", summary: {} },
      { reason: "no changes" },
    );
    const ctx = makeCtx();
    const res = await dispatchItem(handler, ctx);

    assert.equal(res.commands.length, 1);
    assert.equal(res.commands[0].type, "complete-item");
  });

  it("returns fail-item when handler fails", async () => {
    const handler = makeHandler({
      outcome: "failed",
      errorMessage: "compilation error",
      summary: {},
    });
    const ctx = makeCtx();
    const res = await dispatchItem(handler, ctx);

    // record-attempt + fail-item
    assert.equal(res.commands.length, 2);
    assert.equal(res.commands[0].type, "record-attempt");
    assert.equal(res.commands[1].type, "fail-item");
  });

  it("catches handler exceptions and returns fail-item", async () => {
    const handler: NodeHandler = {
      name: "crash-handler",
      async execute() { throw new Error("BOOM"); },
    };
    const ctx = makeCtx();
    const res = await dispatchItem(handler, ctx);

    assert.equal(res.commands.length, 2);
    assert.equal(res.commands[0].type, "record-attempt");
    assert.equal(res.commands[1].type, "fail-item");
    assert.ok((res.commands[1] as { message: string }).message.includes("BOOM"));
  });

  it("forwards signal from handler result", async () => {
    const handler = makeHandler({
      outcome: "completed",
      summary: {},
      signal: "create-pr",
    });
    const ctx = makeCtx();
    const res = await dispatchItem(handler, ctx);
    assert.equal(res.signal, "create-pr");
  });

  it("forwards signals bag from handler result", async () => {
    const handler = makeHandler({
      outcome: "completed",
      summary: {},
      signals: { halt: true, "create-pr": false },
    });
    const ctx = makeCtx();
    const res = await dispatchItem(handler, ctx);
    assert.deepEqual(res.signals, { halt: true, "create-pr": false });
  });
});
