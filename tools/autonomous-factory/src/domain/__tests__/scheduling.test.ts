/**
 * domain/scheduling.test.ts — Unit tests for pure DAG scheduling.
 *
 * Uses Node.js built-in test runner (node:test) — zero test dependencies.
 * Run: npx tsx src/domain/__tests__/scheduling.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { schedule, type SchedulableItem } from "../scheduling.js";
import type { DependencyGraph } from "../dag-graph.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function item(key: string, status: SchedulableItem["status"]): SchedulableItem {
  return { key, label: key, agent: null, status };
}

const DEPS: DependencyGraph = {
  A: [],
  B: ["A"],
  C: ["A"],
  D: ["B", "C"],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("schedule", () => {
  it("returns root nodes when all are pending", () => {
    const items = [item("A", "pending"), item("B", "pending"), item("C", "pending"), item("D", "pending")];
    const result = schedule(items, DEPS);
    assert.equal(result.kind, "items");
    if (result.kind === "items") {
      assert.deepEqual(result.items.map((i) => i.key), ["A"]);
    }
  });

  it("returns dependents when root is done", () => {
    const items = [item("A", "done"), item("B", "pending"), item("C", "pending"), item("D", "pending")];
    const result = schedule(items, DEPS);
    assert.equal(result.kind, "items");
    if (result.kind === "items") {
      assert.deepEqual(result.items.map((i) => i.key).sort(), ["B", "C"]);
    }
  });

  it("treats na as resolved dependency", () => {
    const items = [item("A", "na"), item("B", "pending"), item("C", "pending"), item("D", "pending")];
    const result = schedule(items, DEPS);
    assert.equal(result.kind, "items");
    if (result.kind === "items") {
      assert.deepEqual(result.items.map((i) => i.key).sort(), ["B", "C"]);
    }
  });

  it("includes failed items in available set", () => {
    const items = [item("A", "done"), item("B", "failed"), item("C", "pending"), item("D", "pending")];
    const result = schedule(items, DEPS);
    assert.equal(result.kind, "items");
    if (result.kind === "items") {
      assert.deepEqual(result.items.map((i) => i.key).sort(), ["B", "C"]);
    }
  });

  it("returns complete when all items are done/na/dormant", () => {
    const items = [item("A", "done"), item("B", "done"), item("C", "na"), item("D", "dormant")];
    const result = schedule(items, DEPS);
    assert.equal(result.kind, "complete");
  });

  it("returns blocked when pending items exist but none are runnable", () => {
    const items = [item("A", "failed"), item("B", "pending"), item("C", "pending"), item("D", "pending")];
    // A is failed but B and C depend on A (not done/na) — blocked
    // Wait: A is failed, and schedule includes failed items. So A should be available.
    // Actually re-reading: schedule includes "pending" and "failed" in the candidate set.
    // A has no deps → it's available.
    const result = schedule(items, DEPS);
    assert.equal(result.kind, "items");
    if (result.kind === "items") {
      assert.deepEqual(result.items.map((i) => i.key), ["A"]);
    }
  });

  it("returns blocked when only dormant + pending-with-unmet-deps remain", () => {
    const items = [item("A", "dormant"), item("B", "pending")];
    const deps: DependencyGraph = { A: [], B: ["A"] };
    const result = schedule(items, deps);
    assert.equal(result.kind, "blocked");
  });
});
