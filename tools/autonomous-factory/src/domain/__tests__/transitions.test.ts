/**
 * domain/transitions.test.ts — Unit tests for pure state transitions.
 *
 * Uses Node.js built-in test runner (node:test) — zero test dependencies.
 * Run: npx tsx src/domain/__tests__/transitions.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  completeItem,
  failItem,
  resetNodes,
  salvageForDraft,
  type TransitionState,
  type TransitionItem,
} from "../transitions.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeItem(key: string, status: TransitionItem["status"] = "pending"): TransitionItem {
  return { key, label: key, agent: null, status, error: null };
}

function makeState(items: TransitionItem[], overrides?: Partial<TransitionState>): TransitionState {
  return {
    items,
    errorLog: [],
    dependencies: { A: [], B: ["A"], C: ["A"], D: ["B", "C"] },
    nodeTypes: { A: "agent", B: "agent", C: "agent", D: "script" },
    nodeCategories: { A: "dev", B: "dev", C: "test", D: "deploy" },
    naByType: [],
    salvageSurvivors: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// completeItem
// ---------------------------------------------------------------------------

describe("completeItem", () => {
  it("marks pending item as done", () => {
    const state = makeState([makeItem("A"), makeItem("B")]);
    const result = completeItem(state, "A");
    assert.equal(result.state.items.find((i) => i.key === "A")?.status, "done");
    assert.equal(result.state.items.find((i) => i.key === "B")?.status, "pending");
  });

  it("is a no-op for na items", () => {
    const state = makeState([makeItem("A", "na")]);
    const result = completeItem(state, "A");
    assert.equal(result.state.items.find((i) => i.key === "A")?.status, "na");
  });

  it("throws for unknown key", () => {
    const state = makeState([makeItem("A")]);
    assert.throws(() => completeItem(state, "Z"), /Unknown item key/);
  });
});

// ---------------------------------------------------------------------------
// failItem
// ---------------------------------------------------------------------------

describe("failItem", () => {
  it("marks item as failed and appends error log", () => {
    const state = makeState([makeItem("A")]);
    const result = failItem(state, "A", "Something broke");
    assert.equal(result.state.items.find((i) => i.key === "A")?.status, "failed");
    assert.equal(result.failCount, 1);
    assert.equal(result.halted, false);
    assert.equal(result.state.errorLog.length, 1);
    assert.equal(result.state.errorLog[0].itemKey, "A");
  });

  it("halts when max failures reached", () => {
    const state = makeState([makeItem("A")], {
      errorLog: Array.from({ length: 9 }, (_, i) => ({
        timestamp: new Date().toISOString(),
        itemKey: "A",
        message: `fail ${i}`,
      })),
    });
    const result = failItem(state, "A", "fail 10");
    assert.equal(result.failCount, 10);
    assert.equal(result.halted, true);
  });

  it("computes error signature", () => {
    const state = makeState([makeItem("A")]);
    const result = failItem(state, "A", "Error at /foo/bar:123");
    assert.ok(result.state.errorLog[0].errorSignature);
    assert.equal(result.state.errorLog[0].errorSignature!.length, 16);
  });
});

// ---------------------------------------------------------------------------
// resetNodes
// ---------------------------------------------------------------------------

describe("resetNodes", () => {
  it("resets seed + downstream to pending", () => {
    const items = [makeItem("A", "done"), makeItem("B", "done"), makeItem("C", "done"), makeItem("D", "done")];
    const state = makeState(items);
    const result = resetNodes(state, "A", "redevelopment");
    assert.equal(result.halted, false);
    assert.equal(result.cycleCount, 1);
    // All downstream of A: A, B, C, D
    for (const i of result.state.items) {
      assert.equal(i.status, "pending", `${i.key} should be pending`);
    }
  });

  it("halts when cycle budget exhausted", () => {
    const state = makeState([makeItem("A")], {
      errorLog: Array.from({ length: 5 }, () => ({
        timestamp: new Date().toISOString(),
        itemKey: "reset-nodes",
        message: "cycle",
      })),
    });
    const result = resetNodes(state, "A", "reason", 5);
    assert.equal(result.halted, true);
    assert.equal(result.cycleCount, 5);
    assert.deepEqual(result.resetKeys, []);
  });

  it("leaves dormant nodes dormant (except seed)", () => {
    const items = [makeItem("A"), makeItem("B", "dormant"), makeItem("C", "done"), makeItem("D", "done")];
    const state = makeState(items);
    const result = resetNodes(state, "A", "reason");
    assert.equal(result.state.items.find((i) => i.key === "B")?.status, "dormant");
  });

  it("activates dormant node when it is the seed", () => {
    const items = [makeItem("A", "done"), makeItem("B", "dormant")];
    const state = makeState(items, { dependencies: { A: [], B: ["A"] } });
    const result = resetNodes(state, "B", "triage activation");
    assert.equal(result.state.items.find((i) => i.key === "B")?.status, "pending");
  });

  it("leaves na items unchanged", () => {
    const items = [makeItem("A", "na"), makeItem("B", "done")];
    const state = makeState(items, { dependencies: { A: [], B: ["A"] } });
    const result = resetNodes(state, "A", "reason");
    assert.equal(result.state.items.find((i) => i.key === "A")?.status, "na");
  });
});

// ---------------------------------------------------------------------------
// salvageForDraft
// ---------------------------------------------------------------------------

describe("salvageForDraft", () => {
  it("marks failed item + downstream as na", () => {
    const items = [makeItem("A", "done"), makeItem("B", "done"), makeItem("C", "pending"), makeItem("D", "pending")];
    const state = makeState(items);
    const result = salvageForDraft(state, "C");
    assert.equal(result.state.items.find((i) => i.key === "C")?.status, "na");
    assert.equal(result.state.items.find((i) => i.key === "D")?.status, "na");
    assert.ok(result.skippedKeys.includes("C"));
    assert.ok(result.skippedKeys.includes("D"));
  });

  it("is idempotent — second call returns empty skippedKeys", () => {
    const items = [makeItem("A", "done"), makeItem("B", "pending")];
    const state = makeState(items, { dependencies: { A: [], B: ["A"] } });
    const first = salvageForDraft(state, "B");
    const second = salvageForDraft(first.state, "B");
    assert.deepEqual(second.skippedKeys, []);
  });

  it("preserves done items", () => {
    const items = [makeItem("A", "done"), makeItem("B", "done"), makeItem("C", "pending"), makeItem("D", "pending")];
    const state = makeState(items);
    const result = salvageForDraft(state, "C");
    assert.equal(result.state.items.find((i) => i.key === "A")?.status, "done");
    assert.equal(result.state.items.find((i) => i.key === "B")?.status, "done");
  });

  it("forces salvage survivors to pending", () => {
    const items = [makeItem("A", "done"), makeItem("B", "pending"), makeItem("C", "na"), makeItem("D", "na")];
    const state = makeState(items, { salvageSurvivors: ["D"] });
    const result = salvageForDraft(state, "B");
    assert.equal(result.state.items.find((i) => i.key === "D")?.status, "pending");
  });
});
