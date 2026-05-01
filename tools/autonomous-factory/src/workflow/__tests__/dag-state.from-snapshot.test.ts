/**
 * dag-state.from-snapshot.test.ts — Round-trip parity for the
 * `DagState.fromSnapshot` rehydration helper added in Session 5 P2.
 *
 * Covers the dynamic fields `fromState` would otherwise lose: held /
 * cancelled / cancelReason / batchNumber / cycleCounters / approvals.
 */

import { describe, it, expect } from "vitest";
import { DagState } from "../dag-state.js";
import type { CompiledNode } from "../domain/index.js";

const NODES: Record<string, CompiledNode> = {
  a: { agent: "alpha", type: "code", category: "dev", depends_on: [] },
  b: { agent: "alpha", type: "code", category: "dev", depends_on: ["a"] },
};

function fresh(): DagState {
  return DagState.fromInit({
    feature: "f",
    workflowName: "w",
    started: "2026-04-30T00:00:00.000Z",
    nodes: NODES,
  });
}

describe("DagState.fromSnapshot — round-trip", () => {
  it("restores held flag", () => {
    const a = fresh();
    a.markHeld();
    const b = DagState.fromSnapshot(a.snapshot());
    expect(b.isHeld()).toBe(true);
  });

  it("restores cancelled state + reason", () => {
    const a = fresh();
    a.markCancelled("ops-stop");
    const b = DagState.fromSnapshot(a.snapshot());
    expect(b.isCancelled()).toBe(true);
    expect(b.getCancelReason()).toBe("ops-stop");
  });

  it("restores batch counter", () => {
    const a = fresh();
    a.bumpBatch();
    a.bumpBatch();
    a.bumpBatch();
    const b = DagState.fromSnapshot(a.snapshot());
    expect(b.getBatchNumber()).toBe(3);
  });

  it("restores cycle counters via reset cycle path", () => {
    const a = fresh();
    a.applyFail("a", "boom", "2026-04-30T00:00:00.000Z");
    a.applyResetNodes("a", "redo", "2026-04-30T00:00:00.000Z", 5, "redo-A");
    const counters = a.snapshot().cycleCounters;
    expect(counters["redo-A"]).toBeGreaterThan(0);
    const b = DagState.fromSnapshot(a.snapshot());
    expect(b.snapshot().cycleCounters["redo-A"]).toBe(counters["redo-A"]);
  });

  it("restores DAG-shape state (items / errorLog)", () => {
    const a = fresh();
    a.applyFail("a", "boom", "2026-04-30T00:00:00.000Z");
    const snapA = a.snapshot();
    const b = DagState.fromSnapshot(snapA);
    const snapB = b.snapshot();
    expect(snapB.state.items.map((i) => [i.key, i.status]))
      .toEqual(snapA.state.items.map((i) => [i.key, i.status]));
    expect(snapB.state.errorLog.length).toBe(snapA.state.errorLog.length);
  });

  it("restores approvals registry", () => {
    const a = fresh();
    a.markApprovalRequested("gate1", 1700000000000);
    const b = DagState.fromSnapshot(a.snapshot());
    expect(b.hasPendingApproval()).toBe(true);
  });

  it("idempotent: snapshot → fromSnapshot → snapshot equals original", () => {
    const a = fresh();
    a.applyFail("a", "boom", "2026-04-30T00:00:00.000Z");
    a.bumpBatch();
    a.markHeld();
    const snap1 = a.snapshot();
    const b = DagState.fromSnapshot(snap1);
    const snap2 = b.snapshot();
    expect(snap2.held).toBe(snap1.held);
    expect(snap2.batchNumber).toBe(snap1.batchNumber);
    expect(snap2.cycleCounters).toEqual(snap1.cycleCounters);
    expect(snap2.state.items.length).toBe(snap1.state.items.length);
  });
});
