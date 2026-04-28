import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { finishItem } from "../session/telemetry.js";
import type { ItemSummary } from "../types.js";
import type { PipelineRunConfig, PipelineRunState } from "../app-types.js";

function makeItemSummary(overrides?: Partial<ItemSummary>): ItemSummary {
  return {
    key: "dev-backend",
    label: "dev-backend",
    agent: "backend-dev",
    attempt: 1,
    startedAt: new Date().toISOString(),
    finishedAt: "",
    durationMs: 0,
    outcome: "in-progress",
    intents: [],
    messages: [],
    filesRead: [],
    filesChanged: [],
    shellCommands: [],
    toolCounts: {},
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    ...overrides,
  };
}

function makeConfig(): PipelineRunConfig {
  return {
    slug: "test-feature",
    workflowName: "full-stack",
    appRoot: "/tmp/app",
    repoRoot: "/tmp/repo",
    baseBranch: "main",
    specFile: "/tmp/spec.md",
    apmContext: { agents: {}, config: {} } as any,
    codeIndexer: {
      isAvailable: () => false,
      index: async () => ({ durationMs: 0, upToDate: true }),
    },
    logger: { event: () => "noop", blob: () => {}, query: () => [], setAttempt: () => {}, materializeItemSummary: () => null, runId: "test" } as any,
  };
}

function makeState(): PipelineRunState {
  return {
    pipelineSummaries: [],
    attemptCounts: {},
    preStepRefs: {},
    baseTelemetry: null,
    handlerOutputs: {},
    forceRunChangesDetected: {},
  };
}

describe("finishItem", () => {
  it("sets outcome, finishedAt, durationMs, and pushes to summaries", () => {
    const summary = makeItemSummary();
    const config = makeConfig();
    const state = makeState();
    const stepStart = Date.now() - 5000;

    const result = finishItem(summary, "completed", stepStart, config, state);

    assert.equal(result.summary.outcome, "completed");
    assert.ok(result.summary.finishedAt);
    assert.ok(result.summary.durationMs >= 4000);
    assert.equal(result.kind, "continue");
    assert.equal(state.pipelineSummaries.length, 1);
    assert.equal(state.pipelineSummaries[0], summary);
  });

  it("sets errorMessage when provided", () => {
    const summary = makeItemSummary();
    const config = makeConfig();
    const state = makeState();

    const result = finishItem(summary, "failed", Date.now(), config, state, {
      errorMessage: "Something broke",
    });

    assert.equal(result.summary.outcome, "failed");
    assert.equal(result.summary.errorMessage, "Something broke");
  });

  it("appends intents when provided", () => {
    const summary = makeItemSummary({ intents: ["existing"] });
    const config = makeConfig();
    const state = makeState();

    finishItem(summary, "completed", Date.now(), config, state, {
      intents: ["new-intent"],
    });

    assert.deepEqual(summary.intents, ["existing", "new-intent"]);
  });

  it("respects halt and createPr options", () => {
    const summary = makeItemSummary();
    const config = makeConfig();
    const state = makeState();

    const result = finishItem(summary, "failed", Date.now(), config, state, {
      halt: true,
      createPr: true,
    });

    // halt takes priority over createPr in the discriminated union
    assert.equal(result.kind, "halt");
  });

  it("defaults to continue when no flags set", () => {
    const summary = makeItemSummary();
    const config = makeConfig();
    const state = makeState();

    const result = finishItem(summary, "completed", Date.now(), config, state);

    assert.equal(result.kind, "continue");
  });
});
