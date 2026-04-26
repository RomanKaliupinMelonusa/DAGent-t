/**
 * recover-dangling.test.ts — Auto-recovery of unsealed invocations after
 * an orchestrator crash/kill.
 *
 * Two layers of coverage:
 *   1. The pure scanner in `domain/dangling-invocations.ts` — drives
 *      stale/fresh/sealed/finished decisions with a fixed `now`.
 *   2. The kernel admin reducer in `kernel/admin.ts` — composes
 *      `sealInvocationRecord` + `failItem` for each dangling record and
 *      leaves fresh/sealed records untouched.
 *
 * The reducer is exercised against a real `PipelineState`. `sealInvocationRecord`
 * tails a JSONL file under `IN_PROGRESS/<slug>/_invocations.jsonl`; the test
 * scopes APP_ROOT to a tmpdir before loading the admin module so the tail
 * write lands in the temp tree.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PipelineState, InvocationRecord } from "../../types.js";

// APP_ROOT must be set BEFORE loading any module that captures path constants
// (file-state/io.ts → file-state/artifacts.ts → kernel/admin.ts).
const tmpAppRoot = mkdtempSync(join(tmpdir(), "dagent-recover-dangling-"));
mkdirSync(join(tmpAppRoot, ".dagent"), { recursive: true });
process.env.APP_ROOT = tmpAppRoot;

const { findDanglingInvocations } = await import("../../domain/dangling-invocations.js");
const { applyAdminCommand } = await import("../../kernel/admin.js");

// ─── Pure scanner ───────────────────────────────────────────────────────────

const NOW = Date.parse("2026-04-26T12:00:00.000Z");
const STALE_MS = 30 * 60 * 1000; // 30 minutes

function makeRecord(overrides: Partial<InvocationRecord>): InvocationRecord {
  return {
    invocationId: overrides.invocationId ?? "inv_x",
    nodeKey: overrides.nodeKey ?? "node-x",
    cycleIndex: 1,
    trigger: "initial",
    inputs: [],
    outputs: [],
    ...overrides,
  };
}

describe("findDanglingInvocations", () => {
  it("returns stale unsealed records and ignores fresh ones", () => {
    const stale = makeRecord({
      invocationId: "inv_stale",
      nodeKey: "storefront-debug",
      startedAt: new Date(NOW - STALE_MS - 1000).toISOString(),
    });
    const fresh = makeRecord({
      invocationId: "inv_fresh",
      nodeKey: "e2e-runner",
      startedAt: new Date(NOW - 60_000).toISOString(),
    });

    const result = findDanglingInvocations([stale, fresh], NOW, STALE_MS);
    assert.equal(result.length, 1);
    assert.equal(result[0]!.record.invocationId, "inv_stale");
    assert.ok(result[0]!.ageMs >= STALE_MS);
  });

  it("treats records with no startedAt as stale", () => {
    const orphan = makeRecord({ invocationId: "inv_orphan", nodeKey: "x" });
    const result = findDanglingInvocations([orphan], NOW, STALE_MS);
    assert.equal(result.length, 1);
    assert.equal(result[0]!.record.invocationId, "inv_orphan");
  });

  it("ignores sealed records regardless of age", () => {
    const sealed = makeRecord({
      invocationId: "inv_sealed",
      nodeKey: "x",
      startedAt: new Date(NOW - STALE_MS - 1).toISOString(),
      sealed: true,
    });
    const result = findDanglingInvocations([sealed], NOW, STALE_MS);
    assert.equal(result.length, 0);
  });

  it("ignores records with finishedAt set (sealed-by-stamp)", () => {
    const finished = makeRecord({
      invocationId: "inv_finished",
      nodeKey: "x",
      startedAt: new Date(NOW - STALE_MS - 1).toISOString(),
      finishedAt: new Date(NOW - 1).toISOString(),
    });
    const result = findDanglingInvocations([finished], NOW, STALE_MS);
    assert.equal(result.length, 0);
  });
});

// ─── Admin reducer end-to-end ───────────────────────────────────────────────

const SLUG = "recover-dangling-fixture";

function buildState(records: InvocationRecord[]): PipelineState {
  const artifacts: Record<string, InvocationRecord> = {};
  for (const r of records) artifacts[r.invocationId] = r;
  return {
    feature: SLUG,
    workflowName: "fixture",
    started: "2026-04-26T11:00:00.000Z",
    deployedUrl: null,
    implementationNotes: null,
    items: [
      {
        key: "storefront-debug",
        label: "storefront-debug",
        agent: "dev",
        status: "pending",
        error: null,
        latestInvocationId: "inv_stale",
      },
      {
        key: "e2e-runner",
        label: "e2e-runner",
        agent: "test",
        status: "pending",
        error: null,
        latestInvocationId: "inv_fresh",
      },
    ],
    errorLog: [],
    dependencies: { "storefront-debug": [], "e2e-runner": ["storefront-debug"] },
    nodeTypes: { "storefront-debug": "agent", "e2e-runner": "script" },
    nodeCategories: { "storefront-debug": "dev", "e2e-runner": "test" },
    jsonGated: {},
    naByType: [],
    salvageSurvivors: [],
    artifacts,
  } as PipelineState;
}

describe("applyAdminCommand({ type: 'recover-dangling' })", () => {
  it("seals stale invocation, fails owning item, leaves fresh untouched", () => {
    const stale = makeRecord({
      invocationId: "inv_stale",
      nodeKey: "storefront-debug",
      startedAt: new Date(NOW - STALE_MS - 5_000).toISOString(),
    });
    const fresh = makeRecord({
      invocationId: "inv_fresh",
      nodeKey: "e2e-runner",
      startedAt: new Date(NOW - 60_000).toISOString(),
    });
    const state = buildState([stale, fresh]);

    const result = applyAdminCommand(state, {
      type: "recover-dangling",
      now: NOW,
      staleMs: STALE_MS,
      slug: SLUG,
    });

    assert.equal(result.kind, "recover-dangling");
    if (result.kind !== "recover-dangling") return; // narrow

    assert.equal(result.recovered.length, 1);
    assert.equal(result.recovered[0]!.invocationId, "inv_stale");
    assert.equal(result.recovered[0]!.nodeKey, "storefront-debug");
    assert.ok(result.recovered[0]!.ageMs >= STALE_MS);
    assert.equal(result.halted, false);

    // Stale record sealed with synthetic failure outcome.
    const sealedRec = result.state.artifacts!["inv_stale"]!;
    assert.equal(sealedRec.sealed, true);
    assert.equal(sealedRec.outcome, "failed");
    assert.ok(sealedRec.finishedAt);

    // Fresh record untouched.
    const freshRec = result.state.artifacts!["inv_fresh"]!;
    assert.notEqual(freshRec.sealed, true);
    assert.equal(freshRec.outcome, undefined);

    // Owning item of stale flipped to failed with our reason.
    const debugItem = result.state.items.find((i) => i.key === "storefront-debug")!;
    assert.equal(debugItem.status, "failed");
    assert.match(debugItem.error ?? "", /Auto-recovered dangling invocation inv_stale/);

    // Owning item of fresh untouched.
    const e2eItem = result.state.items.find((i) => i.key === "e2e-runner")!;
    assert.equal(e2eItem.status, "pending");
    assert.equal(e2eItem.error, null);

    // Cleanup the JSONL tail the seal call produced.
    rmSync(join(tmpAppRoot, ".dagent", SLUG), { recursive: true, force: true });
  });

  it("returns empty recovered list when no dangling invocations exist", () => {
    const fresh = makeRecord({
      invocationId: "inv_fresh",
      nodeKey: "e2e-runner",
      startedAt: new Date(NOW - 60_000).toISOString(),
    });
    const state = buildState([fresh]);

    const result = applyAdminCommand(state, {
      type: "recover-dangling",
      now: NOW,
      staleMs: STALE_MS,
      slug: SLUG,
    });

    assert.equal(result.kind, "recover-dangling");
    if (result.kind !== "recover-dangling") return;
    assert.equal(result.recovered.length, 0);
    assert.equal(result.halted, false);
    // State is returned identically (same shape; reference equality not required).
    assert.equal(result.state.items.find((i) => i.key === "e2e-runner")!.status, "pending");
  });
});
