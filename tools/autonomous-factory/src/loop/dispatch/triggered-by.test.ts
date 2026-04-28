/**
 * triggered-by.test.ts — Unit coverage for the `computeTriggeredBy` /
 * `triggeredByFromStaged` lineage helpers (Phase C of the lineage rollout).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeTriggeredBy, triggeredByFromStaged } from "./triggered-by.js";
import type { InvocationRecord, PipelineState } from "../../types.js";

function rec(partial: Partial<InvocationRecord> & Pick<InvocationRecord, "invocationId" | "nodeKey">): InvocationRecord {
  return {
    invocationId: partial.invocationId,
    nodeKey: partial.nodeKey,
    cycleIndex: partial.cycleIndex ?? 1,
    trigger: partial.trigger ?? "initial",
    inputs: partial.inputs ?? [],
    outputs: partial.outputs ?? [],
    sealed: partial.sealed ?? false,
    ...(partial.outcome !== undefined ? { outcome: partial.outcome } : {}),
    ...(partial.startedAt !== undefined ? { startedAt: partial.startedAt } : {}),
    ...(partial.finishedAt !== undefined ? { finishedAt: partial.finishedAt } : {}),
    ...(partial.parentInvocationId !== undefined ? { parentInvocationId: partial.parentInvocationId } : {}),
  };
}

function buildState(records: InvocationRecord[]): PipelineState {
  const artifacts: Record<string, InvocationRecord> = {};
  for (const r of records) artifacts[r.invocationId] = r;
  return { artifacts } as PipelineState;
}

describe("computeTriggeredBy — initial trigger", () => {
  it("picks the latest completed invocation among depends_on nodes", () => {
    const state = buildState([
      rec({ invocationId: "inv_01_old", nodeKey: "spec", sealed: true, outcome: "completed" }),
      rec({ invocationId: "inv_02_new", nodeKey: "spec", sealed: true, outcome: "completed" }),
      rec({ invocationId: "inv_03_other", nodeKey: "unrelated", sealed: true, outcome: "completed" }),
    ]);
    const out = computeTriggeredBy({ itemKey: "dev-backend", trigger: "initial", dependsOn: ["spec"] }, state);
    assert.deepEqual(out, { nodeKey: "spec", invocationId: "inv_02_new", reason: "initial" });
  });

  it("returns undefined when depends_on is empty (root node)", () => {
    const state = buildState([]);
    const out = computeTriggeredBy({ itemKey: "spec", trigger: "initial", dependsOn: [] }, state);
    assert.equal(out, undefined);
  });

  it("returns undefined when no upstream is sealed yet", () => {
    const state = buildState([
      rec({ invocationId: "inv_01", nodeKey: "spec", sealed: false }),
    ]);
    const out = computeTriggeredBy({ itemKey: "dev", trigger: "initial", dependsOn: ["spec"] }, state);
    assert.equal(out, undefined);
  });
});

describe("computeTriggeredBy — retry trigger", () => {
  it("points at the latest sealed non-completed invocation of THIS node", () => {
    const state = buildState([
      rec({ invocationId: "inv_01", nodeKey: "dev-backend", sealed: true, outcome: "failed" }),
      rec({ invocationId: "inv_02", nodeKey: "dev-backend", sealed: true, outcome: "failed" }),
      rec({ invocationId: "inv_03", nodeKey: "other", sealed: true, outcome: "failed" }),
    ]);
    const out = computeTriggeredBy({ itemKey: "dev-backend", trigger: "retry" }, state);
    assert.deepEqual(out, { nodeKey: "dev-backend", invocationId: "inv_02", reason: "retry" });
  });
});

describe("computeTriggeredBy — redevelopment-cycle trigger", () => {
  it("points at the latest sealed non-completed invocation across the workflow", () => {
    const state = buildState([
      rec({ invocationId: "inv_01", nodeKey: "dev-frontend", sealed: true, outcome: "completed" }),
      rec({ invocationId: "inv_02", nodeKey: "live-ui", sealed: true, outcome: "failed" }),
    ]);
    const out = computeTriggeredBy({ itemKey: "dev-frontend", trigger: "redevelopment-cycle" }, state);
    assert.deepEqual(out, { nodeKey: "live-ui", invocationId: "inv_02", reason: "redevelopment-cycle" });
  });
});

describe("triggeredByFromStaged", () => {
  it("derives parent nodeKey from the ledger and stamps reason: triage-reroute", () => {
    const state = buildState([
      rec({ invocationId: "inv_parent", nodeKey: "dev-backend", sealed: true, outcome: "failed" }),
    ]);
    const out = triggeredByFromStaged(state, "inv_parent");
    assert.deepEqual(out, { nodeKey: "dev-backend", invocationId: "inv_parent", reason: "triage-reroute" });
  });

  it("returns undefined when the parent id is missing or unknown", () => {
    const state = buildState([]);
    assert.equal(triggeredByFromStaged(state, undefined), undefined);
    assert.equal(triggeredByFromStaged(state, "missing"), undefined);
  });
});
