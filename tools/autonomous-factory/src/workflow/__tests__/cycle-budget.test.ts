/**
 * cycle-budget.test.ts — P3 (Session 5 pre-flight) verification.
 *
 * Asserts the workflow's cycle-budget halt path: `applyTriageCommand`
 * returns a non-empty `triage-halt: ...` reason when an emitted
 * `reset-nodes` command exhausts its budget. Pairs with the existing
 * `dag-state.test.ts` (which covers `cycleBudgetExceeded` /
 * `applyResetNodes` semantics) and `parity.test.ts` (which proves
 * legacy/new reducer parity on halt). This file owns the
 * workflow-body-level evidence that the halt reason actually surfaces.
 *
 * Closes Session 5 P3 ("Cycle-budget exhaustion path verified end-to-end").
 */

import { describe, it, expect } from "vitest";
import { DagState } from "../dag-state.js";
import { applyTriageCommand } from "../pipeline.workflow.js";
import type { TransitionState, TransitionItem } from "../domain/index.js";
import type { DagCommand } from "../../dag-commands.js";

const NOW = "2026-04-30T00:00:00.000Z";

function makeItem(key: string, status: TransitionItem["status"] = "pending"): TransitionItem {
  return { key, label: key, agent: null, status, error: null };
}

function makeState(items: TransitionItem[], overrides?: Partial<TransitionState>): TransitionState {
  return {
    items,
    errorLog: [],
    dependencies: { A: [] },
    nodeTypes: { A: "agent" },
    nodeCategories: { A: "dev" },
    naByType: [],
    salvageSurvivors: [],
    ...overrides,
  };
}

describe("applyTriageCommand — cycle-budget halt reason emission", () => {
  it("returns null while the budget has slack", () => {
    const dag = DagState.fromState(makeState([makeItem("A", "failed")]));
    const cmd: DagCommand = {
      type: "reset-nodes",
      seedKey: "A",
      reason: "fix it",
      logKey: "redo-A",
      maxCycles: 3,
    };
    const halt = applyTriageCommand(cmd, dag, NOW);
    expect(halt).toBeNull();
  });

  it("returns a triage-halt reason when the budget is exhausted", () => {
    // Pre-seed errorLog with maxCycles=3 entries for `redo-A` so the
    // next reset-nodes call short-circuits with halted=true. Mirrors
    // the parity-test fixture for byte-for-byte consistency with the
    // legacy reducer path.
    const seed = makeState([makeItem("A", "failed")], {
      errorLog: [
        { timestamp: NOW, itemKey: "redo-A", message: "c1" },
        { timestamp: NOW, itemKey: "redo-A", message: "c2" },
        { timestamp: NOW, itemKey: "redo-A", message: "c3" },
      ],
    });
    const dag = DagState.fromState(seed);
    const cmd: DagCommand = {
      type: "reset-nodes",
      seedKey: "A",
      reason: "fix it",
      logKey: "redo-A",
      maxCycles: 3,
    };
    const halt = applyTriageCommand(cmd, dag, NOW);
    expect(halt).not.toBeNull();
    expect(halt).toMatch(/^triage-halt: /);
    expect(halt).toContain("'A'");
    expect(halt).toContain("logKey=redo-A");
  });

  it("uses the default logKey 'reset-nodes' when the command omits it", () => {
    const seed = makeState([makeItem("A", "failed")], {
      errorLog: [
        { timestamp: NOW, itemKey: "reset-nodes", message: "c1" },
        { timestamp: NOW, itemKey: "reset-nodes", message: "c2" },
      ],
    });
    const dag = DagState.fromState(seed);
    const cmd: DagCommand = {
      type: "reset-nodes",
      seedKey: "A",
      reason: "fix it",
      maxCycles: 2,
    };
    const halt = applyTriageCommand(cmd, dag, NOW);
    expect(halt).not.toBeNull();
    expect(halt).toContain("logKey=reset-nodes");
  });

  it("repeated resets eventually halt at the configured budget", () => {
    // Walks the full halt loop without manually pre-seeding errorLog —
    // proves the reducers DO stamp errorLog correctly (the worry the
    // stale scope-note in pipeline.workflow.ts called out before this
    // test landed).
    const dag = DagState.fromState(makeState([makeItem("A", "failed")]));
    const cmd: DagCommand = {
      type: "reset-nodes",
      seedKey: "A",
      reason: "fix it",
      logKey: "loop-A",
      maxCycles: 3,
    };
    // First three resets succeed (each consumes one cycle and bumps
    // the counter via DagState's bumpCounter side effect).
    expect(applyTriageCommand(cmd, dag, NOW)).toBeNull();
    // Each successful reset moves A back to pending; mark it failed
    // again to simulate the next failure cycle.
    dag.applyFail("A", "still broken", NOW);
    expect(applyTriageCommand(cmd, dag, NOW)).toBeNull();
    dag.applyFail("A", "still broken", NOW);
    expect(applyTriageCommand(cmd, dag, NOW)).toBeNull();
    dag.applyFail("A", "still broken", NOW);
    // Fourth reset attempt halts.
    const halt = applyTriageCommand(cmd, dag, NOW);
    expect(halt).not.toBeNull();
    expect(halt).toContain("logKey=loop-A");
  });

  it("non-reset commands never halt the run", () => {
    const dag = DagState.fromState(makeState([makeItem("A", "failed")]));
    const salvage: DagCommand = { type: "salvage-draft", failedItemKey: "A" };
    expect(applyTriageCommand(salvage, dag, NOW)).toBeNull();
  });
});
