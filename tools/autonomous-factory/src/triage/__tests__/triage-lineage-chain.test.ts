/**
 * triage-lineage-chain.test.ts — Phase 5 follow-up: verify that a triage
 * reroute produces a downstream InvocationRecord with `parentInvocationId`
 * pointing back at the triage's own invocation. Pure unit tests against
 * the builder, kernel reducer, and dispatch hook.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildTriageHandoff } from "../handoff-builder.js";
import type { PipelineState, TriageRecord, TriageResult } from "../../types.js";

describe("Phase 5 follow-up — triage lineage chain", () => {
  it("buildTriageHandoff stamps triageInvocationId when provided", () => {
    const handoff = buildTriageHandoff({
      failingNodeKey: "e2e-runner",
      rawError: "it failed",
      triageRecord: { error_signature: "sig" } as Pick<TriageRecord, "error_signature">,
      triageResult: { domain: "frontend", reason: "ui" } as Pick<TriageResult, "domain" | "reason">,
      priorAttemptCount: 1,
      pipelineSummaries: [],
      errorLog: [],
      structuredFailure: null,
      triageInvocationId: "inv_triage_abc",
    });
    assert.equal(handoff.triageInvocationId, "inv_triage_abc");
  });

  it("buildTriageHandoff omits triageInvocationId when absent", () => {
    const handoff = buildTriageHandoff({
      failingNodeKey: "e2e-runner",
      rawError: "it failed",
      triageRecord: { error_signature: "sig" } as Pick<TriageRecord, "error_signature">,
      triageResult: { domain: "frontend", reason: "ui" } as Pick<TriageResult, "domain" | "reason">,
      priorAttemptCount: 1,
      pipelineSummaries: [],
      errorLog: [],
      structuredFailure: null,
    });
    assert.equal(handoff.triageInvocationId, undefined);
  });

  it("dispatch stamps a staged InvocationRecord rather than re-appending; the staged record's parentInvocationId persists", async () => {
    // This test validates the staged-record adoption path: when triage has
    // pre-allocated an unsealed `InvocationRecord` (carrying trigger +
    // parentInvocationId), the dispatch hook MUST stamp `startedAt` via
    // `stampInvocationStart` instead of calling `appendInvocationRecord`
    // (which would throw "already exists").
    const { recordInvocationDispatch } = await import("../../loop/dispatch/invocation-ledger-hooks.js");
    const appended: unknown[] = [];
    const stamped: Array<{ invocationId: string; startedAt: string }> = [];
    const stateStore = {
      appendInvocationRecord: async (_slug: string, input: unknown) => {
        appended.push(input);
      },
      stampInvocationStart: async (_slug: string, invocationId: string, startedAt: string) => {
        stamped.push({ invocationId, startedAt });
      },
    } as unknown as import("../../ports/state-store.js").StateStore;

    const stagedRecord = {
      invocationId: "inv_dev_1",
      nodeKey: "frontend-dev",
      cycleIndex: 1,
      trigger: "triage-reroute" as const,
      parentInvocationId: "inv_triage_xyz",
      inputs: [],
      outputs: [],
      // No startedAt — staged record.
    };

    const pipelineState = {
      items: [
        {
          key: "frontend-dev",
          label: "Frontend Dev",
          agent: "frontend-dev",
          status: "pending",
          error: null,
          latestInvocationId: stagedRecord.invocationId,
        },
      ],
      artifacts: { [stagedRecord.invocationId]: stagedRecord },
    } as unknown as PipelineState;

    const ctx = {
      itemKey: "frontend-dev",
      executionId: stagedRecord.invocationId,
      attempt: 2,
      previousAttempt: undefined,
      pipelineState,
      currentInvocation: stagedRecord,
    } as unknown as import("../../handlers/types.js").NodeContext;

    const logger = { event: () => "" } as unknown as import("../../telemetry/index.js").PipelineLogger;
    const handler = {} as unknown as import("../../handlers/types.js").NodeHandler;

    await recordInvocationDispatch(stateStore, "demo", [[handler, ctx]], logger);
    assert.equal(appended.length, 0, "should NOT append a fresh record when adopting a staged one");
    assert.equal(stamped.length, 1, "should stamp the staged record's startedAt");
    assert.equal(stamped[0]!.invocationId, "inv_dev_1");
    // The staged record's parentInvocationId is untouched by stamping —
    // lineage queries continue to resolve it from state.artifacts.
    assert.equal(stagedRecord.parentInvocationId, "inv_triage_xyz");
  });

  it("appends a fresh record (no parentInvocationId) when no staged invocation is adopted", async () => {
    const { recordInvocationDispatch } = await import("../../loop/dispatch/invocation-ledger-hooks.js");
    const appended: Array<{ input: { parentInvocationId?: string } }> = [];
    const stateStore = {
      appendInvocationRecord: async (_slug: string, input: { parentInvocationId?: string }) => {
        appended.push({ input });
      },
    } as unknown as import("../../ports/state-store.js").StateStore;

    const pipelineState = {
      items: [
        {
          key: "frontend-dev",
          status: "pending",
          error: null,
        },
      ],
    } as unknown as PipelineState;

    const ctx = {
      itemKey: "frontend-dev",
      executionId: "inv_dev_2",
      attempt: 1,
      pipelineState,
      // No currentInvocation — first dispatch.
    } as unknown as import("../../handlers/types.js").NodeContext;

    const logger = { event: () => "" } as unknown as import("../../telemetry/index.js").PipelineLogger;
    const handler = {} as unknown as import("../../handlers/types.js").NodeHandler;

    await recordInvocationDispatch(stateStore, "demo", [[handler, ctx]], logger);
    assert.equal(appended.length, 1);
    assert.equal(appended[0]!.input.parentInvocationId, undefined);
  });
});
