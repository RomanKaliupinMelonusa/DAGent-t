/**
 * dag-state.test.ts — Unit tests for the workflow-scoped DagState façade.
 *
 * Mirrors the coverage of `src/domain/__tests__/{transitions,scheduling,
 * cycle-counter}.test.ts` against the new façade. The legacy `__tests__`
 * use `node:test`; this suite uses Vitest (per Session 1 D1).
 *
 * Time is injected as a fixed ISO string per test to keep results
 * byte-stable. The legacy reducers stamp `new Date().toISOString()`;
 * cross-path parity is asserted in `parity.test.ts`.
 */

import { describe, it, expect } from "vitest";
import { DagState } from "../dag-state.js";
import type { TransitionState, TransitionItem } from "../domain/transitions.js";

const NOW = "2026-04-29T00:00:00.000Z";

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
// Construction
// ---------------------------------------------------------------------------

describe("DagState.fromInit", () => {
  it("seeds items in topological order with pending status", () => {
    const dag = DagState.fromInit({
      feature: "f",
      workflowName: "w",
      started: NOW,
      nodes: {
        A: { agent: "dev", depends_on: [] },
        B: { agent: "dev", depends_on: ["A"] },
      },
    });
    const ready = dag.getReady();
    expect(ready.kind).toBe("items");
    if (ready.kind === "items") expect(ready.items.map((i) => i.key)).toEqual(["A"]);
  });

  it("starts triage-only nodes dormant", () => {
    const dag = DagState.fromInit({
      feature: "f",
      workflowName: "w",
      started: NOW,
      nodes: {
        A: { agent: "dev", depends_on: [] },
        T: { agent: "triage", depends_on: [], type: "triage" },
      },
    });
    const snap = dag.snapshot();
    expect(snap.state.items.find((i) => i.key === "T")?.status).toBe("dormant");
  });
});

// ---------------------------------------------------------------------------
// applyComplete
// ---------------------------------------------------------------------------

describe("DagState.applyComplete", () => {
  it("marks pending → done", () => {
    const dag = DagState.fromState(makeState([makeItem("A"), makeItem("B")]));
    dag.applyComplete("A");
    expect(dag.snapshot().state.items.find((i) => i.key === "A")?.status).toBe("done");
  });

  it("is idempotent on na items", () => {
    const dag = DagState.fromState(makeState([makeItem("A", "na")]));
    dag.applyComplete("A");
    expect(dag.snapshot().state.items[0]?.status).toBe("na");
  });

  it("throws on unknown key", () => {
    const dag = DagState.fromState(makeState([makeItem("A")]));
    expect(() => dag.applyComplete("Z")).toThrowError(/Unknown item key/);
  });
});

// ---------------------------------------------------------------------------
// applyFail
// ---------------------------------------------------------------------------

describe("DagState.applyFail", () => {
  it("appends error log with injected timestamp", () => {
    const dag = DagState.fromState(makeState([makeItem("A")]));
    const r = dag.applyFail("A", "broke", NOW);
    expect(r.failCount).toBe(1);
    expect(r.halted).toBe(false);
    const snap = dag.snapshot();
    expect(snap.state.errorLog[0]?.timestamp).toBe(NOW);
    expect(snap.state.items[0]?.status).toBe("failed");
  });

  it("halts at maxFailures", () => {
    const errorLog = Array.from({ length: 9 }, (_, i) => ({
      timestamp: NOW,
      itemKey: "A",
      message: `fail ${i}`,
    }));
    const dag = DagState.fromState(makeState([makeItem("A")], { errorLog }));
    const r = dag.applyFail("A", "fail 10", NOW);
    expect(r.halted).toBe(true);
    expect(r.failCount).toBe(10);
  });

  it("haltOnIdentical halts when prior signature matches", () => {
    const sig = "abc123def4567890";
    const dag = DagState.fromState(
      makeState([makeItem("A")], {
        errorLog: [{ timestamp: NOW, itemKey: "A", message: "prior", errorSignature: sig }],
      }),
    );
    const r = dag.applyFail("A", "x", NOW, { haltOnIdentical: true }, () => sig);
    expect(r.halted).toBe(true);
  });

  it("haltOnIdenticalThreshold halts across keys", () => {
    const sig = "deadbeefcafebabe";
    const dag = DagState.fromState(
      makeState([makeItem("A"), makeItem("B"), makeItem("C")], {
        errorLog: [
          { timestamp: NOW, itemKey: "B", message: "m1", errorSignature: sig },
          { timestamp: NOW, itemKey: "C", message: "m2", errorSignature: sig },
        ],
      }),
    );
    const r = dag.applyFail("A", "m3", NOW, { haltOnIdenticalThreshold: 3 }, () => sig);
    expect(r.halted).toBe(true);
    expect(r.haltedByThreshold).toBe(true);
    expect(r.thresholdMatchCount).toBe(3);
  });

  it("excluded keys bypass the threshold halt", () => {
    const sig = "deadbeefcafebabe";
    const dag = DagState.fromState(
      makeState([makeItem("A"), makeItem("B"), makeItem("C")], {
        errorLog: [
          { timestamp: NOW, itemKey: "B", message: "m1", errorSignature: sig },
          { timestamp: NOW, itemKey: "C", message: "m2", errorSignature: sig },
        ],
      }),
    );
    const r = dag.applyFail(
      "A",
      "m3",
      NOW,
      { haltOnIdenticalThreshold: 3, haltOnIdenticalExcludedKeys: ["A"] },
      () => sig,
    );
    expect(r.halted).toBe(false);
  });

  it("computes a stable error signature via the workflow-safe hash", () => {
    const dag = DagState.fromState(makeState([makeItem("A")]));
    const r = dag.applyFail("A", "Error at /foo/bar:123", NOW);
    expect(r.errorSignature).toBeDefined();
    expect(r.errorSignature!.length).toBe(16);
  });
});

// ---------------------------------------------------------------------------
// applyResetNodes
// ---------------------------------------------------------------------------

describe("DagState.applyResetNodes", () => {
  it("resets seed + downstream and bumps cycle counter", () => {
    const dag = DagState.fromState(
      makeState([
        makeItem("A", "failed"),
        makeItem("B", "done"),
        makeItem("C", "done"),
        makeItem("D", "done"),
      ]),
    );
    const r = dag.applyResetNodes("A", "redo", NOW, 5, "reset-after-fix");
    expect(r.halted).toBe(false);
    expect(r.resetKeys.sort()).toEqual(["A", "B", "C", "D"]);
    expect(dag.snapshot().cycleCounters["reset-after-fix"]).toBe(1);
  });

  it("halts at maxCycles", () => {
    const errorLog = Array.from({ length: 5 }, (_, i) => ({
      timestamp: NOW,
      itemKey: "reset-nodes",
      message: `cycle ${i}`,
    }));
    const dag = DagState.fromState(makeState([makeItem("A", "failed")], { errorLog }));
    const r = dag.applyResetNodes("A", "redo", NOW, 5);
    expect(r.halted).toBe(true);
    expect(r.resetKeys).toEqual([]);
  });

  it("rejects salvaged seed (sticky)", () => {
    const items = [{ ...makeItem("A", "na"), salvaged: true }];
    const dag = DagState.fromState(makeState(items));
    const r = dag.applyResetNodes("A", "redo", NOW);
    expect(r.rejectedReason).toBe("salvaged");
  });
});

// ---------------------------------------------------------------------------
// applyBypass
// ---------------------------------------------------------------------------

describe("DagState.applyBypass", () => {
  it("flips failed → na with bypassedFor marker", () => {
    const dag = DagState.fromState(makeState([makeItem("A", "failed")]));
    const r = dag.applyBypass("A", "T", "unblock", NOW);
    expect(r.applied).toBe(true);
    const item = dag.snapshot().state.items.find((i) => i.key === "A");
    expect(item?.status).toBe("na");
    expect(item?.bypassedFor?.routeTarget).toBe("T");
  });

  it("rejects pending status", () => {
    const dag = DagState.fromState(makeState([makeItem("A")]));
    const r = dag.applyBypass("A", "T", "unblock", NOW);
    expect(r.applied).toBe(false);
    expect(r.rejectedReason).toBe("wrong-status");
  });

  it("is idempotent on already-bypassed item with same target", () => {
    const items = [{ ...makeItem("A", "na"), bypassedFor: { routeTarget: "T", cycleIndex: 1 } }];
    const dag = DagState.fromState(makeState(items));
    const r = dag.applyBypass("A", "T", "again", NOW);
    expect(r.applied).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applySalvage
// ---------------------------------------------------------------------------

describe("DagState.applySalvage", () => {
  it("demotes downstream to na for draft PR", () => {
    const dag = DagState.fromState(
      makeState([
        makeItem("A", "failed"),
        makeItem("B"),
        makeItem("C"),
        makeItem("D"),
      ], {
        // D is a finalize survivor (loss-tolerant) — exempt from the
        // deploy-orphan demotion sweep, so it stays pending.
        nodeCategories: { A: "dev", B: "dev", C: "test", D: "finalize" },
        salvageSurvivors: ["D"],
      }),
    );
    const r = dag.applySalvage("A", NOW);
    expect(r.skippedKeys).toContain("A");
    expect(r.skippedKeys).toContain("B");
    expect(r.skippedKeys).toContain("C");
    const snap = dag.snapshot().state;
    expect(snap.items.find((i) => i.key === "D")?.status).toBe("pending");
  });

  it("respects salvageImmune", () => {
    const dag = DagState.fromState(
      makeState([
        makeItem("A", "failed"),
        makeItem("B"),
        makeItem("D"),
      ], {
        dependencies: { A: [], B: ["A"], D: ["B"] },
        nodeCategories: { A: "dev", B: "dev", D: "deploy" },
        salvageSurvivors: ["D"],
        salvageImmune: ["D"],
      }),
    );
    dag.applySalvage("A", NOW);
    const snap = dag.snapshot().state;
    // D is immune — stays pending despite all deps being na
    expect(snap.items.find((i) => i.key === "D")?.status).toBe("pending");
  });
});

// ---------------------------------------------------------------------------
// Admin reducers
// ---------------------------------------------------------------------------

describe("DagState.applyResetScripts", () => {
  it("resets script nodes in category and bumps counter", () => {
    const items = [
      { ...makeItem("dev", "done") },
      { ...makeItem("push", "done") },
      { ...makeItem("ci", "done") },
    ];
    const dag = DagState.fromState({
      ...makeState(items),
      dependencies: { dev: [], push: ["dev"], ci: ["push"] },
      nodeTypes: { dev: "agent", push: "script", ci: "script" },
      nodeCategories: { dev: "dev", push: "deploy", ci: "deploy" },
    });
    const r = dag.applyResetScripts("deploy", NOW);
    expect(r.halted).toBe(false);
    expect(r.cycleCount).toBe(1);
    expect(dag.snapshot().cycleCounters["reset-scripts:deploy"]).toBe(1);
    const snap = dag.snapshot().state;
    expect(snap.items.find((i) => i.key === "push")?.status).toBe("pending");
    expect(snap.items.find((i) => i.key === "ci")?.status).toBe("pending");
  });
});

describe("DagState.applyResumeAfterElevated", () => {
  it("bumps resume-elevated counter", () => {
    const dag = DagState.fromState(makeState([makeItem("A")]));
    const r = dag.applyResumeAfterElevated(NOW);
    expect(r.halted).toBe(false);
    expect(r.cycleCount).toBe(1);
    expect(dag.snapshot().cycleCounters["resume-elevated"]).toBe(1);
  });
});

describe("DagState.applyRecoverElevated", () => {
  it("fails the infra poll node and resets infra dev cascade", () => {
    const items = [
      makeItem("infra-dev", "done"),
      makeItem("infra-poll", "done"),
    ];
    const dag = DagState.fromState({
      ...makeState(items),
      dependencies: { "infra-dev": [], "infra-poll": ["infra-dev"] },
      nodeTypes: { "infra-dev": "agent", "infra-poll": "script" },
      nodeCategories: { "infra-dev": "dev", "infra-poll": "deploy" },
    });
    const r = dag.applyRecoverElevated("plan failed", NOW);
    expect(r.halted).toBe(false);
    const snap = dag.snapshot().state;
    expect(snap.items.find((i) => i.key === "infra-dev")?.status).toBe("pending");
  });

  it("throws when no infra dev node found", () => {
    // No node has category="dev" with zero deps — findInfraDevKey returns null.
    const dag = DagState.fromState({
      ...makeState([makeItem("X", "done"), makeItem("Y")]),
      dependencies: { X: [], Y: ["X"] },
      nodeTypes: { X: "agent", Y: "script" },
      nodeCategories: { X: "test", Y: "deploy" },
    });
    expect(() => dag.applyRecoverElevated("err", NOW)).toThrowError(/no infrastructure dev node/);
  });

  it("halts when infra-poll fail count exceeds max", () => {
    // Pre-seed errorLog with 2 prior failures for infra-poll. With
    // maxFailCount=3, the next failItem inside applyRecoverElevated
    // pushes failCount to 3 and halts — the cascade reset never runs.
    const items = [makeItem("infra-dev", "done"), makeItem("infra-poll", "done")];
    const dag = DagState.fromState({
      ...makeState(items, {
        errorLog: [
          { timestamp: NOW, itemKey: "infra-poll", message: "prev1" },
          { timestamp: NOW, itemKey: "infra-poll", message: "prev2" },
        ],
      }),
      dependencies: { "infra-dev": [], "infra-poll": ["infra-dev"] },
      nodeTypes: { "infra-dev": "agent", "infra-poll": "script" },
      nodeCategories: { "infra-dev": "dev", "infra-poll": "deploy" },
    });
    const r = dag.applyRecoverElevated("plan failed", NOW, 3);
    expect(r.halted).toBe(true);
    expect(r.failCount).toBe(3);
    // infra-dev must NOT have been reset — it should still be "done".
    const snap = dag.snapshot().state;
    expect(snap.items.find((i) => i.key === "infra-dev")?.status).toBe("done");
  });
});

// ---------------------------------------------------------------------------
// Predicates
// ---------------------------------------------------------------------------

describe("DagState predicates", () => {
  it("isComplete: all terminal", () => {
    const dag = DagState.fromState(
      makeState([makeItem("A", "done"), makeItem("B", "na"), makeItem("C", "dormant")]),
    );
    expect(dag.isComplete()).toBe(true);
  });

  it("isComplete: pending blocks", () => {
    const dag = DagState.fromState(makeState([makeItem("A", "done"), makeItem("B")]));
    expect(dag.isComplete()).toBe(false);
  });

  it("hasFailed reflects items[].status", () => {
    const dag = DagState.fromState(makeState([makeItem("A", "failed")]));
    expect(dag.hasFailed()).toBe(true);
  });

  it("lastFailure returns most recent log entry", () => {
    const dag = DagState.fromState(makeState([makeItem("A")]));
    dag.applyFail("A", "boom", NOW);
    const last = dag.lastFailure();
    expect(last?.itemKey).toBe("A");
  });

  it("cycleBudgetExceeded uses errorLog count", () => {
    const errorLog = Array.from({ length: 5 }, (_, i) => ({
      timestamp: NOW,
      itemKey: "reset-after-fix",
      message: `cycle ${i}`,
    }));
    const dag = DagState.fromState(makeState([makeItem("A")], { errorLog }));
    expect(dag.cycleBudgetExceeded("reset-after-fix", 5)).toBe(true);
    expect(dag.cycleBudgetExceeded("reset-after-fix", 10)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Snapshot immutability
// ---------------------------------------------------------------------------

describe("DagState.snapshot", () => {
  it("returns a frozen object", () => {
    const dag = DagState.fromState(makeState([makeItem("A")]));
    const snap = dag.snapshot();
    expect(Object.isFrozen(snap)).toBe(true);
  });

  it("snapshot is detached from the live state", () => {
    const dag = DagState.fromState(makeState([makeItem("A")]));
    const snap = dag.snapshot();
    dag.applyComplete("A");
    // Original snapshot is unaffected.
    expect(snap.state.items[0]?.status).toBe("pending");
    expect(dag.snapshot().state.items[0]?.status).toBe("done");
  });
});

// ---------------------------------------------------------------------------
// Approval gates (Session 4 stubs)
// ---------------------------------------------------------------------------

describe("DagState approval gates", () => {
  it("registers and resolves approvals", () => {
    const dag = DagState.fromState(makeState([makeItem("A")]));
    dag.markApprovalRequested("infra-apply", 1000);
    expect(dag.hasPendingApproval()).toBe(true);
    dag.markApprovalResolved("infra-apply", "approved", 2000);
    expect(dag.hasPendingApproval()).toBe(false);
    const snap = dag.snapshot();
    expect(snap.approvals[0]?.decision).toBe("approved");
    expect(snap.approvals[0]?.resolvedAtMs).toBe(2000);
  });

  it("re-registering is a no-op", () => {
    const dag = DagState.fromState(makeState([makeItem("A")]));
    dag.markApprovalRequested("g", 1000);
    dag.markApprovalRequested("g", 5000);
    expect(dag.snapshot().approvals[0]?.requestedAtMs).toBe(1000);
  });

  it("resolving unknown gate throws", () => {
    const dag = DagState.fromState(makeState([makeItem("A")]));
    expect(() => dag.markApprovalResolved("zzz", "approved", 1)).toThrowError(/Unknown approval gate/);
  });
});
