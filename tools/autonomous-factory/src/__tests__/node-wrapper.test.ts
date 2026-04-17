/**
 * node-wrapper.test.ts — Unit tests for the node wrapper.
 *
 * Uses Node.js built-in test runner (node:test) — zero dependencies.
 * Run: npx tsx src/__tests__/node-wrapper.test.ts
 */

import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { createNodeWrapper } from "../node-wrapper.js";
import type { NodeHandler, NodeContext, NodeResult } from "../handlers/types.js";
import type { ResolvedCircuitBreaker } from "../session/shared.js";
import type { PipelineState } from "../types.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeCircuitBreaker(overrides: Partial<ResolvedCircuitBreaker> = {}): ResolvedCircuitBreaker {
  return {
    minAttemptsBeforeSkip: 3,
    allowsRevertBypass: false,
    allowsTimeoutSalvage: false,
    haltOnIdentical: false,
    revertWarningAt: 3,
    ...overrides,
  };
}

function makeHandler(result: NodeResult): NodeHandler {
  return {
    name: "test-handler",
    async execute(_ctx: NodeContext): Promise<NodeResult> {
      return result;
    },
  };
}

function makeMinimalState(overrides: Partial<PipelineState> = {}): PipelineState {
  return {
    slug: "test-feature",
    workflowName: "default",
    items: [{ key: "dev", label: "Dev", agent: "dev-agent", status: "pending", error: null }],
    dependencies: {},
    nodeTypes: {},
    nodeCategories: {},
    errorLog: [],
    salvageSurvivors: [],
    ...overrides,
  } as PipelineState;
}

function makeCtx(overrides: Partial<NodeContext> = {}): NodeContext {
  return {
    itemKey: "dev",
    executionId: "00000000-0000-4000-a000-000000000001",
    slug: "test-feature",
    appRoot: "/tmp/app",
    repoRoot: "/tmp/repo",
    baseBranch: "main",
    attempt: 1,
    effectiveAttempts: 1,
    environment: {},
    apmContext: {} as any,
    pipelineState: makeMinimalState(),
    pipelineSummaries: [],
    handlerData: {},
    onHeartbeat: () => {},
    logger: { event: () => "noop", blob: () => {}, query: () => [], setAttempt: () => {}, materializeItemSummary: () => null, runId: "test" } as any,
    ...overrides,
  } as NodeContext;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createNodeWrapper", () => {
  it("wraps handler name with 'wrapped:' prefix", () => {
    const inner = makeHandler({ outcome: "completed", summary: {} });
    const wrapped = createNodeWrapper(inner, {
      circuitBreaker: makeCircuitBreaker(),
      attempt: 1,
      slug: "test",
      repoRoot: "/tmp",
    });
    assert.equal(wrapped.name, "wrapped:test-handler");
  });

  it("passes through successful handler result", async () => {
    const inner = makeHandler({ outcome: "completed", summary: { intents: ["done"] } });
    const wrapped = createNodeWrapper(inner, {
      circuitBreaker: makeCircuitBreaker(),
      attempt: 1,
      slug: "test",
      repoRoot: "/tmp",
    });
    const result = await wrapped.execute(makeCtx());
    assert.equal(result.outcome, "completed");
  });

  it("catches handler exceptions and returns error result", async () => {
    const inner: NodeHandler = {
      name: "throwing-handler",
      async execute() { throw new Error("boom"); },
    };
    const wrapped = createNodeWrapper(inner, {
      circuitBreaker: makeCircuitBreaker(),
      attempt: 1,
      slug: "test",
      repoRoot: "/tmp",
    });
    const result = await wrapped.execute(makeCtx());
    assert.equal(result.outcome, "error");
    assert.ok(result.errorMessage?.includes("boom"));
  });

  it("computes error signature for failed results", async () => {
    const inner = makeHandler({
      outcome: "failed",
      errorMessage: "TypeError: Cannot read property 'foo' of null",
      summary: {},
    });
    const wrapped = createNodeWrapper(inner, {
      circuitBreaker: makeCircuitBreaker(),
      attempt: 1,
      slug: "test",
      repoRoot: "/tmp",
    });
    const result = await wrapped.execute(makeCtx());
    assert.equal(result.outcome, "failed");
    assert.ok(result.handlerOutput?.errorSignature, "should have computed error signature");
  });

  it("tags infrastructure-timeout errorClass for timeout errors", async () => {
    const inner = makeHandler({
      outcome: "error",
      errorMessage: "Timeout waiting for response",
      summary: {},
    });
    const wrapped = createNodeWrapper(inner, {
      circuitBreaker: makeCircuitBreaker(),
      attempt: 1,
      slug: "test",
      repoRoot: "/tmp",
    });
    const result = await wrapped.execute(makeCtx());
    assert.equal(result.outcome, "error");
    assert.equal(result.handlerOutput?.errorClass, "infrastructure-timeout");
  });

  it("does NOT tag errorClass for non-timeout errors", async () => {
    const inner = makeHandler({
      outcome: "error",
      errorMessage: "SyntaxError: Unexpected token",
      summary: {},
    });
    const wrapped = createNodeWrapper(inner, {
      circuitBreaker: makeCircuitBreaker(),
      attempt: 1,
      slug: "test",
      repoRoot: "/tmp",
    });
    const result = await wrapped.execute(makeCtx());
    assert.equal(result.outcome, "error");
    assert.equal(result.handlerOutput?.errorClass, undefined);
  });

  it("delegates shouldSkip to inner handler", async () => {
    const inner: NodeHandler = {
      name: "skippable",
      async execute() { return { outcome: "completed", summary: {} }; },
      async shouldSkip() { return { reason: "no changes" }; },
    };
    const wrapped = createNodeWrapper(inner, {
      circuitBreaker: makeCircuitBreaker(),
      attempt: 1,
      slug: "test",
      repoRoot: "/tmp",
    });
    assert.ok(wrapped.shouldSkip);
    const skip = await wrapped.shouldSkip!(makeCtx());
    assert.ok(skip);
    assert.equal(skip.reason, "no changes");
  });
});
