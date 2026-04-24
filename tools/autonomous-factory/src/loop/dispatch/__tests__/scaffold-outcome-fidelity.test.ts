/**
 * scaffold-outcome-fidelity.test.ts — Bug B (Session 3) regression.
 *
 * Verifies that for a successful local-exec / scaffold dispatch:
 *   - `node-report.json` records the actual `handler` (not "unknown")
 *   - `node-report.json` reflects the real `durationMs` (not `0`)
 *   - the seal hook seals with `outcome: "completed"`
 *
 * Before the fix, `recordInvocationSeal` used `ctx.currentInvocation`
 * for `startedAt` (undefined for fresh invocations → finishedAt fallback,
 * `durationMs: 0`) and read handler from `r.result.handlerName` only
 * (never set by local-exec → "unknown").
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PipelineState } from "../../../types.js";
import type { StateStore } from "../../../ports/state-store.js";
import type { PipelineLogger } from "../../../telemetry/index.js";
import type { NodeContext, NodeHandler } from "../../../handlers/types.js";
import type { BatchDispatchResult } from "../batch-dispatcher.js";
import type { FeatureFilesystem } from "../../../ports/feature-filesystem.js";

import { recordInvocationSeal } from "../invocation-ledger-hooks.js";
import { LocalFilesystem } from "../../../adapters/local-filesystem.js";
import { newInvocationId } from "../../../kernel/invocation-id.js";

function makeAppRoot(): string {
  return mkdtempSync(join(tmpdir(), "dagent-scaffold-fidelity-"));
}

describe("scaffold-outcome-fidelity (Bug B)", () => {
  it("records handler from pair[0].name and durationMs from startedAtByItem", async () => {
    const appRoot = makeAppRoot();
    const slug = "demo";
    const nodeKey = "create-branch";
    const invocationId = newInvocationId();

    const seals: Array<{ outcome: string; finishedAt?: string }> = [];
    const stateStore: StateStore = {
      sealInvocation: async (_slug: string, input: unknown) => {
        seals.push(input as { outcome: string; finishedAt?: string });
      },
    } as unknown as StateStore;

    const events: Array<{ kind: string; data: Record<string, unknown> }> = [];
    const logger = {
      event: (kind: string, _itemKey: string | null, data: Record<string, unknown>) => {
        events.push({ kind, data });
        return "";
      },
    } as unknown as PipelineLogger;

    const fs: FeatureFilesystem = new LocalFilesystem();
    const pipelineState = { items: [] } as unknown as PipelineState;
    const ctx = {
      itemKey: nodeKey,
      executionId: invocationId,
      appRoot,
      slug,
      filesystem: fs,
      pipelineState,
      attempt: 1,
      // No `currentInvocation` — this simulates a fresh dispatch
      // (the scenario where Bug B manifested).
    } as unknown as NodeContext;

    const handler: NodeHandler = {
      name: "local-exec",
      execute: async () => ({ outcome: "completed", summary: {} }),
    };

    const batchResult: BatchDispatchResult = {
      commands: [],
      itemResults: [
        {
          itemKey: nodeKey,
          // Crucially, no `handlerName` field — local-exec does not
          // stamp one, so the seal hook must derive it from pair[0].
          result: { outcome: "completed", summary: {} } as never,
        },
      ],
      errors: [],
    };

    // Simulate a 750ms gap between dispatch-start and seal-finish.
    const startedAt = new Date(Date.now() - 750).toISOString();
    const startedAtByItem = new Map<string, string>([[nodeKey, startedAt]]);

    await recordInvocationSeal(
      stateStore,
      slug,
      [[handler, ctx]],
      batchResult,
      logger,
      { startedAtByItem },
    );

    // 1) seal outcome is "completed" (not the silent "error" fallback)
    assert.equal(seals.length, 1);
    assert.equal(seals[0]!.outcome, "completed");

    // 2) node-report.json was written with the correct handler + durationMs
    const reportPath = join(
      appRoot,
      "in-progress",
      slug,
      nodeKey,
      invocationId,
      "outputs",
      "node-report.json",
    );
    assert.ok(existsSync(reportPath), `expected node-report at ${reportPath}`);
    const report = JSON.parse(readFileSync(reportPath, "utf8")) as {
      handler: string;
      durationMs: number;
      startedAt: string;
      finishedAt: string;
      outcome: string;
    };
    assert.equal(report.handler, "local-exec", "handler must come from pair[0].name");
    assert.equal(report.outcome, "completed");
    assert.ok(
      report.durationMs >= 700,
      `expected durationMs ≈ 750 (real time), got ${report.durationMs}`,
    );
    assert.equal(report.startedAt, startedAt, "startedAt must come from startedAtByItem map");

    // 3) no `outcome_missing` telemetry was emitted
    const missing = events.filter((e) => e.kind === "invocation.seal.outcome_missing");
    assert.equal(missing.length, 0, "no outcome-missing telemetry expected on happy path");
  });

  it("emits outcome_missing telemetry with stable errorSignature when ItemDispatchResult.outcome is absent", async () => {
    const appRoot = makeAppRoot();
    const slug = "demo";
    const nodeKey = "scaffold-x";
    const invocationId = newInvocationId();

    const stateStore: StateStore = {
      sealInvocation: async () => { /* noop */ },
    } as unknown as StateStore;

    const events: Array<{ kind: string; data: Record<string, unknown> }> = [];
    const logger = {
      event: (kind: string, _itemKey: string | null, data: Record<string, unknown>) => {
        events.push({ kind, data });
        return "";
      },
    } as unknown as PipelineLogger;

    const fs: FeatureFilesystem = new LocalFilesystem();
    const pipelineState = { items: [] } as unknown as PipelineState;
    const ctx = {
      itemKey: nodeKey,
      executionId: invocationId,
      appRoot,
      slug,
      filesystem: fs,
      pipelineState,
      attempt: 1,
    } as unknown as NodeContext;

    const handler: NodeHandler = {
      name: "local-exec",
      execute: async () => ({ outcome: "completed", summary: {} }),
    };

    const batchResult: BatchDispatchResult = {
      commands: [],
      itemResults: [
        // Synthesise the bug: result without an `outcome` field.
        { itemKey: nodeKey, result: { summary: {} } as never },
      ],
      errors: [],
    };

    await recordInvocationSeal(
      stateStore,
      slug,
      [[handler, ctx]],
      batchResult,
      logger,
    );

    const missing = events.filter((e) => e.kind === "invocation.seal.outcome_missing");
    assert.equal(missing.length, 1, "expected one outcome_missing event");
    assert.equal(
      missing[0]!.data.errorSignature,
      "ledger:dispatch-result-missing",
      "stable errorSignature must be emitted for triage routing",
    );
  });
});
