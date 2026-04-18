/**
 * kernel/pipeline-kernel.test.ts — Unit tests for the Command-Sourced Pipeline Kernel.
 *
 * Tests the kernel in isolation with no I/O — uses DefaultKernelRules
 * against in-memory state. Verifies command processing, state transitions,
 * and effect generation.
 *
 * Uses Node.js built-in test runner (node:test) — zero test dependencies.
 * Run: npx tsx src/kernel/__tests__/pipeline-kernel.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PipelineKernel } from "../pipeline-kernel.js";
import { DefaultKernelRules } from "../rules.js";
import { createRunState } from "../types.js";
import { wrapDagCommands } from "../commands.js";
import type { PipelineState } from "../../types.js";
import type { Command } from "../commands.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makePipelineState(overrides?: Partial<PipelineState>): PipelineState {
  return {
    feature: "test-feature",
    workflowName: "test",
    started: "2025-01-01T00:00:00Z",
    deployedUrl: null,
    implementationNotes: null,
    items: [
      { key: "A", label: "A", agent: "dev", status: "pending", error: null },
      { key: "B", label: "B", agent: "dev", status: "pending", error: null },
      { key: "C", label: "C", agent: "test", status: "pending", error: null },
      { key: "D", label: "D", agent: null, status: "pending", error: null },
    ],
    errorLog: [],
    dependencies: { A: [], B: ["A"], C: ["A"], D: ["B", "C"] },
    nodeTypes: { A: "agent", B: "agent", C: "agent", D: "script" },
    nodeCategories: { A: "dev", B: "dev", C: "test", D: "deploy" },
    jsonGated: {},
    naByType: [],
    salvageSurvivors: [],
    ...overrides,
  };
}

function makeKernel(stateOverrides?: Partial<PipelineState>): PipelineKernel {
  return new PipelineKernel(
    "test-feature",
    makePipelineState(stateOverrides),
    createRunState(),
    new DefaultKernelRules(),
  );
}

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

describe("PipelineKernel — scheduling", () => {
  it("returns root nodes as first batch", () => {
    const kernel = makeKernel();
    const batch = kernel.getNextBatch();
    assert.equal(batch.kind, "items");
    if (batch.kind === "items") {
      assert.deepEqual(batch.items.map((i) => i.key), ["A"]);
    }
  });

  it("returns dependents after root is completed", () => {
    const kernel = makeKernel();
    kernel.process({ type: "complete-item", itemKey: "A" });
    const batch = kernel.getNextBatch();
    assert.equal(batch.kind, "items");
    if (batch.kind === "items") {
      assert.deepEqual(batch.items.map((i) => i.key).sort(), ["B", "C"]);
    }
  });

  it("returns complete when all items are done", () => {
    const kernel = makeKernel();
    kernel.process({ type: "complete-item", itemKey: "A" });
    kernel.process({ type: "complete-item", itemKey: "B" });
    kernel.process({ type: "complete-item", itemKey: "C" });
    kernel.process({ type: "complete-item", itemKey: "D" });
    const batch = kernel.getNextBatch();
    assert.equal(batch.kind, "complete");
  });
});

// ---------------------------------------------------------------------------
// State transitions
// ---------------------------------------------------------------------------

describe("PipelineKernel — complete-item", () => {
  it("marks item as done", () => {
    const kernel = makeKernel();
    const { result } = kernel.process({ type: "complete-item", itemKey: "A" });
    assert.equal(result.ok, true);
    const snap = kernel.dagSnapshot();
    assert.equal(snap.items.find((i) => i.key === "A")?.status, "done");
  });

  it("generates telemetry effect", () => {
    const kernel = makeKernel();
    const { effects } = kernel.process({ type: "complete-item", itemKey: "A" });
    assert.ok(effects.some((e) => e.type === "telemetry-event"));
  });
});

describe("PipelineKernel — fail-item", () => {
  it("marks item as failed", () => {
    const kernel = makeKernel();
    const { result } = kernel.process({ type: "fail-item", itemKey: "A", message: "boom" });
    assert.equal(result.ok, true);
    const snap = kernel.dagSnapshot();
    assert.equal(snap.items.find((i) => i.key === "A")?.status, "failed");
  });

  it("halts when max failures reached", () => {
    const errorLog = Array.from({ length: 9 }, () => ({
      timestamp: new Date().toISOString(),
      itemKey: "A",
      message: "prior fail",
    }));
    const kernel = makeKernel({ errorLog });
    const { result } = kernel.process({ type: "fail-item", itemKey: "A", message: "fail #10" });
    assert.equal(result.halt, true);
  });
});

// ---------------------------------------------------------------------------
// Run-state commands
// ---------------------------------------------------------------------------

describe("PipelineKernel — run-state commands", () => {
  it("record-attempt increments attempt count", () => {
    const kernel = makeKernel();
    kernel.process({ type: "record-attempt", itemKey: "A" });
    kernel.process({ type: "record-attempt", itemKey: "A" });
    const snap = kernel.runSnapshot();
    assert.equal(snap.attemptCounts["A"], 2);
  });

  it("record-summary appends to pipeline summaries", () => {
    const kernel = makeKernel();
    const summary = { key: "A", label: "A", outcome: "completed" as const, durationMs: 100 };
    kernel.process({ type: "record-summary", summary: summary as any });
    const snap = kernel.runSnapshot();
    assert.equal(snap.pipelineSummaries.length, 1);
  });

  it("record-handler-output stores output", () => {
    const kernel = makeKernel();
    kernel.process({ type: "record-handler-output", itemKey: "A", output: { lastPushedSha: "abc" } });
    const snap = kernel.runSnapshot();
    assert.equal(snap.handlerOutputs["A"]?.lastPushedSha, "abc");
  });

  it("record-handler-output merges with existing", () => {
    const kernel = makeKernel();
    kernel.process({ type: "record-handler-output", itemKey: "A", output: { lastPushedSha: "abc" } });
    kernel.process({ type: "record-handler-output", itemKey: "A", output: { ciRunId: "123" } });
    const snap = kernel.runSnapshot();
    assert.equal(snap.handlerOutputs["A"]?.lastPushedSha, "abc");
    assert.equal(snap.handlerOutputs["A"]?.ciRunId, "123");
  });

  it("record-pre-step-ref stores SHA", () => {
    const kernel = makeKernel();
    kernel.process({ type: "record-pre-step-ref", itemKey: "A", sha: "deadbeef" });
    const snap = kernel.runSnapshot();
    assert.equal(snap.preStepRefs["A"], "deadbeef");
  });

  it("record-force-run stores flag", () => {
    const kernel = makeKernel();
    kernel.process({ type: "record-force-run", itemKey: "A", changesDetected: true });
    const snap = kernel.runSnapshot();
    assert.equal(snap.forceRunChangesDetected["A"], true);
  });
});

// ---------------------------------------------------------------------------
// DagCommand wrapper
// ---------------------------------------------------------------------------

describe("PipelineKernel — dag-command wrapper", () => {
  it("processes reset-nodes command", () => {
    const kernel = makeKernel({
      items: [
        { key: "A", label: "A", agent: "dev", status: "done", error: null },
        { key: "B", label: "B", agent: "dev", status: "done", error: null },
        { key: "C", label: "C", agent: "test", status: "done", error: null },
        { key: "D", label: "D", agent: null, status: "done", error: null },
      ],
    });
    const cmds = wrapDagCommands([{
      type: "reset-nodes",
      seedKey: "A",
      reason: "test reset",
    }]);
    const { result } = kernel.process(cmds[0]);
    assert.equal(result.ok, true);
    const snap = kernel.dagSnapshot();
    assert.equal(snap.items.find((i) => i.key === "A")?.status, "pending");
    assert.equal(snap.items.find((i) => i.key === "D")?.status, "pending");
  });

  it("processes salvage-draft command", () => {
    const kernel = makeKernel({
      items: [
        { key: "A", label: "A", agent: "dev", status: "done", error: null },
        { key: "B", label: "B", agent: "dev", status: "pending", error: null },
        { key: "C", label: "C", agent: "test", status: "pending", error: null },
        { key: "D", label: "D", agent: null, status: "pending", error: null },
      ],
    });
    const cmds = wrapDagCommands([{
      type: "salvage-draft",
      failedItemKey: "B",
      reason: "unfixable error",
    }]);
    const { result } = kernel.process(cmds[0]);
    assert.equal(result.ok, true);
    const snap = kernel.dagSnapshot();
    assert.equal(snap.items.find((i) => i.key === "B")?.status, "na");
    assert.equal(snap.items.find((i) => i.key === "D")?.status, "na");
  });
});

// ---------------------------------------------------------------------------
// Snapshots are isolated
// ---------------------------------------------------------------------------

describe("PipelineKernel — snapshot isolation", () => {
  it("dagSnapshot returns a deep copy", () => {
    const kernel = makeKernel();
    const snap1 = kernel.dagSnapshot();
    kernel.process({ type: "complete-item", itemKey: "A" });
    const snap2 = kernel.dagSnapshot();
    assert.equal(snap1.items.find((i) => i.key === "A")?.status, "pending");
    assert.equal(snap2.items.find((i) => i.key === "A")?.status, "done");
  });

  it("runSnapshot returns a deep copy", () => {
    const kernel = makeKernel();
    const snap1 = kernel.runSnapshot();
    kernel.process({ type: "record-attempt", itemKey: "A" });
    const snap2 = kernel.runSnapshot();
    assert.equal(snap1.attemptCounts["A"], undefined);
    assert.equal(snap2.attemptCounts["A"], 1);
  });
});

// ---------------------------------------------------------------------------
// Stall detection (DAG-level wait timeout)
// ---------------------------------------------------------------------------

const HOUR_MS = 60 * 60 * 1000;

describe("PipelineKernel — collectStallCommands", () => {
  it("returns empty when no wait thresholds are configured", () => {
    const kernel = makeKernel();
    const cmds = kernel.collectStallCommands(Date.now(), new Map());
    assert.deepEqual(cmds, []);
  });

  it("returns empty when pending items are still within threshold", () => {
    const started = new Date("2025-01-01T00:00:00Z").getTime();
    const kernel = makeKernel({ started: "2025-01-01T00:00:00Z" });
    const thresholds = new Map([["A", 5]]); // 5h
    const cmds = kernel.collectStallCommands(started + 1 * HOUR_MS, thresholds);
    assert.deepEqual(cmds, []);
  });

  it("emits a fail-item command when pending item exceeds its threshold", () => {
    const started = new Date("2025-01-01T00:00:00Z").getTime();
    const kernel = makeKernel({ started: "2025-01-01T00:00:00Z" });
    const thresholds = new Map([["A", 2]]);
    const cmds = kernel.collectStallCommands(started + 3 * HOUR_MS, thresholds);
    assert.equal(cmds.length, 1);
    assert.equal(cmds[0]!.type, "fail-item");
    if (cmds[0]!.type === "fail-item") {
      assert.equal(cmds[0].itemKey, "A");
      assert.match(cmds[0].message, /^stalled-upstream:/);
    }
  });

  it("ignores non-pending items (done, failed, na, dormant)", () => {
    const started = new Date("2025-01-01T00:00:00Z").getTime();
    const kernel = makeKernel({
      started: "2025-01-01T00:00:00Z",
      items: [
        { key: "A", label: "A", agent: null, status: "done", error: null },
        { key: "B", label: "B", agent: null, status: "failed", error: "x" },
        { key: "C", label: "C", agent: null, status: "na", error: null },
        { key: "D", label: "D", agent: null, status: "dormant", error: null },
      ],
    });
    const thresholds = new Map([["A", 1], ["B", 1], ["C", 1], ["D", 1]]);
    const cmds = kernel.collectStallCommands(started + 10 * HOUR_MS, thresholds);
    assert.deepEqual(cmds, []);
  });

  it("resets the pending clock when a reset-op log entry mentions the key", () => {
    const started = new Date("2025-01-01T00:00:00Z").getTime();
    const resetAt = started + 5 * HOUR_MS;
    const kernel = makeKernel({
      started: "2025-01-01T00:00:00Z",
      errorLog: [
        {
          timestamp: new Date(resetAt).toISOString(),
          itemKey: "reset-nodes",
          message: "Reset cycle 1/5: retry. Reset items: A, B",
        },
      ],
    });
    const thresholds = new Map([["A", 2]]);
    // Now = reset + 1h — within threshold measured from reset, NOT pipeline start
    const cmds = kernel.collectStallCommands(resetAt + 1 * HOUR_MS, thresholds);
    assert.deepEqual(cmds, []);
  });

  it("flags a key once its post-reset wait also exceeds the threshold", () => {
    const started = new Date("2025-01-01T00:00:00Z").getTime();
    const resetAt = started + 5 * HOUR_MS;
    const kernel = makeKernel({
      started: "2025-01-01T00:00:00Z",
      errorLog: [
        {
          timestamp: new Date(resetAt).toISOString(),
          itemKey: "reset-nodes",
          message: "Reset cycle 1/5: retry. Reset items: A",
        },
      ],
    });
    const thresholds = new Map([["A", 2]]);
    // Now = reset + 3h — exceeds 2h threshold measured from reset
    const cmds = kernel.collectStallCommands(resetAt + 3 * HOUR_MS, thresholds);
    assert.equal(cmds.length, 1);
    if (cmds[0]!.type === "fail-item") {
      assert.equal(cmds[0].itemKey, "A");
    }
  });

  it("process(fail-item) on a stall command transitions the item to failed", () => {
    const started = new Date("2025-01-01T00:00:00Z").getTime();
    const kernel = makeKernel({ started: "2025-01-01T00:00:00Z" });
    const thresholds = new Map([["A", 2]]);
    const cmds = kernel.collectStallCommands(started + 3 * HOUR_MS, thresholds);
    for (const cmd of cmds) kernel.process(cmd);
    const snap = kernel.dagSnapshot();
    const a = snap.items.find((i) => i.key === "A");
    assert.equal(a?.status, "failed");
    assert.match(a!.error ?? "", /^stalled-upstream:/);
  });
});
