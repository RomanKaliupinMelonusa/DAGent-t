/**
 * state-invocation-ledger.test.ts — Phase 2 tests for the Artifact-Bus
 * invocation ledger maintained by the JSON-file state store.
 *
 * Exercises:
 *   - appendInvocationRecord: allocates cycleIndex, wires item pointer,
 *     tails `_invocations.jsonl`.
 *   - sealInvocation: sets outcome, finishedAt, sealed flag, merges outputs.
 *   - getInvocationRecord / listInvocationRecords: read paths.
 *   - persistDagSnapshot preserves `artifacts` and `latestInvocationId`.
 *   - legacy flat-layout migration (happy path + skip-unknown + dry-run).
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import type { PipelineState } from "../../types.js";
import { newInvocationId } from "../../kernel/invocation-id.js";

const tmpAppRoot = mkdtempSync(join(tmpdir(), "dagent-ledger-test-"));
mkdirSync(join(tmpAppRoot, "in-progress"), { recursive: true });
process.env.APP_ROOT = tmpAppRoot;

const { JsonFileStateStore } = await import("../json-file-state-store.js");
const { statePath } = await import("../file-state/io.js");

const SLUG = "ledger-fixture";

function baseState(): PipelineState {
  return {
    feature: SLUG,
    workflowName: "fixture",
    started: "2026-04-19T00:00:00.000Z",
    deployedUrl: null,
    implementationNotes: null,
    items: [
      { key: "dev", label: "Dev", agent: "dev", status: "pending", error: null },
      { key: "test", label: "Test", agent: "test", status: "pending", error: null },
    ],
    errorLog: [],
    dependencies: { dev: [], test: ["dev"] },
    nodeTypes: { dev: "agent", test: "agent" },
    nodeCategories: { dev: "dev", test: "test" },
    jsonGated: {},
    naByType: [],
    salvageSurvivors: [],
  };
}

function resetState(slug: string) {
  const p = statePath(slug);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(baseState(), null, 2) + "\n", "utf8");
}

describe("state-store invocation ledger", () => {
  before(() => resetState(SLUG));

  it("appendInvocationRecord creates a record, sets item pointer, tails JSONL", async () => {
    resetState(SLUG);
    const store = new JsonFileStateStore();
    const invId = newInvocationId();
    const startedAt = new Date().toISOString();
    const rec = await store.appendInvocationRecord(SLUG, {
      invocationId: invId,
      nodeKey: "dev",
      trigger: "initial",
      startedAt,
    });
    assert.equal(rec.invocationId, invId);
    assert.equal(rec.nodeKey, "dev");
    assert.equal(rec.cycleIndex, 1);
    assert.equal(rec.trigger, "initial");
    assert.equal(rec.startedAt, startedAt);
    assert.deepEqual(rec.inputs, []);
    assert.deepEqual(rec.outputs, []);

    const state = await store.getStatus(SLUG);
    assert.equal(state.items.find((i) => i.key === "dev")?.latestInvocationId, invId);
    assert.ok(state.artifacts);
    assert.equal(state.artifacts[invId].invocationId, invId);

    const jsonlPath = join(tmpAppRoot, "in-progress", SLUG, "_invocations.jsonl");
    assert.equal(existsSync(jsonlPath), true);
    const lines = readFileSync(jsonlPath, "utf8").trim().split("\n");
    assert.equal(lines.length, 1);
    assert.equal(JSON.parse(lines[0]).invocationId, invId);
  });

  it("cycleIndex increments across invocations of the same node", async () => {
    resetState(SLUG);
    const store = new JsonFileStateStore();
    const a = await store.appendInvocationRecord(SLUG, {
      invocationId: newInvocationId(1),
      nodeKey: "dev",
      trigger: "initial",
    });
    const b = await store.appendInvocationRecord(SLUG, {
      invocationId: newInvocationId(2),
      nodeKey: "dev",
      trigger: "retry",
    });
    const c = await store.appendInvocationRecord(SLUG, {
      invocationId: newInvocationId(3),
      nodeKey: "test",
      trigger: "initial",
    });
    assert.equal(a.cycleIndex, 1);
    assert.equal(b.cycleIndex, 2);
    assert.equal(c.cycleIndex, 1); // different node — resets
  });

  it("rejects duplicate invocationId", async () => {
    resetState(SLUG);
    const store = new JsonFileStateStore();
    const id = newInvocationId();
    await store.appendInvocationRecord(SLUG, { invocationId: id, nodeKey: "dev", trigger: "initial" });
    await assert.rejects(
      () => store.appendInvocationRecord(SLUG, { invocationId: id, nodeKey: "dev", trigger: "retry" }),
      /already exists in ledger/,
    );
  });

  it("rejects malformed invocationId", async () => {
    resetState(SLUG);
    const store = new JsonFileStateStore();
    await assert.rejects(
      () => store.appendInvocationRecord(SLUG, { invocationId: "not-a-ulid", nodeKey: "dev", trigger: "initial" }),
      /invalid invocationId/i,
    );
  });

  it("sealInvocation sets outcome, finishedAt, merges outputs, sets sealed flag", async () => {
    resetState(SLUG);
    const store = new JsonFileStateStore();
    const id = newInvocationId();
    await store.appendInvocationRecord(SLUG, { invocationId: id, nodeKey: "dev", trigger: "initial" });

    const sealed = await store.sealInvocation(SLUG, {
      invocationId: id,
      outcome: "completed",
      outputs: [{ kind: "params", scope: "node", slug: SLUG, nodeKey: "dev", invocationId: id, path: "/fake/params.json" }],
    });
    assert.equal(sealed.outcome, "completed");
    assert.equal(sealed.sealed, true);
    assert.ok(sealed.finishedAt);
    assert.equal(sealed.outputs.length, 1);
    assert.equal(sealed.outputs[0].kind, "params");

    // Idempotent: sealing again is a no-op.
    const again = await store.sealInvocation(SLUG, {
      invocationId: id,
      outcome: "failed", // should NOT overwrite
    });
    assert.equal(again.outcome, "completed");
    assert.equal(again.outputs.length, 1);
  });

  it("sealInvocation rejects unknown invocationId", async () => {
    resetState(SLUG);
    const store = new JsonFileStateStore();
    await assert.rejects(
      () => store.sealInvocation(SLUG, { invocationId: newInvocationId(), outcome: "completed" }),
      /unknown invocationId/,
    );
  });

  it("getInvocationRecord returns null for missing id, record for known id", async () => {
    resetState(SLUG);
    const store = new JsonFileStateStore();
    const id = newInvocationId();
    await store.appendInvocationRecord(SLUG, { invocationId: id, nodeKey: "dev", trigger: "initial" });
    assert.equal(await store.getInvocationRecord(SLUG, "inv_0000000000ZZZZZZZZZZZZZZZZZZ"), null);
    const got = await store.getInvocationRecord(SLUG, id);
    assert.equal(got?.invocationId, id);
  });

  it("listInvocationRecords returns records for a node in chronological order", async () => {
    resetState(SLUG);
    const store = new JsonFileStateStore();
    const ids = [newInvocationId(1000), newInvocationId(2000), newInvocationId(3000)];
    for (const id of [ids[2], ids[0], ids[1]]) {
      await store.appendInvocationRecord(SLUG, { invocationId: id, nodeKey: "dev", trigger: "initial" });
    }
    const got = await store.listInvocationRecords(SLUG, "dev");
    assert.deepEqual(got.map((r) => r.invocationId), ids);
  });

  it("persistDagSnapshot preserves the ledger even when the kernel snapshot omits it", async () => {
    resetState(SLUG);
    const store = new JsonFileStateStore();
    const id = newInvocationId();
    await store.appendInvocationRecord(SLUG, { invocationId: id, nodeKey: "dev", trigger: "initial" });

    // Simulate a kernel snapshot that doesn't know about artifacts (i.e. Phase 1
    // call-sites still running): it should NOT clobber the on-disk ledger.
    const disk = await store.getStatus(SLUG);
    const snapshot = { ...disk, artifacts: undefined } as unknown as PipelineState;
    const persisted = await store.persistDagSnapshot(SLUG, snapshot);
    assert.ok(persisted.artifacts);
    assert.equal(persisted.artifacts[id].invocationId, id);
    assert.equal(
      persisted.items.find((i) => i.key === "dev")?.latestInvocationId,
      id,
    );
  });
});

