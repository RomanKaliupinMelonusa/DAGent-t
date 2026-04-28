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
  bypassNode,
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
    // D is recategorized as finalize here — finalize survivors are
    // unconditionally force-pending. Deploy-category survivors with
    // all-N/A deps are demoted by A5 (covered separately below).
    const state = makeState(items, {
      salvageSurvivors: ["D"],
      nodeCategories: { A: "dev", B: "dev", C: "test", D: "finalize" },
    });
    const result = salvageForDraft(state, "B");
    assert.equal(result.state.items.find((i) => i.key === "D")?.status, "pending");
  });

  it("(A5) demotes a deploy-category survivor when all its deps are N/A", () => {
    // Failing seed B → downstream C, D na (C depends on B; D depends
    // on C). D is deploy-category + salvage survivor; with B and C
    // both na, D has no producer to promote so it must be demoted to
    // na rather than left pending.
    const items = [makeItem("A", "done"), makeItem("B", "pending"), makeItem("C", "pending"), makeItem("D", "pending")];
    const state = makeState(items, {
      salvageSurvivors: ["D"],
      dependencies: { A: [], B: ["A"], C: ["B"], D: ["C"] },
    });
    const result = salvageForDraft(state, "B");
    const d = result.state.items.find((i) => i.key === "D")!;
    assert.equal(d.status, "na", "deploy survivor with all-N/A deps must be demoted");
    assert.equal(d.salvaged, true, "demoted node must carry sticky salvaged flag");
    assert.deepEqual(result.demotedKeys, ["D"]);
    assert.deepEqual(result.state.naBySalvage, ["D"]);
    assert.match(
      result.state.errorLog.find((e) => e.itemKey === "salvage-draft")!.message,
      /deploy-orphans demoted: D/,
    );
  });

  it("(A5) does NOT demote a deploy-category survivor when one dep is still pending", () => {
    // C is independent of B (deps: only on A which is done). D depends
    // on [B, C]: B becomes na, but C remains done — D still has a
    // producer chain so it stays force-pending.
    const items = [makeItem("A", "done"), makeItem("B", "pending"), makeItem("C", "done"), makeItem("D", "pending")];
    const state = makeState(items, {
      salvageSurvivors: ["D"],
      dependencies: { A: [], B: ["A"], C: ["A"], D: ["B", "C"] },
    });
    const result = salvageForDraft(state, "B");
    const d = result.state.items.find((i) => i.key === "D")!;
    assert.equal(d.status, "pending", "deploy survivor with a non-N/A dep must stay pending");
    assert.deepEqual(result.demotedKeys, []);
  });

  it("(A5) cascades demotion through a chain of deploy survivors", () => {
    // E (deploy survivor) depends on D (deploy survivor) depends on B.
    // Failing B → D demoted → E demoted (its only dep is now N/A).
    const items = [
      makeItem("A", "done"),
      makeItem("B", "pending"),
      makeItem("D", "pending"),
      makeItem("E", "pending"),
    ];
    const state = makeState(items, {
      items: items as never,
      salvageSurvivors: ["D", "E"],
      dependencies: { A: [], B: ["A"], D: ["B"], E: ["D"] },
      nodeCategories: { A: "dev", B: "dev", D: "deploy", E: "deploy" },
      nodeTypes: { A: "agent", B: "agent", D: "script", E: "script" },
    });
    const result = salvageForDraft(state, "B");
    assert.equal(result.state.items.find((i) => i.key === "D")?.status, "na");
    assert.equal(result.state.items.find((i) => i.key === "E")?.status, "na");
    assert.deepEqual(result.demotedKeys.sort(), ["D", "E"]);
  });

  it("(A5) leaves finalize-category survivors pending even with all-N/A deps", () => {
    // X is a finalize survivor that depends on B; salvage demotes B.
    // Finalize survivors are by contract loss-tolerant — no demotion.
    const items = [makeItem("A", "done"), makeItem("B", "pending"), makeItem("X", "pending")];
    const state = makeState(items, {
      salvageSurvivors: ["X"],
      dependencies: { A: [], B: ["A"], X: ["B"] },
      nodeCategories: { A: "dev", B: "dev", X: "finalize" },
      nodeTypes: { A: "agent", B: "agent", X: "agent" },
    });
    const result = salvageForDraft(state, "B");
    assert.equal(result.state.items.find((i) => i.key === "X")?.status, "pending");
    assert.deepEqual(result.demotedKeys, []);
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

  it("spares a producer whose required artifact still feeds a surviving consumer", () => {
    // A → B → C, C is a salvage survivor that declares
    // `consumes_artifacts: [{ from: A, kind: acceptance, required: true }]`.
    // A fails. Normal salvage would mark A, B, C all N/A; with C as a
    // surviving consumer of A's required artifact, A must NOT be demoted
    // (left as `failed` so the workflow's retry policy can recover it).
    const items = [makeItem("A", "failed"), makeItem("B", "pending"), makeItem("C", "pending")];
    const state = makeState(items, {
      salvageSurvivors: ["C"],
      dependencies: { A: [], B: ["A"], C: ["B"] },
      nodeCategories: { A: "dev", B: "dev", C: "finalize" },
      nodeTypes: { A: "agent", B: "agent", C: "agent" },
      requiredArtifactProducers: { C: ["A"] },
    });
    const result = salvageForDraft(state, "A");
    const a = result.state.items.find((i) => i.key === "A")!;
    const c = result.state.items.find((i) => i.key === "C")!;
    assert.equal(a.status, "failed", "spared producer must retain its existing status");
    assert.notEqual(a.salvaged, true, "spared producer must not carry sticky salvaged flag");
    assert.ok(!result.skippedKeys.includes("A"), "spared producer must not appear in skippedKeys");
    assert.deepEqual(result.sparedKeys, ["A"], "sparedKeys must report A");
    assert.equal(c.status, "pending", "surviving consumer remains force-pending");
    assert.match(
      result.state.errorLog.find((e) => e.itemKey === "salvage-draft")!.message,
      /spared by required-artifact contract: A/,
    );
  });

  it("demotes the producer when the surviving consumer marks the edge required: false", () => {
    // Same shape as the required-spare test, but C declares the edge as
    // optional. The new contract-based branch must NOT trigger — A is
    // demoted to N/A as it would be under the legacy salvage policy.
    const items = [makeItem("A", "failed"), makeItem("B", "pending"), makeItem("C", "pending")];
    const state = makeState(items, {
      salvageSurvivors: ["C"],
      dependencies: { A: [], B: ["A"], C: ["B"] },
      nodeCategories: { A: "dev", B: "dev", C: "finalize" },
      nodeTypes: { A: "agent", B: "agent", C: "agent" },
      // `required: false` → init-state would not record it; mirror that
      // here by leaving `requiredArtifactProducers` empty.
      requiredArtifactProducers: {},
    });
    const result = salvageForDraft(state, "A");
    const a = result.state.items.find((i) => i.key === "A")!;
    assert.equal(a.status, "na", "optional consumer must not block demotion");
    assert.equal(a.salvaged, true);
    assert.ok(result.skippedKeys.includes("A"));
    assert.deepEqual(result.sparedKeys, []);
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

// ---------------------------------------------------------------------------
// bypassNode (triage-reroute deadlock unlock)
// ---------------------------------------------------------------------------

describe("bypassNode", () => {
  it("flips a failed item to na and stamps bypassedFor", () => {
    const items = [makeItem("A", "failed"), makeItem("B", "pending")];
    const state = makeState(items);
    const result = bypassNode(state, "A", "B", "code-defect");
    assert.equal(result.applied, true);
    assert.equal(result.rejectedReason, undefined);
    const a = result.state.items.find((i) => i.key === "A")!;
    assert.equal(a.status, "na");
    assert.deepEqual(a.bypassedFor, { routeTarget: "B", cycleIndex: 1 });
    assert.equal(result.state.errorLog.length, 1);
    assert.equal(result.state.errorLog[0]!.itemKey, "bypass-for-reroute");
  });

  it("is idempotent for same routeTarget", () => {
    const items = [makeItem("A", "failed")];
    const state = makeState(items);
    const r1 = bypassNode(state, "A", "B", "first");
    const r2 = bypassNode(r1.state, "A", "B", "second");
    assert.equal(r2.applied, false);
    assert.equal(r2.state, r1.state);
  });

  it("rejects salvaged items (sticky degradation wins)", () => {
    const items: TransitionItem[] = [
      { ...makeItem("A", "failed"), salvaged: true },
    ];
    const state = makeState(items);
    const result = bypassNode(state, "A", "B", "after-salvage");
    assert.equal(result.applied, false);
    assert.equal(result.rejectedReason, "salvaged");
  });

  it("rejects non-failed items as wrong-status", () => {
    const items = [makeItem("A", "pending")];
    const state = makeState(items);
    const result = bypassNode(state, "A", "B", "premature");
    assert.equal(result.applied, false);
    assert.equal(result.rejectedReason, "wrong-status");
  });

  it("returns unknown-item for missing key", () => {
    const state = makeState([makeItem("A", "failed")]);
    const result = bypassNode(state, "Z", "B", "missing");
    assert.equal(result.applied, false);
    assert.equal(result.rejectedReason, "unknown-item");
  });

  it("increments cycleIndex across multiple bypasses", () => {
    let state = makeState([makeItem("A", "failed"), makeItem("B", "failed")]);
    state = bypassNode(state, "A", "X", "first").state;
    state = bypassNode(state, "B", "Y", "second").state;
    const a = state.items.find((i) => i.key === "A")!;
    const b = state.items.find((i) => i.key === "B")!;
    assert.equal(a.bypassedFor?.cycleIndex, 1);
    assert.equal(b.bypassedFor?.cycleIndex, 2);
  });
});

// ---------------------------------------------------------------------------
// resetNodes — bypass marker handling
// ---------------------------------------------------------------------------

describe("resetNodes (bypass interaction)", () => {
  it("re-pendings a bypassed na item and clears bypassedFor", () => {
    // Setup: A was failed, then bypassed to unlock route target X.
    let state = makeState([makeItem("A", "failed"), makeItem("B", "pending")]);
    state = bypassNode(state, "A", "X", "domain").state;
    // Now reset A (the auto-revalidate path).
    const result = resetNodes(state, "A", "reset-after-fix", 3, "reset-after-fix");
    const a = result.state.items.find((i) => i.key === "A")!;
    assert.equal(a.status, "pending");
    assert.equal(a.bypassedFor, undefined);
    assert.equal(result.halted, false);
  });

  it("leaves true-na (non-bypassed) items as na", () => {
    const items = [makeItem("A", "na"), makeItem("B", "done")];
    const state = makeState(items, { dependencies: { A: [], B: ["A"] } });
    const result = resetNodes(state, "A", "structural-na");
    const a = result.state.items.find((i) => i.key === "A")!;
    assert.equal(a.status, "na");
  });

  it("preserves bypassedFor marker when reset-after-fix exhausts its budget (halt)", () => {
    // Decision: when the gate cannot be re-validated within its budget,
    // we halt with the bypass marker INTACT for diagnostic visibility.
    // Operators inspecting `_state.json` see the originating reroute and
    // the matching `errorLog` entries; the `na` status is documented as
    // "bypassed" by the renderer (see pipeline-state.ts).
    let state = makeState([makeItem("A", "failed"), makeItem("B", "pending")]);
    state = bypassNode(state, "A", "X", "domain").state;
    // Burn the 3-cycle budget by appending fake reset-after-fix log entries.
    for (let i = 0; i < 3; i++) {
      state = {
        ...state,
        errorLog: [
          ...state.errorLog,
          { timestamp: new Date().toISOString(), itemKey: "reset-after-fix", message: `cycle ${i}` },
        ],
      };
    }
    const result = resetNodes(state, "A", "exhaust", 3, "reset-after-fix");
    assert.equal(result.halted, true);
    // Marker preserved on halt — state pointer unchanged.
    const a = result.state.items.find((i) => i.key === "A")!;
    assert.equal(a.status, "na");
    assert.deepEqual(a.bypassedFor, { routeTarget: "X", cycleIndex: 1 });
  });
});
