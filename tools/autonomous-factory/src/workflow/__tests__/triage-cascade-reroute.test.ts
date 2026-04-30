/**
 * triage-cascade-reroute.test.ts — Session 5 P1 close-out.
 *
 * Proves the workflow-body triage cascade actually reroutes the failed
 * node (resets it to `pending`, re-queues it via `getReady()`) and
 * increments the per-`logKey` cycle counter. The unit tests in
 * `cycle-budget.test.ts` cover the halt-reason shape; the resolver
 * tests in `triage-cascade.test.ts` cover route extraction. This file
 * stitches the two together — the same composition the workflow body
 * performs inside `runTriageCascade`:
 *
 *   1. Activity result arrives with `outcome: "failed"`.
 *   2. `dag.applyFail(...)` records the failure (workflow body, line ~825).
 *   3. `resolveTriageDispatch(...)` extracts the triage target + routes.
 *   4. The triage activity (here: stubbed) returns commands.
 *   5. `applyTriageCommand(...)` applies each — `reset-nodes` re-queues
 *      the failing node and bumps the `redo-<key>` cycle counter.
 *   6. The next iteration's `dag.getReady()` returns the previously-failed
 *      node so the dev can re-run.
 *
 * Closes Session 5 Phase 0 P1 ("Triage cascade no longer stubbed in
 * `pipeline.workflow.ts`").
 */

import { describe, it, expect } from "vitest";
import { DagState } from "../dag-state.js";
import { applyTriageCommand } from "../pipeline.workflow.js";
import { resolveTriageDispatch } from "../triage-cascade.js";
import type { CompiledNode } from "../domain/init-state.js";
import type { RoutableWorkflow } from "../../domain/failure-routing.js";
import type { NodeActivityResult } from "../../activities/types.js";
import type { DagCommand } from "../../dag-commands.js";

const NOW = "2026-04-30T00:00:00.000Z";

// Two-node DAG: `dev` is decorated with `on_failure.triage = triage-default`
// and a $SELF code-defect route — i.e. on failure, triage emits a
// reset-nodes command that re-queues `dev` itself. `triage-default` is the
// triage node the cascade dispatches; in the workflow body it lives in
// the same node map but is never directly enqueued by `getReady()` until
// the cascade fires.
const NODES: Record<string, CompiledNode> = {
  dev: {
    agent: "dev",
    type: "agent",
    category: "dev",
    depends_on: [],
    on_failure: {
      triage: "triage-default",
      routes: { "code-defect": "$SELF" },
    },
  },
  "triage-default": {
    agent: "triage",
    type: "triage",
    category: "triage",
    depends_on: [],
  },
};

const ROUTABLE: RoutableWorkflow = {
  default_triage: "triage-default",
  default_routes: {},
  nodes: {
    dev: {
      type: "agent",
      on_failure: {
        triage: "triage-default",
        routes: { "code-defect": "$SELF" },
      },
    },
    "triage-default": { type: "triage" },
  },
};

function freshDag(): DagState {
  return DagState.fromInit({
    feature: "f",
    workflowName: "w",
    started: NOW,
    nodes: NODES,
  });
}

function failedActivityResult(): NodeActivityResult {
  return {
    outcome: "failed",
    errorMessage: "TypeError: Cannot read property 'foo' of undefined",
    errorSignature: "deadbeef",
    summary: { ok: false, durationMs: 12 } as NodeActivityResult["summary"],
  };
}

/**
 * Stub triage handler — emits a reset-nodes command targeting the
 * failing node with a `redo-<key>` log key (mirrors the legacy
 * triage handler's code-defect→$SELF reroute).
 */
function stubTriageCommands(failingKey: string, maxCycles = 5): readonly DagCommand[] {
  return [
    {
      type: "reset-nodes",
      seedKey: failingKey,
      reason: "code-defect: re-run dev",
      logKey: `redo-${failingKey}`,
      maxCycles,
    },
  ];
}

describe("Workflow triage cascade — failed node reroute", () => {
  it("re-queues the failed node and increments the cycle counter on first failure", () => {
    const dag = freshDag();

    // ── Sanity: dev is the only ready item to start.
    {
      const ready = dag.getReady();
      expect(ready.kind).toBe("items");
      if (ready.kind !== "items") throw new Error("unreachable");
      expect(ready.items.map((i) => i.key)).toEqual(["dev"]);
    }

    // ── Step 1: activity returns failed → mark fail.
    const failedResult = failedActivityResult();
    dag.applyFail("dev", failedResult.errorMessage!, NOW);

    // After applyFail, dev is in `failed` and not ready.
    {
      const snap = dag.snapshot();
      expect(snap.state.items.find((i) => i.key === "dev")?.status).toBe("failed");
    }

    // ── Step 2: cascade resolver picks the right triage target.
    const dispatch = resolveTriageDispatch({
      failingKey: "dev",
      result: failedResult,
      workflow: ROUTABLE,
    });
    expect(dispatch).not.toBeNull();
    expect(dispatch!.triageNodeKey).toBe("triage-default");
    expect(dispatch!.failureRoutes).toEqual({ "code-defect": "$SELF" });

    // ── Step 3: stubbed triage activity emits reset-nodes commands.
    const commands = stubTriageCommands("dev", 5);

    // ── Step 4: workflow body applies each command serially.
    const cycleCountBefore = dag.snapshot().cycleCounters["redo-dev"] ?? 0;
    let halt: string | null = null;
    for (const cmd of commands) {
      halt = applyTriageCommand(cmd, dag, NOW);
      if (halt) break;
    }
    expect(halt).toBeNull();

    // ── Assertion: failed node is re-queued (back to pending + ready).
    {
      const snap = dag.snapshot();
      expect(snap.state.items.find((i) => i.key === "dev")?.status).toBe("pending");
      const ready = dag.getReady();
      expect(ready.kind).toBe("items");
      if (ready.kind !== "items") throw new Error("unreachable");
      expect(ready.items.map((i) => i.key)).toContain("dev");
    }

    // ── Assertion: cycle counter incremented for the redo logKey.
    {
      const after = dag.snapshot().cycleCounters["redo-dev"] ?? 0;
      expect(after).toBeGreaterThan(cycleCountBefore);
      expect(after).toBe(1);
    }
  });

  it("repeated failures bump the cycle counter monotonically until the budget halts the run", () => {
    const dag = freshDag();
    const failedResult = failedActivityResult();
    const maxCycles = 3;

    let lastHalt: string | null = null;
    const observedCycles: number[] = [];

    // Emulate maxCycles + 1 batches: each batch fails dev → triage
    // emits reset-nodes → cascade applies it. The (maxCycles+1)-th
    // application must halt with a non-empty reason.
    for (let i = 0; i < maxCycles + 1; i++) {
      dag.applyFail("dev", failedResult.errorMessage!, NOW);
      const dispatch = resolveTriageDispatch({
        failingKey: "dev",
        result: failedResult,
        workflow: ROUTABLE,
      });
      expect(dispatch).not.toBeNull();

      const cmd: DagCommand = {
        type: "reset-nodes",
        seedKey: "dev",
        reason: `redo-${i}`,
        logKey: "redo-dev",
        maxCycles,
      };
      lastHalt = applyTriageCommand(cmd, dag, NOW);
      observedCycles.push(dag.snapshot().cycleCounters["redo-dev"] ?? 0);
      if (lastHalt) break;
    }

    // Cycle counter sequence is monotonic non-decreasing.
    for (let i = 1; i < observedCycles.length; i++) {
      expect(observedCycles[i]).toBeGreaterThanOrEqual(observedCycles[i - 1]!);
    }

    // The final iteration tripped the cycle-budget halt.
    expect(lastHalt).not.toBeNull();
    expect(lastHalt).toMatch(/^triage-halt:/);
    expect(lastHalt).toContain("logKey=redo-dev");
  });

  it("does not reroute when the failing node has no triage configuration", () => {
    // Same DagState shape but with a node lacking on_failure.
    const nodes: Record<string, CompiledNode> = {
      orphan: {
        agent: "dev",
        type: "agent",
        category: "dev",
        depends_on: [],
      },
    };
    const dag = DagState.fromInit({
      feature: "f",
      workflowName: "w",
      started: NOW,
      nodes,
    });
    const wf: RoutableWorkflow = { nodes: { orphan: {} } };

    dag.applyFail("orphan", "boom", NOW);
    const dispatch = resolveTriageDispatch({
      failingKey: "orphan",
      result: failedActivityResult(),
      workflow: wf,
    });
    expect(dispatch).toBeNull();

    // Workflow body would skip this entry — failed node stays failed.
    const status = dag.snapshot().state.items.find((i) => i.key === "orphan")?.status;
    expect(status).toBe("failed");
  });
});
