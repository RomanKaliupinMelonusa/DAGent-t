/**
 * Tests for loop/triage-activation.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveTriageActivations } from "../triage-activation.js";
import type { Command } from "../../kernel/commands.js";
import type { PipelineState, ItemSummary } from "../../types.js";
import type { RunState } from "../../kernel/types.js";
import type { RoutableWorkflow } from "../../domain/failure-routing.js";

function makeDag(items: Array<{ key: string; status: "pending" | "done" | "failed" | "na" | "dormant" }>): PipelineState {
  return {
    items: items.map((i) => ({ key: i.key, label: i.key, status: i.status, agent: null, error: null })),
    dependencies: {},
    errorLog: [],
    executionLog: [],
    started: new Date().toISOString(),
  } as unknown as PipelineState;
}

function makeRun(summaries: ItemSummary[] = []): RunState {
  return {
    pipelineSummaries: summaries,
    attemptCounts: {},
    preStepRefs: {},
    forceRunChangesDetected: {},
    handlerOutputs: {},
  } as RunState;
}

const sig = (msg: string) => `sig:${msg.slice(0, 8)}`;

describe("resolveTriageActivations", () => {
  it("returns empty when no workflow is provided", () => {
    const out = resolveTriageActivations([{ type: "fail-item", itemKey: "a", message: "boom" }], makeDag([{ key: "a", status: "failed" }]), makeRun(), undefined, sig);
    assert.deepEqual(out, []);
  });

  it("emits one activation per failed item with on_failure.triage", () => {
    const workflow: RoutableWorkflow = {
      nodes: {
        "test-runner": { on_failure: { triage: "triage-main", routes: { frontend: "dev-fe", "test-code": "test-author" } } },
        "triage-main": { type: "triage" },
      },
    };
    const commands: Command[] = [
      { type: "fail-item", itemKey: "test-runner", message: "assertion failed at line 42" },
    ];
    const dag = makeDag([{ key: "test-runner", status: "failed" }]);
    const out = resolveTriageActivations(commands, dag, makeRun(), workflow, sig);

    assert.equal(out.length, 1);
    assert.equal(out[0].triageNodeKey, "triage-main");
    assert.equal(out[0].failingKey, "test-runner");
    assert.equal(out[0].rawError, "assertion failed at line 42");
    assert.deepEqual(out[0].failureRoutes, { frontend: "dev-fe", "test-code": "test-author" });
    assert.equal(out[0].errorSignature, sig("assertion failed at line 42"));
  });

  it("skips items whose status is not `failed` (retrying)", () => {
    const workflow: RoutableWorkflow = {
      nodes: {
        "flaky": { on_failure: { triage: "triage-main" } },
        "triage-main": { type: "triage" },
      },
    };
    const commands: Command[] = [
      { type: "fail-item", itemKey: "flaky", message: "transient" },
    ];
    // Item back to pending = retrying, not terminally failed.
    const dag = makeDag([{ key: "flaky", status: "pending" }]);
    const out = resolveTriageActivations(commands, dag, makeRun(), workflow, sig);
    assert.deepEqual(out, []);
  });

  it("skips items with no on_failure configured", () => {
    const workflow: RoutableWorkflow = {
      nodes: { "plain": {} },
    };
    const commands: Command[] = [{ type: "fail-item", itemKey: "plain", message: "x" }];
    const dag = makeDag([{ key: "plain", status: "failed" }]);
    const out = resolveTriageActivations(commands, dag, makeRun(), workflow, sig);
    assert.deepEqual(out, []);
  });

  it("falls back to workflow default_triage when node has no triage", () => {
    const workflow: RoutableWorkflow = {
      nodes: { "thing": {} },
      default_triage: "triage-default",
    };
    const commands: Command[] = [{ type: "fail-item", itemKey: "thing", message: "err" }];
    const dag = makeDag([{ key: "thing", status: "failed" }]);
    const out = resolveTriageActivations(commands, dag, makeRun(), workflow, sig);
    assert.equal(out.length, 1);
    assert.equal(out[0].triageNodeKey, "triage-default");
  });

  it("attaches the most recent matching ItemSummary", () => {
    const workflow: RoutableWorkflow = {
      nodes: {
        "a": { on_failure: { triage: "t" } },
        "t": { type: "triage" },
      },
    };
    const summaries: ItemSummary[] = [
      { key: "a", outcome: "failed" } as ItemSummary,
      { key: "b", outcome: "completed" } as ItemSummary,
      { key: "a", outcome: "failed", errorMessage: "latest" } as ItemSummary,
    ];
    const commands: Command[] = [{ type: "fail-item", itemKey: "a", message: "latest" }];
    const dag = makeDag([{ key: "a", status: "failed" }]);
    const out = resolveTriageActivations(commands, dag, makeRun(summaries), workflow, sig);
    assert.equal(out[0].failingNodeSummary, summaries[2]);
  });

  it("dedupes multiple fail-item commands for the same key", () => {
    const workflow: RoutableWorkflow = {
      nodes: {
        "a": { on_failure: { triage: "t" } },
        "t": { type: "triage" },
      },
    };
    const commands: Command[] = [
      { type: "fail-item", itemKey: "a", message: "first" },
      { type: "fail-item", itemKey: "a", message: "second" },
    ];
    const dag = makeDag([{ key: "a", status: "failed" }]);
    const out = resolveTriageActivations(commands, dag, makeRun(), workflow, sig);
    assert.equal(out.length, 1);
    assert.equal(out[0].rawError, "second");
  });
});
