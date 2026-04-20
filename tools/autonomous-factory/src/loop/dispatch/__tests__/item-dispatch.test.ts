/**
 * Tests for dispatch/item-dispatch.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dispatchItem } from "../item-dispatch.js";
import type { NodeHandler, NodeContext, NodeResult } from "../../../handlers/types.js";
import type { NodeMiddleware } from "../../../handlers/middleware.js";

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
    preStepRefs: {},
    handlerData: {},
    onHeartbeat: () => {},
    logger: { event: () => {}, warn: () => {}, error: () => {}, info: () => {} } as unknown as NodeContext["logger"],
    vcs: {} as NodeContext["vcs"],
    stateReader: {} as NodeContext["stateReader"],
    shell: {} as NodeContext["shell"],
    filesystem: {} as NodeContext["filesystem"],
    copilotSessionRunner: {} as NodeContext["copilotSessionRunner"],
    ...overrides,
  };
}

function makeHandler(result: NodeResult): NodeHandler {
  return {
    name: "test-handler",
    async execute() { return result; },
  };
}

/** A middleware that short-circuits with the given skip reason. */
function makeSkipMiddleware(reason: string): NodeMiddleware {
  return {
    name: "test-skip",
    async run(_ctx, _next) {
      return {
        outcome: "completed",
        errorMessage: `Skipped: ${reason}`,
        summary: { outcome: "completed", errorMessage: `Skipped: ${reason}` },
      };
    },
  };
}

describe("dispatchItem", () => {
  it("returns complete-item when handler completes", async () => {
    const handler = makeHandler({ outcome: "completed", summary: {} });
    const ctx = makeCtx();
    const res = await dispatchItem(handler, ctx, []);

    // record-attempt + complete-item + record-summary
    assert.equal(res.commands.length, 3);
    assert.equal(res.commands[0].type, "record-attempt");
    assert.equal(res.commands[1].type, "complete-item");
    assert.equal(res.commands[2].type, "record-summary");
  });

  it("records attempt even when middleware short-circuits", async () => {
    const handler = makeHandler({ outcome: "completed", summary: {} });
    const ctx = makeCtx();
    const res = await dispatchItem(handler, ctx, [makeSkipMiddleware("no changes")]);

    // record-attempt is an invariant of every dispatch, regardless of
    // whether the handler body runs — short-circuited `completed` still
    // counts the attempt but has no retry consequence.
    assert.equal(res.commands.length, 3);
    assert.equal(res.commands[0].type, "record-attempt");
    assert.equal(res.commands[1].type, "complete-item");
    assert.equal(res.commands[2].type, "record-summary");
  });

  it("returns fail-item when handler fails", async () => {
    const handler = makeHandler({
      outcome: "failed",
      errorMessage: "compilation error",
      summary: {},
    });
    const ctx = makeCtx();
    const res = await dispatchItem(handler, ctx, []);

    // record-attempt + fail-item + record-summary
    assert.equal(res.commands.length, 3);
    assert.equal(res.commands[0].type, "record-attempt");
    assert.equal(res.commands[1].type, "fail-item");
    assert.equal(res.commands[2].type, "record-summary");
  });

  it("catches handler exceptions and returns fail-item", async () => {
    const handler: NodeHandler = {
      name: "crash-handler",
      async execute() { throw new Error("BOOM"); },
    };
    const ctx = makeCtx();
    const res = await dispatchItem(handler, ctx, []);

    assert.equal(res.commands.length, 3);
    assert.equal(res.commands[0].type, "record-attempt");
    assert.equal(res.commands[1].type, "fail-item");
    assert.equal(res.commands[2].type, "record-summary");
    assert.ok((res.commands[1] as { message: string }).message.includes("BOOM"));
  });

  it("forwards signal from handler result", async () => {
    const handler = makeHandler({
      outcome: "completed",
      summary: {},
      signal: "create-pr",
    });
    const ctx = makeCtx();
    const res = await dispatchItem(handler, ctx, []);
    assert.equal(res.signal, "create-pr");
  });

  it("forwards signals bag from handler result", async () => {
    const handler = makeHandler({
      outcome: "completed",
      summary: {},
      signals: { halt: true, "create-pr": false },
    });
    const ctx = makeCtx();
    const res = await dispatchItem(handler, ctx, []);
    assert.deepEqual(res.signals, { halt: true, "create-pr": false });
  });

  it("emits record-summary with a well-formed ItemSummary on failure", async () => {
    const handler = makeHandler({
      outcome: "failed",
      errorMessage: "boom",
      summary: { filesChanged: ["a.ts"] },
    });
    const ctx = makeCtx({ itemKey: "e2e-runner", attempt: 3 });
    const res = await dispatchItem(handler, ctx, []);
    const recordSummaryCmd = res.commands.find((c) => c.type === "record-summary") as
      | { type: "record-summary"; summary: Record<string, unknown> } | undefined;
    assert.ok(recordSummaryCmd, "record-summary command must be emitted");
    const s = recordSummaryCmd!.summary;
    assert.equal(s.key, "e2e-runner");
    assert.equal(s.attempt, 3);
    assert.equal(s.outcome, "failed");
    assert.equal(s.errorMessage, "boom");
    assert.deepEqual(s.filesChanged, ["a.ts"]);
    assert.ok(typeof s.startedAt === "string" && s.startedAt.length > 0);
    assert.ok(typeof s.finishedAt === "string" && s.finishedAt.length > 0);
    assert.ok(Array.isArray(s.shellCommands));
    assert.ok(Array.isArray(s.intents));
  });
});

