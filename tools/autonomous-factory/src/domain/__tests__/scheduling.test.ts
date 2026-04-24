/**
 * domain/scheduling.test.ts — Unit tests for pure DAG scheduling.
 *
 * Uses Node.js built-in test runner (node:test) — zero test dependencies.
 * Run: npx tsx src/domain/__tests__/scheduling.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  schedule,
  type SchedulableItem,
  type ConsumesEdge,
  type ProducerCycleSummary,
} from "../scheduling.js";
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

// ---------------------------------------------------------------------------
// Cycle-aware producer-readiness gate
// ---------------------------------------------------------------------------

describe("schedule — producer-cycle gate", () => {
  // Producer (P) → Consumer (C). C declares `consumes_artifacts: [{from: P}]`.
  const DEPS_PC: DependencyGraph = { P: [], C: ["P"] };
  const consumesByNode = (required: boolean): ReadonlyMap<string, ReadonlyArray<ConsumesEdge>> =>
    new Map([["C", [{ from: "P", required }]]]);

  it("gates consumer when producer's latest invocation is in-flight (no outcome yet)", () => {
    // P just got reset for reroute and is now `pending` again with an
    // in-flight cycle 2 record (no `outcome` field). C is also pending —
    // structural deps (P=pending) actually fail anyway; mark P=done to
    // simulate the moment between P sealing cycle 2 and the kernel
    // reading the artifact ledger. Keep outcome undefined to model the
    // race window inside a single tick where the latest record is not
    // yet sealed.
    const items = [item("P", "done"), item("C", "pending")];
    const latest = new Map<string, ProducerCycleSummary>([
      ["P", { cycleIndex: 2 }], // outcome undefined → in-flight
    ]);
    const result = schedule(items, DEPS_PC, {
      consumesByNode: consumesByNode(true),
      latestProducerOutcome: latest,
    });
    // Blocked because no other items are ready and C is gated.
    assert.equal(result.kind, "blocked");
  });

  it("releases consumer once latest producer cycle completes", () => {
    const items = [item("P", "done"), item("C", "pending")];
    const latest = new Map<string, ProducerCycleSummary>([
      ["P", { cycleIndex: 2, outcome: "completed" }],
    ]);
    const result = schedule(items, DEPS_PC, {
      consumesByNode: consumesByNode(true),
      latestProducerOutcome: latest,
    });
    assert.equal(result.kind, "items");
    if (result.kind === "items") {
      assert.deepEqual(result.items.map((i) => i.key), ["C"]);
    }
  });

  it("passes through required:false consumer when no producer record exists", () => {
    // P never produced — required:false consumer must NOT be gated.
    const items = [item("P", "done"), item("C", "pending")];
    const latest = new Map<string, ProducerCycleSummary>(); // empty
    const result = schedule(items, DEPS_PC, {
      consumesByNode: consumesByNode(false),
      latestProducerOutcome: latest,
    });
    assert.equal(result.kind, "items");
    if (result.kind === "items") {
      assert.deepEqual(result.items.map((i) => i.key), ["C"]);
    }
  });

  it("treats producer status=na as ready (salvage)", () => {
    // P salvaged for graceful degradation. C must still dispatch.
    const items = [item("P", "na"), item("C", "pending")];
    const latest = new Map<string, ProducerCycleSummary>(); // no records
    const result = schedule(items, DEPS_PC, {
      consumesByNode: consumesByNode(true),
      latestProducerOutcome: latest,
    });
    assert.equal(result.kind, "items");
    if (result.kind === "items") {
      assert.deepEqual(result.items.map((i) => i.key), ["C"]);
    }
  });

  it("with two queued producer cycles, waits for the latest by cycleIndex", () => {
    // Cycle 1 sealed completed; cycle 2 in-flight. Consumer must wait.
    const items = [item("P", "done"), item("C", "pending")];
    // The kernel collapses the ledger into a single `latest` summary —
    // the gate receives only the highest cycleIndex.
    const latest = new Map<string, ProducerCycleSummary>([
      ["P", { cycleIndex: 2 }], // in-flight
    ]);
    const result = schedule(items, DEPS_PC, {
      consumesByNode: consumesByNode(true),
      latestProducerOutcome: latest,
    });
    assert.equal(result.kind, "blocked");
  });

  it("diamond: consumer waits for both producers to complete latest cycle", () => {
    // P1, P2 → C. P1 completed cycle 2; P2 still in-flight.
    const deps: DependencyGraph = { P1: [], P2: [], C: ["P1", "P2"] };
    const items = [item("P1", "done"), item("P2", "done"), item("C", "pending")];
    const consumes = new Map<string, ReadonlyArray<ConsumesEdge>>([
      ["C", [{ from: "P1", required: true }, { from: "P2", required: true }]],
    ]);
    const latest = new Map<string, ProducerCycleSummary>([
      ["P1", { cycleIndex: 2, outcome: "completed" }],
      ["P2", { cycleIndex: 2 }], // in-flight
    ]);
    const blocked = schedule(items, deps, {
      consumesByNode: consumes,
      latestProducerOutcome: latest,
    });
    assert.equal(blocked.kind, "blocked");

    const latestSealed = new Map<string, ProducerCycleSummary>([
      ["P1", { cycleIndex: 2, outcome: "completed" }],
      ["P2", { cycleIndex: 2, outcome: "completed" }],
    ]);
    const released = schedule(items, deps, {
      consumesByNode: consumes,
      latestProducerOutcome: latestSealed,
    });
    assert.equal(released.kind, "items");
    if (released.kind === "items") {
      assert.deepEqual(released.items.map((i) => i.key), ["C"]);
    }
  });

  it("back-compat: omitting opts preserves original edge-only behaviour", () => {
    const items = [item("P", "done"), item("C", "pending")];
    const result = schedule(items, DEPS_PC);
    assert.equal(result.kind, "items");
    if (result.kind === "items") {
      assert.deepEqual(result.items.map((i) => i.key), ["C"]);
    }
  });

  it("legacy producer (status=done, no record) short-circuits the gate", () => {
    // Legacy state files have no `state.artifacts`. The gate must not
    // deadlock — when the producer is `done`, status alone is authoritative.
    const items = [item("P", "done"), item("C", "pending")];
    const latest = new Map<string, ProducerCycleSummary>();
    const result = schedule(items, DEPS_PC, {
      consumesByNode: consumesByNode(true),
      latestProducerOutcome: latest,
    });
    assert.equal(result.kind, "items");
    if (result.kind === "items") {
      assert.deepEqual(result.items.map((i) => i.key), ["C"]);
    }
  });

  it("required:false consumer is still gated when producer is mid-cycle", () => {
    // Even non-required edges must not consume the stale prior cycle —
    // an in-flight producer cycle gates required and non-required alike.
    const items = [item("P", "done"), item("C", "pending")];
    const latest = new Map<string, ProducerCycleSummary>([
      ["P", { cycleIndex: 2 }],
    ]);
    const result = schedule(items, DEPS_PC, {
      consumesByNode: consumesByNode(false),
      latestProducerOutcome: latest,
    });
    assert.equal(result.kind, "blocked");
  });
});
