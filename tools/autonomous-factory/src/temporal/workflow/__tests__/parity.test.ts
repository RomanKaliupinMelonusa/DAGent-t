/**
 * parity.test.ts — Cross-path parity between legacy `src/domain/` and the
 * workflow-scoped `src/temporal/workflow/domain/` twin.
 *
 * For each scenario, the same input fixture is fed through both reducer
 * paths. After projecting away two intentional deltas (timestamp source
 * + signature impl, both byte-equivalent given the same inputs), the
 * resulting `TransitionState`s must be deep-equal.
 *
 * Time normalisation: legacy reducers stamp `new Date().toISOString()`;
 * the new reducers take `now: string` directly. We freeze legacy `Date`
 * via `vi.setSystemTime(NOW)` and pass the same `NOW` string to the new
 * path. Result: timestamps match byte-for-byte.
 *
 * Hash impl normalisation: both implementations hash the same volatile-
 * stripped input with SHA-256 and slice 16 hex chars. Same input ⇒ same
 * output. No projection needed.
 *
 * Documented in `docs/temporal-migration/02-parity-notes.md`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Legacy paths
import * as legacyT from "../../../domain/transitions.js";
import * as legacyS from "../../../domain/scheduling.js";
import { computeErrorSignature as legacySig } from "../../../domain/error-signature.js";

// New (workflow-scoped) paths
import * as newT from "../domain/transitions.js";
import * as newS from "../domain/scheduling.js";
import { computeErrorSignature as newSig } from "../domain/error-signature.js";

const NOW = "2026-04-29T00:00:00.000Z";
const NOW_DATE = new Date(NOW);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW_DATE);
});
afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Fixture builder
// ---------------------------------------------------------------------------

function makeItem(key: string, status: legacyT.TransitionItem["status"] = "pending"): legacyT.TransitionItem {
  return { key, label: key, agent: null, status, error: null };
}

function makeState(items: legacyT.TransitionItem[], overrides?: Partial<legacyT.TransitionState>): legacyT.TransitionState {
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

/** Deep-clone fixture so the two reducer paths cannot share state. */
function clone<T>(x: T): T {
  return structuredClone(x);
}

// ---------------------------------------------------------------------------
// Hash impl parity
// ---------------------------------------------------------------------------

describe("computeErrorSignature parity", () => {
  it("produces identical 16-hex outputs for identical inputs", () => {
    const samples = [
      "Error at /foo/bar:123",
      "Connection refused: 127.0.0.1:8080",
      "RequestId: abcdef0123456789 returned 500",
      "Pre-hook failed (exit 1)",
      "",
      "Mixed: pid=4185 at 2026-04-29T00:00:00Z on worker-7",
    ];
    for (const s of samples) {
      expect(newSig(s)).toBe(legacySig(s));
    }
  });
});

// ---------------------------------------------------------------------------
// Reducer parity scenarios
// ---------------------------------------------------------------------------

describe("transitions parity", () => {
  it("completeItem", () => {
    const seed = makeState([makeItem("A"), makeItem("B")]);
    const a = legacyT.completeItem(clone(seed), "A").state;
    const b = newT.completeItem(clone(seed), "A").state;
    expect(b).toEqual(a);
  });

  it("failItem (default maxFailures)", () => {
    const seed = makeState([makeItem("A")]);
    const a = legacyT.failItem(clone(seed), "A", "broke").state;
    const b = newT.failItem(clone(seed), "A", "broke", NOW).state;
    expect(b).toEqual(a);
  });

  it("failItem haltOnIdentical", () => {
    const sig = "abc123def4567890";
    const seed = makeState([makeItem("A")], {
      errorLog: [{ timestamp: NOW, itemKey: "A", message: "prior", errorSignature: sig }],
    });
    const a = legacyT.failItem(clone(seed), "A", "x", { haltOnIdentical: true }, () => sig);
    const b = newT.failItem(clone(seed), "A", "x", NOW, { haltOnIdentical: true }, () => sig);
    expect(b.state).toEqual(a.state);
    expect(b.halted).toBe(a.halted);
  });

  it("failItem haltOnIdenticalThreshold across keys", () => {
    const sig = "deadbeefcafebabe";
    const seed = makeState([makeItem("A"), makeItem("B"), makeItem("C")], {
      errorLog: [
        { timestamp: NOW, itemKey: "B", message: "m1", errorSignature: sig },
        { timestamp: NOW, itemKey: "C", message: "m2", errorSignature: sig },
      ],
    });
    const a = legacyT.failItem(clone(seed), "A", "m3", { haltOnIdenticalThreshold: 3 }, () => sig);
    const b = newT.failItem(clone(seed), "A", "m3", NOW, { haltOnIdenticalThreshold: 3 }, () => sig);
    expect(b.state).toEqual(a.state);
    expect(b.haltedByThreshold).toBe(a.haltedByThreshold);
    expect(b.thresholdMatchCount).toBe(a.thresholdMatchCount);
  });

  it("resetNodes single + cascade", () => {
    const seed = makeState([
      makeItem("A", "failed"),
      makeItem("B", "done"),
      makeItem("C", "done"),
      makeItem("D", "done"),
    ]);
    const a = legacyT.resetNodes(clone(seed), "A", "redo", 5, "reset-after-fix");
    const b = newT.resetNodes(clone(seed), "A", "redo", NOW, 5, "reset-after-fix");
    expect(b.state).toEqual(a.state);
    expect(b.resetKeys.sort()).toEqual([...a.resetKeys].sort());
  });

  it("resetNodes rejects salvaged seed", () => {
    const items: legacyT.TransitionItem[] = [{ ...makeItem("A", "na"), salvaged: true }];
    const seed = makeState(items);
    const a = legacyT.resetNodes(clone(seed), "A", "redo");
    const b = newT.resetNodes(clone(seed), "A", "redo", NOW);
    expect(b.state).toEqual(a.state);
    expect(b.rejectedReason).toBe(a.rejectedReason);
  });

  it("resetNodes halts on cycle-budget exhaustion", () => {
    // Pre-seed errorLog with 3 entries for logKey "redo-A" so the next
    // resetNodes(maxCycles=3) call short-circuits with halted=true.
    const seed = makeState([makeItem("A", "failed")], {
      errorLog: [
        { timestamp: NOW, itemKey: "redo-A", message: "c1" },
        { timestamp: NOW, itemKey: "redo-A", message: "c2" },
        { timestamp: NOW, itemKey: "redo-A", message: "c3" },
      ],
    });
    const a = legacyT.resetNodes(clone(seed), "A", "fix it", 3, "redo-A");
    const b = newT.resetNodes(clone(seed), "A", "fix it", NOW, 3, "redo-A");
    expect(b.state).toEqual(a.state);
    expect(b.halted).toBe(true);
    expect(b.halted).toBe(a.halted);
    expect(b.cycleCount).toBe(a.cycleCount);
    expect(b.resetKeys).toEqual(a.resetKeys);
  });

  it("bypassNode failed → na", () => {
    const seed = makeState([makeItem("A", "failed")]);
    const a = legacyT.bypassNode(clone(seed), "A", "T", "unblock");
    const b = newT.bypassNode(clone(seed), "A", "T", "unblock", NOW);
    expect(b.state).toEqual(a.state);
    expect(b.applied).toBe(a.applied);
  });

  it("salvageForDraft demotes downstream", () => {
    const seed = makeState([
      makeItem("A", "failed"),
      makeItem("B"),
      makeItem("C"),
      makeItem("D"),
    ], {
      nodeCategories: { A: "dev", B: "dev", C: "test", D: "finalize" },
      salvageSurvivors: ["D"],
    });
    const a = legacyT.salvageForDraft(clone(seed), "A");
    const b = newT.salvageForDraft(clone(seed), "A", NOW);
    expect(b.state).toEqual(a.state);
    expect(b.skippedKeys.sort()).toEqual([...a.skippedKeys].sort());
  });

  it("resetScripts in category", () => {
    const items = [
      makeItem("dev", "done"),
      makeItem("push", "done"),
      makeItem("ci", "done"),
    ];
    const seed = {
      ...makeState(items),
      dependencies: { dev: [], push: ["dev"], ci: ["push"] },
      nodeTypes: { dev: "agent", push: "script", ci: "script" },
      nodeCategories: { dev: "dev", push: "deploy", ci: "deploy" },
    };
    const a = legacyT.resetScripts(clone(seed), "deploy");
    const b = newT.resetScripts(clone(seed), "deploy", NOW);
    expect(b.state).toEqual(a.state);
    expect(b.resetKeys.sort()).toEqual([...a.resetKeys].sort());
  });

  it("resumeAfterElevated", () => {
    const seed = makeState([makeItem("A")]);
    const a = legacyT.resumeAfterElevated(clone(seed));
    const b = newT.resumeAfterElevated(clone(seed), NOW);
    expect(b.state).toEqual(a.state);
    expect(b.cycleCount).toBe(a.cycleCount);
    expect(b.resetCount).toBe(a.resetCount);
  });
});

// ---------------------------------------------------------------------------
// Scheduling parity (no Date dependency — pure)
// ---------------------------------------------------------------------------

describe("scheduling parity", () => {
  it("schedule basic", () => {
    const items = [
      { key: "A", label: "A", agent: null, status: "done" as const },
      { key: "B", label: "B", agent: null, status: "pending" as const },
      { key: "C", label: "C", agent: null, status: "pending" as const },
      { key: "D", label: "D", agent: null, status: "pending" as const },
    ];
    const deps = { A: [], B: ["A"], C: ["A"], D: ["B", "C"] };
    const a = legacyS.schedule(items, deps);
    const b = newS.schedule(items, deps);
    expect(b).toEqual(a);
  });

  it("schedule complete", () => {
    const items = [
      { key: "A", label: "A", agent: null, status: "done" as const },
      { key: "B", label: "B", agent: null, status: "na" as const },
    ];
    const deps = { A: [], B: ["A"] };
    expect(newS.schedule(items, deps)).toEqual(legacyS.schedule(items, deps));
  });
});
