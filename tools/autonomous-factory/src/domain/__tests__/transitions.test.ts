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

  it("halts on identical signature when haltOnIdentical is set", () => {
    // First failure is allowed; the prior entry plus this one share a
    // signature, so attempt 2 must halt immediately — bypassing maxFailures.
    const state = makeState([makeItem("A")], {
      errorLog: [{
        timestamp: new Date().toISOString(),
        itemKey: "A",
        message: "Pre-hook failed (exit 1)",
        errorSignature: null,
      }],
    });
    // Seed a matching signature on the prior entry.
    const priorSig = "abc123def4567890";
    state.errorLog[0] = { ...state.errorLog[0], errorSignature: priorSig };
    const result = failItem(
      state,
      "A",
      "whatever",
      { haltOnIdentical: true },
      () => priorSig,
    );
    assert.equal(result.failCount, 2);
    assert.equal(result.halted, true);
  });

  it("does not halt on different signature even with haltOnIdentical", () => {
    const state = makeState([makeItem("A")], {
      errorLog: [{
        timestamp: new Date().toISOString(),
        itemKey: "A",
        message: "prior",
        errorSignature: "aaaaaaaaaaaaaaaa",
      }],
    });
    const result = failItem(
      state,
      "A",
      "new",
      { haltOnIdentical: true },
      () => "bbbbbbbbbbbbbbbb",
    );
    assert.equal(result.halted, false);
  });

  it("accepts legacy numeric maxFailures argument", () => {
    const state = makeState([makeItem("A")]);
    const result = failItem(state, "A", "x", 3);
    assert.equal(result.halted, false);
  });

  it("halts when haltOnIdenticalThreshold is reached across different item keys", () => {
    // Feature-scoped halt: same signature rotating through different items.
    // 2 prior entries on B and C share a signature; a 3rd failure on A
    // bringing the global count to 3 (threshold=3) must halt — even though
    // A itself has never failed before.
    const sig = "deadbeefcafebabe";
    const state = makeState([makeItem("A"), makeItem("B"), makeItem("C")], {
      errorLog: [
        { timestamp: "t1", itemKey: "B", message: "m1", errorSignature: sig },
        { timestamp: "t2", itemKey: "C", message: "m2", errorSignature: sig },
      ],
    });
    const result = failItem(
      state,
      "A",
      "m3",
      { haltOnIdenticalThreshold: 3 },
      () => sig,
    );
    assert.equal(result.halted, true);
    assert.equal(result.haltedByThreshold, true);
    assert.equal(result.thresholdMatchCount, 3);
    assert.equal(result.errorSignature, sig);
  });

  it("does not halt on threshold when failing key is excluded", () => {
    const sig = "deadbeefcafebabe";
    const state = makeState([makeItem("A"), makeItem("B"), makeItem("C")], {
      errorLog: [
        { timestamp: "t1", itemKey: "B", message: "m1", errorSignature: sig },
        { timestamp: "t2", itemKey: "C", message: "m2", errorSignature: sig },
      ],
    });
    const result = failItem(
      state,
      "A",
      "m3",
      {
        haltOnIdenticalThreshold: 3,
        haltOnIdenticalExcludedKeys: ["A"],
      },
      () => sig,
    );
    assert.equal(result.halted, false);
    assert.equal(result.haltedByThreshold, undefined);
  });

  it("does not halt when threshold not yet reached", () => {
    const sig = "deadbeefcafebabe";
    const state = makeState([makeItem("A"), makeItem("B")], {
      errorLog: [
        { timestamp: "t1", itemKey: "B", message: "m1", errorSignature: sig },
      ],
    });
    const result = failItem(
      state,
      "A",
      "m2",
      { haltOnIdenticalThreshold: 3 },
      () => sig,
    );
    assert.equal(result.halted, false);
    assert.equal(result.haltedByThreshold, undefined);
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

  it("marks salvaged items with sticky salvaged flag", () => {
    const items = [makeItem("A", "done"), makeItem("B", "pending"), makeItem("C", "pending")];
    const state = makeState(items, { dependencies: { A: [], B: ["A"], C: ["B"] } });
    const result = salvageForDraft(state, "B");
    const b = result.state.items.find((i) => i.key === "B")!;
    const c = result.state.items.find((i) => i.key === "C")!;
    assert.equal(b.status, "na");
    assert.equal(b.salvaged, true, "B must be marked salvaged");
    assert.equal(c.status, "na");
    assert.equal(c.salvaged, true, "downstream C must also be marked salvaged");
  });
});

// ---------------------------------------------------------------------------
// resetNodes — sticky salvage interaction
// ---------------------------------------------------------------------------

describe("resetNodes + sticky salvage", () => {
  it("refuses to reset a salvaged seed and leaves state unchanged", () => {
    const items = [
      makeItem("A", "done"),
      { ...makeItem("B", "na"), salvaged: true },
    ];
    const state = makeState(items, { dependencies: { A: [], B: ["A"] } });
    const result = resetNodes(state, "B", "late triage reroute");
    assert.equal(result.rejectedReason, "salvaged");
    assert.equal(result.halted, false);
    assert.deepEqual(result.resetKeys, []);
    // State pointer unchanged (no-op) — items + errorLog untouched.
    assert.equal(result.state, state);
    assert.equal(result.state.items.find((i) => i.key === "B")!.status, "na");
    assert.equal(result.state.errorLog.length, 0);
  });

  it("still resets non-salvaged items normally", () => {
    const items = [makeItem("A", "done"), makeItem("B", "done")];
    const state = makeState(items, { dependencies: { A: [], B: ["A"] } });
    const result = resetNodes(state, "A", "normal reroute");
    assert.equal(result.rejectedReason, undefined);
    assert.equal(result.halted, false);
    assert.ok(result.resetKeys.includes("A"));
  });
});
