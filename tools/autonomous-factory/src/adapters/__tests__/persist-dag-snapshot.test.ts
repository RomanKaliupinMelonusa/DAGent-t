/**
 * persist-dag-snapshot.test.ts — JsonFileStateStore.persistDagSnapshot
 *
 * Regression test for the bug where the kernel's in-memory DAG state never
 * reached disk. Only `setPendingContext` / `setLastTriageRecord` ever wrote
 * to the state file, and both re-read the stale disk state before mutating
 * a single field — so `items[*].status`, `errorLog`, and derived cycle
 * counters stayed frozen at the initial state even as the run progressed.
 *
 * `persistDagSnapshot(slug, snapshot)` must:
 *   - Overwrite `items[*].status`, `items[*].error`, and `errorLog` from
 *     the kernel snapshot.
 *   - Preserve `lastTriageRecord`, per-item `pendingContext`/`docNote`/
 *     `handoffArtifact`, and `executionLog` from the on-disk state so that
 *     side-setter writes (which race with the kernel) aren't clobbered.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PipelineState } from "../../types.js";

// APP_ROOT must be set BEFORE loading the adapter — path constants are
// captured at module load.
const tmpAppRoot = mkdtempSync(join(tmpdir(), "dagent-state-test-"));
mkdirSync(join(tmpAppRoot, "in-progress"), { recursive: true });
process.env.APP_ROOT = tmpAppRoot;

const { JsonFileStateStore } = await import("../json-file-state-store.js");
const { statePath } = await import("../file-state/io.js");

const SLUG = "dag-snapshot-fixture";

function buildInitialState(): PipelineState {
  return {
    feature: SLUG,
    workflowName: "fixture",
    started: "2026-04-19T00:00:00.000Z",
    deployedUrl: null,
    implementationNotes: null,
    items: [
      { key: "a", label: "A", agent: "dev", status: "pending", error: null },
      { key: "b", label: "B", agent: "dev", status: "pending", error: null },
    ],
    errorLog: [],
    dependencies: { a: [], b: ["a"] },
    nodeTypes: { a: "agent", b: "agent" },
    nodeCategories: { a: "dev", b: "dev" },
    jsonGated: {},
    naByType: [],
    salvageSurvivors: [],
  };
}

beforeEach(() => {
  writeFileSync(
    statePath(SLUG),
    JSON.stringify(buildInitialState(), null, 2) + "\n",
    "utf-8",
  );
});

describe("JsonFileStateStore.persistDagSnapshot", () => {
  it("writes item statuses and errorLog from the kernel snapshot to disk", async () => {
    const store = new JsonFileStateStore();
    const snapshot: PipelineState = {
      ...buildInitialState(),
      items: [
        { key: "a", label: "A", agent: "dev", status: "done", error: null },
        { key: "b", label: "B", agent: "dev", status: "failed", error: "boom" },
      ],
      errorLog: [
        {
          timestamp: "2026-04-19T00:00:01.000Z",
          itemKey: "reset-for-reroute",
          message: "Reset cycle 1/5: triage rerouted.",
          errorSignature: "abc123",
        },
      ],
    };

    await store.persistDagSnapshot(SLUG, snapshot);
    const disk = await store.getStatus(SLUG);

    assert.equal(disk.items.find((i) => i.key === "a")!.status, "done");
    assert.equal(disk.items.find((i) => i.key === "b")!.status, "failed");
    assert.equal(disk.items.find((i) => i.key === "b")!.error, "boom");
    assert.equal(disk.errorLog.length, 1);
    assert.equal(disk.errorLog[0]!.itemKey, "reset-for-reroute");
    assert.equal(disk.errorLog[0]!.errorSignature, "abc123");
  });

  it("persists cycleCounters from the kernel snapshot", async () => {
    const store = new JsonFileStateStore();
    const snapshot: PipelineState = {
      ...buildInitialState(),
      cycleCounters: { "storefront-dev": 2, "reset-for-reroute": 3 },
    };
    await store.persistDagSnapshot(SLUG, snapshot);
    const disk = await store.getStatus(SLUG);
    assert.deepEqual(disk.cycleCounters, {
      "storefront-dev": 2,
      "reset-for-reroute": 3,
    });
  });

  it("preserves lastTriageRecord written by a racing setLastTriageRecord", async () => {
    const store = new JsonFileStateStore();

    // Simulate a side-setter write that happened between kernel mutation
    // and commitState.
    await store.setLastTriageRecord(SLUG, {
      failing_item: "b",
      error_signature: "sig-1",
      guard_result: "passed",
      rag_matches: [],
      rag_selected: null,
      llm_invoked: true,
      domain: "environment",
      reason: "test",
      source: "llm",
      route_to: "b",
      cascade: [],
      cycle_count: 1,
      domain_retry_count: 0,
    });

    const snapshot: PipelineState = {
      ...buildInitialState(),
      items: [
        { key: "a", label: "A", agent: "dev", status: "done", error: null },
        { key: "b", label: "B", agent: "dev", status: "pending", error: null },
      ],
      errorLog: [],
    };
    await store.persistDagSnapshot(SLUG, snapshot);

    const disk = await store.getStatus(SLUG);
    assert.ok(disk.lastTriageRecord, "lastTriageRecord must survive persistDagSnapshot");
    assert.equal(disk.lastTriageRecord!.failing_item, "b");
    assert.equal(disk.items.find((i) => i.key === "a")!.status, "done");
  });

  it("preserves per-item pendingContext written by setPendingContext", async () => {
    const store = new JsonFileStateStore();

    await store.setPendingContext(SLUG, "b", "injected-redev-context");

    const snapshot: PipelineState = {
      ...buildInitialState(),
      items: [
        { key: "a", label: "A", agent: "dev", status: "done", error: null },
        { key: "b", label: "B", agent: "dev", status: "pending", error: null },
      ],
    };
    await store.persistDagSnapshot(SLUG, snapshot);

    const disk = await store.getStatus(SLUG);
    const b = disk.items.find((i) => i.key === "b")!;
    assert.equal(
      (b as { pendingContext?: string }).pendingContext,
      "injected-redev-context",
    );
    // Status must still reflect the kernel snapshot.
    assert.equal(b.status, "pending");
    assert.equal(disk.items.find((i) => i.key === "a")!.status, "done");
  });
});

// Cleanup — best effort.
process.on("exit", () => {
  try {
    rmSync(tmpAppRoot, { recursive: true, force: true });
  } catch {
    /* noop */
  }
});
