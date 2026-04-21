/**
 * auto-skip-evaluator.test.ts — Unit tests for the triage-reroute gate
 * in evaluateAutoSkip.
 *
 * Exercises the `auto_skip_unless_triage_reroute` path in isolation.
 * Does not need git operations — the triage gate fires before any
 * git-based checks.
 *
 * Uses Node.js built-in test runner (node:test).
 * Run: npx tsx src/handlers/support/__tests__/auto-skip-evaluator.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluateAutoSkip } from "../auto-skip-evaluator.js";
import type { ApmCompiledOutput } from "../../../apm/types.js";
import type { PipelineState } from "../../../types.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeApmContext(nodeOverrides?: Record<string, unknown>): ApmCompiledOutput {
  return {
    config: {
      directories: { storefront: ".", e2e: "e2e" },
    },
    workflows: {
      test: {
        nodes: {
          "debug-node": {
            type: "agent",
            category: "dev",
            agent: "@debug",
            auto_skip_unless_triage_reroute: true,
            ...nodeOverrides,
          },
        },
      },
    },
  } as unknown as ApmCompiledOutput;
}

function makeState(itemOverrides?: Partial<PipelineState["items"][number]>[]): PipelineState {
  return {
    feature: "test",
    workflowName: "test",
    started: "2025-01-01T00:00:00Z",
    deployedUrl: null,
    implementationNotes: null,
    items: [
      {
        key: "debug-node",
        label: "Debug Node",
        agent: "@debug",
        status: "pending",
        error: null,
        ...(itemOverrides?.[0] ?? {}),
      },
    ],
    errorLog: [],
    dependencies: { "debug-node": [] },
    nodeTypes: { "debug-node": "agent" },
    nodeCategories: { "debug-node": "dev" },
    jsonGated: {},
    naByType: [],
    salvageSurvivors: [],
  } as PipelineState;
}

// ---------------------------------------------------------------------------
// auto_skip_unless_triage_reroute
// ---------------------------------------------------------------------------

describe("evaluateAutoSkip — auto_skip_unless_triage_reroute", () => {
  it("skips when pendingContext is absent", () => {
    const decision = evaluateAutoSkip(
      "debug-node",
      makeApmContext(),
      "/workspaces/DAGent-t",
      "main",
      "/workspaces/DAGent-t/apps/sample-app",
      {},
      "test",
      makeState(),
    );
    assert.ok(decision.skip, "should skip when no pendingContext");
    assert.ok(decision.skip!.reason.includes("auto_skip_unless_triage_reroute"));
  });

  it("skips when pendingContext is empty string", () => {
    const decision = evaluateAutoSkip(
      "debug-node",
      makeApmContext(),
      "/workspaces/DAGent-t",
      "main",
      "/workspaces/DAGent-t/apps/sample-app",
      {},
      "test",
      makeState([{ pendingContext: "" }]),
    );
    assert.ok(decision.skip, "should skip when pendingContext is empty");
  });

  it("skips when pendingContext is whitespace-only", () => {
    const decision = evaluateAutoSkip(
      "debug-node",
      makeApmContext(),
      "/workspaces/DAGent-t",
      "main",
      "/workspaces/DAGent-t/apps/sample-app",
      {},
      "test",
      makeState([{ pendingContext: "   \n  " }]),
    );
    assert.ok(decision.skip, "should skip when pendingContext is whitespace");
  });

  it("does NOT skip when pendingContext has triage handoff content", () => {
    const decision = evaluateAutoSkip(
      "debug-node",
      makeApmContext(),
      "/workspaces/DAGent-t",
      "main",
      "/workspaces/DAGent-t/apps/sample-app",
      {},
      "test",
      makeState([{ pendingContext: "## Redevelopment Context\nTriage handoff for frontend defect." }]),
    );
    assert.equal(decision.skip, null, "should NOT skip when pendingContext has content");
  });

  it("does NOT skip when pendingContext is a non-empty string (kernel in-memory)", () => {
    // This simulates the fix: kernel mirrors pendingContext into dagState
    // as a plain string, which the auto-skip evaluator reads.
    const decision = evaluateAutoSkip(
      "debug-node",
      makeApmContext(),
      "/workspaces/DAGent-t",
      "main",
      "/workspaces/DAGent-t/apps/sample-app",
      {},
      "test",
      makeState([{ pendingContext: "Redevelopment context for B" }]),
    );
    assert.equal(decision.skip, null, "should NOT skip when pendingContext is populated");
  });

  it("does not apply triage gate when flag is false", () => {
    const apm = makeApmContext({ auto_skip_unless_triage_reroute: false });
    const decision = evaluateAutoSkip(
      "debug-node",
      apm,
      "/workspaces/DAGent-t",
      "main",
      "/workspaces/DAGent-t/apps/sample-app",
      {},
      "test",
      makeState(),
    );
    // Should not skip via the triage gate (may skip via other rules, but
    // the reason should NOT mention auto_skip_unless_triage_reroute)
    if (decision.skip) {
      assert.ok(
        !decision.skip.reason.includes("auto_skip_unless_triage_reroute"),
        "should not skip via triage gate when flag is false",
      );
    }
  });
});
