/**
 * domain/dag-graph.test.ts — Unit tests for pure DAG graph utilities.
 *
 * Uses Node.js built-in test runner (node:test) — zero test dependencies.
 * Run: npx tsx src/domain/__tests__/dag-graph.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getDownstream,
  getUpstream,
  cascadeBarriers,
  topologicalSort,
  type DependencyGraph,
} from "../dag-graph.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * Diamond DAG:
 *   A → B → D
 *   A → C → D
 */
const DIAMOND: DependencyGraph = {
  A: [],
  B: ["A"],
  C: ["A"],
  D: ["B", "C"],
};

/**
 * Linear chain: A → B → C → D
 */
const LINEAR: DependencyGraph = {
  A: [],
  B: ["A"],
  C: ["B"],
  D: ["C"],
};

/**
 * DAG with a barrier node:
 *   dev → build → barrier → deploy
 */
const WITH_BARRIER: DependencyGraph = {
  dev: [],
  build: ["dev"],
  barrier: ["build"],
  deploy: ["barrier"],
};

const BARRIER_TYPES: Record<string, string> = {
  dev: "agent",
  build: "script",
  barrier: "barrier",
  deploy: "script",
};

// ---------------------------------------------------------------------------
// getDownstream
// ---------------------------------------------------------------------------

describe("getDownstream", () => {
  it("returns seed + all downstream in diamond DAG", () => {
    const result = getDownstream(DIAMOND, ["A"]);
    assert.deepEqual(result.sort(), ["A", "B", "C", "D"]);
  });

  it("returns only leaf when seed is leaf", () => {
    const result = getDownstream(DIAMOND, ["D"]);
    assert.deepEqual(result, ["D"]);
  });

  it("returns subset for mid-graph seed", () => {
    const result = getDownstream(DIAMOND, ["B"]);
    assert.deepEqual(result.sort(), ["B", "D"]);
  });

  it("handles multiple seeds", () => {
    const result = getDownstream(DIAMOND, ["B", "C"]);
    assert.deepEqual(result.sort(), ["B", "C", "D"]);
  });

  it("returns seed for unknown key (no crash)", () => {
    const result = getDownstream(DIAMOND, ["Z"]);
    assert.deepEqual(result, ["Z"]);
  });
});

// ---------------------------------------------------------------------------
// getUpstream
// ---------------------------------------------------------------------------

describe("getUpstream", () => {
  it("returns seed + all upstream in diamond DAG", () => {
    const result = getUpstream(DIAMOND, ["D"]);
    assert.deepEqual(result.sort(), ["A", "B", "C", "D"]);
  });

  it("returns only root when seed is root", () => {
    const result = getUpstream(DIAMOND, ["A"]);
    assert.deepEqual(result, ["A"]);
  });

  it("handles linear chain", () => {
    const result = getUpstream(LINEAR, ["D"]);
    assert.deepEqual(result.sort(), ["A", "B", "C", "D"]);
  });
});

// ---------------------------------------------------------------------------
// cascadeBarriers
// ---------------------------------------------------------------------------

describe("cascadeBarriers", () => {
  it("cascades barrier when its dependency is in the reset set", () => {
    const keysToReset = new Set(["build"]);
    cascadeBarriers(WITH_BARRIER, BARRIER_TYPES, keysToReset);
    assert.ok(keysToReset.has("barrier"), "barrier should be cascaded");
  });

  it("does not cascade barrier when no dependency in reset set", () => {
    const keysToReset = new Set(["deploy"]);
    cascadeBarriers(WITH_BARRIER, BARRIER_TYPES, keysToReset);
    assert.ok(!keysToReset.has("barrier"), "barrier should NOT be cascaded");
  });

  it("cascades recursively through multiple barriers", () => {
    const deps: DependencyGraph = {
      dev: [],
      b1: ["dev"],
      b2: ["b1"],
      deploy: ["b2"],
    };
    const types: Record<string, string> = {
      dev: "agent",
      b1: "barrier",
      b2: "barrier",
      deploy: "script",
    };
    const keysToReset = new Set(["dev"]);
    cascadeBarriers(deps, types, keysToReset);
    assert.ok(keysToReset.has("b1"));
    assert.ok(keysToReset.has("b2"));
  });
});

// ---------------------------------------------------------------------------
// topologicalSort
// ---------------------------------------------------------------------------

describe("topologicalSort", () => {
  it("returns nodes in dependency-first order for diamond", () => {
    const order = topologicalSort(DIAMOND);
    assert.equal(order.length, 4);
    assert.ok(order.indexOf("A") < order.indexOf("B"));
    assert.ok(order.indexOf("A") < order.indexOf("C"));
    assert.ok(order.indexOf("B") < order.indexOf("D"));
    assert.ok(order.indexOf("C") < order.indexOf("D"));
  });

  it("returns linear order for linear chain", () => {
    const order = topologicalSort(LINEAR);
    assert.deepEqual(order, ["A", "B", "C", "D"]);
  });

  it("detects cycles", () => {
    const cyclic: DependencyGraph = { A: ["B"], B: ["A"] };
    assert.throws(() => topologicalSort(cyclic), /Cycle detected/);
  });

  it("handles empty graph", () => {
    const order = topologicalSort({});
    assert.deepEqual(order, []);
  });
});
