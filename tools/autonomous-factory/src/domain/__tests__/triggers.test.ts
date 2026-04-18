/**
 * domain/__tests__/triggers.test.ts — Phase 3: scheduling triggers semantics.
 *
 * Validates that `triggers: ["route"]` nodes start dormant (hidden from the
 * scheduler) and can only be woken by triage routing. Covers three shapes:
 *   • No triggers → default `["schedule"]` → starts pending
 *   • Explicit `["schedule"]` → starts pending
 *   • Explicit `["route"]` → starts dormant, even with zero deps
 *   • `["schedule", "route"]` → starts pending (schedule wins)
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildInitialState, type CompiledNode } from "../init-state.js";
import { schedule, type SchedulableItem } from "../scheduling.js";

function base(overrides: Partial<CompiledNode> = {}): CompiledNode {
  return { depends_on: [], ...overrides };
}

describe("triggers: scheduling semantics", () => {
  it("node without triggers defaults to pending", () => {
    const state = buildInitialState({
      feature: "t",
      workflowName: "w",
      started: "now",
      nodes: { A: base() },
    });
    assert.equal(state.items[0].status, "pending");
    assert.ok(!state.dormantByActivation.includes("A"));
  });

  it("triggers:['schedule'] is pending", () => {
    const state = buildInitialState({
      feature: "t",
      workflowName: "w",
      started: "now",
      nodes: { A: base({ triggers: ["schedule"] }) },
    });
    assert.equal(state.items[0].status, "pending");
  });

  it("triggers:['route'] is dormant at init (hidden node)", () => {
    const state = buildInitialState({
      feature: "t",
      workflowName: "w",
      started: "now",
      nodes: {
        A: base(),
        hidden: base({ triggers: ["route"] }),
      },
    });
    const hidden = state.items.find((i) => i.key === "hidden")!;
    assert.equal(hidden.status, "dormant");
    assert.ok(state.dormantByActivation.includes("hidden"));
  });

  it("triggers:['schedule','route'] stays pending", () => {
    const state = buildInitialState({
      feature: "t",
      workflowName: "w",
      started: "now",
      nodes: { A: base({ triggers: ["schedule", "route"] }) },
    });
    assert.equal(state.items[0].status, "pending");
  });

  it("scheduler never surfaces a dormant route-only node", () => {
    // Simulate a pipeline with a hidden debug node — scheduler must not
    // return it even though it has no dependencies.
    const items: SchedulableItem[] = [
      { key: "A", label: "A", agent: null, status: "pending" },
      { key: "hidden", label: "hidden", agent: null, status: "dormant" },
    ];
    const result = schedule(items, { A: [], hidden: [] });
    assert.equal(result.kind, "items");
    if (result.kind === "items") {
      assert.deepEqual(
        result.items.map((i) => i.key),
        ["A"],
        "dormant route-only node must be invisible to the scheduler",
      );
    }
  });
});
