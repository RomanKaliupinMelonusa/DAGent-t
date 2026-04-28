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
    specFile: "/tmp/spec.md",
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
    ledger: {} as NodeContext["ledger"],
    shell: {} as NodeContext["shell"],
    filesystem: {} as NodeContext["filesystem"],
    copilotSessionRunner: {} as NodeContext["copilotSessionRunner"],
    invocation: {} as NodeContext["invocation"],
    invocationLogger: {} as NodeContext["invocationLogger"],
    triageArtifacts: {} as NodeContext["triageArtifacts"],
    artifactBus: {} as NodeContext["artifactBus"],
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

// ---------------------------------------------------------------------------
// Phase 2.1 — HandlerMetadata.inputs fail-fast
// ---------------------------------------------------------------------------

/** Spy handler: records whether execute() was called so tests can assert
 *  the short-circuit short-circuited BEFORE the handler body ran. */
function makeSpyHandler(
  result: NodeResult,
  metadata?: NodeHandler["metadata"],
): { handler: NodeHandler; executed: { count: number } } {
  const executed = { count: 0 };
  const handler: NodeHandler = {
    name: "spy-handler",
    ...(metadata ? { metadata } : {}),
    async execute() {
      executed.count += 1;
      return result;
    },
  };
  return { handler, executed };
}

describe("dispatchItem — HandlerMetadata required inputs", () => {
  it("short-circuits to outcome=error when a required input is missing (handler never runs)", async () => {
    const { handler, executed } = makeSpyHandler(
      { outcome: "completed", summary: {} },
      { inputs: { lastPushedSha: "required" } },
    );
    const ctx = makeCtx({ handlerData: {} }); // empty — missing
    const res = await dispatchItem(handler, ctx, []);

    assert.equal(executed.count, 0, "handler body must not run when required input is missing");
    const failCmd = res.commands.find((c) => c.type === "fail-item");
    assert.ok(failCmd, "expected a fail-item command");
    const summaryCmd = res.commands.find((c) => c.type === "record-summary") as
      | { type: "record-summary"; summary: Record<string, unknown> } | undefined;
    assert.ok(summaryCmd);
    assert.equal(summaryCmd!.summary.outcome, "error");
    assert.match(
      String(summaryCmd!.summary.errorMessage),
      /missing required handlerData inputs[\s\S]*lastPushedSha/,
    );
  });

  it("runs the handler when all required inputs are present", async () => {
    const { handler, executed } = makeSpyHandler(
      { outcome: "completed", summary: {} },
      { inputs: { lastPushedSha: "required" } },
    );
    const ctx = makeCtx({ handlerData: { lastPushedSha: "abc123" } });
    const res = await dispatchItem(handler, ctx, []);

    assert.equal(executed.count, 1, "handler must run when required inputs are satisfied");
    assert.equal(res.commands.find((c) => c.type === "complete-item")?.type, "complete-item");
  });

  it("does not short-circuit when the missing key is declared `optional`", async () => {
    const { handler, executed } = makeSpyHandler(
      { outcome: "completed", summary: {} },
      { inputs: { planOutput: "optional" } },
    );
    const ctx = makeCtx({ handlerData: {} });
    const res = await dispatchItem(handler, ctx, []);

    assert.equal(executed.count, 1);
    assert.equal(res.commands.find((c) => c.type === "complete-item")?.type, "complete-item");
  });

  it("is a no-op for handlers without metadata (backwards compatible)", async () => {
    const { handler, executed } = makeSpyHandler({ outcome: "completed", summary: {} });
    const ctx = makeCtx();
    const res = await dispatchItem(handler, ctx, []);

    assert.equal(executed.count, 1);
    assert.equal(res.commands.find((c) => c.type === "complete-item")?.type, "complete-item");
  });

  it("suggests declared producers from config.handlers.outputs when available", async () => {
    const { handler, executed } = makeSpyHandler(
      { outcome: "completed", summary: {} },
      { inputs: { lastPushedSha: "required" } },
    );
    const ctx = makeCtx({
      handlerData: {},
      apmContext: {
        agents: {},
        workflows: {},
        config: {
          handlers: {
            "push-app": { path: "./x.ts", outputs: ["lastPushedSha"] },
          },
        },
      } as unknown as NodeContext["apmContext"],
    });
    const res = await dispatchItem(handler, ctx, []);
    const summaryCmd = res.commands.find((c) => c.type === "record-summary") as
      | { type: "record-summary"; summary: Record<string, unknown> } | undefined;
    assert.match(String(summaryCmd!.summary.errorMessage), /push-app/);
    assert.equal(executed.count, 0);
  });
});

// ---------------------------------------------------------------------------
// produces_artifacts gate vs. auto-skip exemption
// ---------------------------------------------------------------------------

import { newInvocationId } from "../../../kernel/invocation-id.js";
import type { FeatureFilesystem } from "../../../ports/feature-filesystem.js";

/** Minimal FeatureFilesystem that always reports paths as missing. */
function makeMissingFs(): FeatureFilesystem {
  const stub: Partial<FeatureFilesystem> = {
    exists: async () => false,
    existsSync: () => false,
    joinPath: (...segs: string[]) => segs.filter(Boolean).join("/"),
  };
  return stub as FeatureFilesystem;
}

/** Build a ctx pre-wired for the produces_artifacts gate. */
function makeArtifactCtx(): NodeContext {
  const itemKey = "storefront-debug";
  return makeCtx({
    itemKey,
    executionId: newInvocationId(),
    appRoot: "/app",
    apmContext: {
      agents: {},
      workflows: {
        wf: {
          nodes: {
            [itemKey]: { produces_artifacts: ["debug-notes"] },
          },
        },
      },
    } as unknown as NodeContext["apmContext"],
    pipelineState: {
      items: {},
      deps: {},
      metadata: {},
      workflowName: "wf",
      feature: "feat-1",
    } as unknown as NodeContext["pipelineState"],
    filesystem: makeMissingFs(),
  });
}

describe("dispatchItem — produces_artifacts gate vs. auto-skip", () => {
  it("exempts auto-skipped invocations (signals.skipped=true) from the missing-output gate", async () => {
    // Middleware short-circuits as auto-skip does, tagging the result
    // with `signals.skipped: true`. Even though `produces_artifacts`
    // declares `debug-notes` and no file exists on disk, the dispatcher
    // must NOT flip the outcome to failed.
    const skipMiddleware: NodeMiddleware = {
      name: "test-auto-skip",
      async run(_ctx, _next) {
        return {
          outcome: "completed",
          errorMessage: "Skipped: no relevant changes",
          signals: { skipped: true },
          summary: { outcome: "completed", errorMessage: "Skipped: no relevant changes" },
        };
      },
    };
    // Handler should never run, but must be present.
    const handler = makeHandler({ outcome: "completed", summary: {} });
    const ctx = makeArtifactCtx();
    const res = await dispatchItem(handler, ctx, [skipMiddleware]);

    assert.equal(res.outcome, "completed", "skipped invocation must remain completed");
    const completeCmd = res.commands.find((c) => c.type === "complete-item");
    assert.ok(completeCmd, "expected complete-item command");
    const failCmd = res.commands.find((c) => c.type === "fail-item");
    assert.equal(failCmd, undefined, "must not emit fail-item for a skipped node");
    const summaryCmd = res.commands.find((c) => c.type === "record-summary") as
      | { type: "record-summary"; summary: Record<string, unknown> } | undefined;
    assert.ok(summaryCmd);
    assert.notEqual(
      summaryCmd!.summary.errorSignature,
      "missing_required_output:debug-notes",
      "skipped invocation must not be tagged with the missing-output signature",
    );
  });

  it("still flips to failed when a non-skipped completion omits a declared produces_artifacts file (regression guard)", async () => {
    // Handler reports completed without `signals.skipped` and writes
    // nothing. The presence gate must fire and override outcome to
    // failed with the deterministic errorSignature.
    const handler = makeHandler({ outcome: "completed", summary: {} });
    const ctx = makeArtifactCtx();
    const res = await dispatchItem(handler, ctx, []);

    assert.equal(res.outcome, "failed", "missing declared output must flip outcome to failed");
    const failCmd = res.commands.find((c) => c.type === "fail-item") as
      | { type: "fail-item"; message?: string } | undefined;
    assert.ok(failCmd, "expected fail-item command");
    const summaryCmd = res.commands.find((c) => c.type === "record-summary") as
      | { type: "record-summary"; summary: Record<string, unknown> } | undefined;
    assert.ok(summaryCmd);
    assert.equal(
      summaryCmd!.summary.errorSignature,
      "missing_required_output:debug-notes",
      "expected stable errorSignature for missing declared output",
    );
  });
});

