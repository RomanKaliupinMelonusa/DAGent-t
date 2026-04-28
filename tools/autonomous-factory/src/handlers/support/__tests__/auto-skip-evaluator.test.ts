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

function makeState(opts?: {
  staged?: { trigger?: "initial" | "triage-reroute" | "retry" | "redevelopment-cycle"; sealed?: boolean };
}): PipelineState {
  const inv = "inv_01H000000000000000000000";
  const hasStaged = !!opts?.staged;
  const stagedRecord = opts?.staged
    ? {
      invocationId: inv,
      nodeKey: "debug-node",
      cycleIndex: 1,
      trigger: (opts.staged.trigger ?? "triage-reroute") as
        | "initial" | "triage-reroute" | "retry" | "redevelopment-cycle",
      inputs: [],
      outputs: [],
      ...(opts.staged.sealed ? { sealed: true } : {}),
    }
    : undefined;
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
        ...(hasStaged ? { latestInvocationId: inv } : {}),
      },
    ],
    errorLog: [],
    dependencies: { "debug-node": [] },
    nodeTypes: { "debug-node": "agent" },
    nodeCategories: { "debug-node": "dev" },
    jsonGated: {},
    naByType: [],
    salvageSurvivors: [],
    ...(stagedRecord ? { artifacts: { [inv]: stagedRecord } } : {}),
  } as PipelineState;
}

// ---------------------------------------------------------------------------
// auto_skip_unless_triage_reroute
// ---------------------------------------------------------------------------

describe("evaluateAutoSkip — auto_skip_unless_triage_reroute", () => {
  it("skips when there is no staged invocation record", () => {
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
    assert.ok(decision.skip, "should skip when no staged record");
    assert.ok(decision.skip!.reason.includes("auto_skip_unless_triage_reroute"));
  });

  it("skips when the staged record's trigger is not triage-reroute", () => {
    const decision = evaluateAutoSkip(
      "debug-node",
      makeApmContext(),
      "/workspaces/DAGent-t",
      "main",
      "/workspaces/DAGent-t/apps/sample-app",
      {},
      "test",
      makeState({ staged: { trigger: "initial" } }),
    );
    assert.ok(decision.skip, "should skip when trigger != triage-reroute");
  });

  it("skips when the staged record is already sealed", () => {
    const decision = evaluateAutoSkip(
      "debug-node",
      makeApmContext(),
      "/workspaces/DAGent-t",
      "main",
      "/workspaces/DAGent-t/apps/sample-app",
      {},
      "test",
      makeState({ staged: { trigger: "triage-reroute", sealed: true } }),
    );
    assert.ok(decision.skip, "should skip when staged record is sealed");
  });

  it("does NOT skip when an unsealed triage-reroute record is staged", () => {
    // Triage stages an unsealed `InvocationRecord` with trigger
    // "triage-reroute" and points `item.latestInvocationId` at it. The
    // re-entrance prose lives in the `triage-handoff` JSON artifact,
    // not on the record itself (Phase 6).
    const decision = evaluateAutoSkip(
      "debug-node",
      makeApmContext(),
      "/workspaces/DAGent-t",
      "main",
      "/workspaces/DAGent-t/apps/sample-app",
      {},
      "test",
      makeState({ staged: { trigger: "triage-reroute" } }),
    );
    assert.equal(decision.skip, null, "should NOT skip when staged reroute is unsealed");
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
