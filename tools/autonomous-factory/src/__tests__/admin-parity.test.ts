/**
 * admin-parity.test.ts — Pure reducer parity for the kernel admin layer.
 *
 * `JsonFileStateStore.{resetScripts,resumeAfterElevated,recoverElevated}`
 * all delegate to the pure reducer `applyAdminCommand()` in kernel/admin.ts,
 * as does the CLI via `runAdminCommand()`. So parity between the CLI and the
 * kernel is guaranteed by construction. These tests lock that in by:
 *
 *   - Exercising the pure reducer on a minimal in-memory state.
 *   - Checking cycle-count bookkeeping on the returned state.
 *   - Asserting `runAdminCommand()` forwards the reducer output verbatim.
 *
 * Filesystem-based parity (adapter write-through) is covered by the existing
 * state-store adapter tests; we don't duplicate that here.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { PipelineState } from "../types.js";
import { applyAdminCommand, runAdminCommand, type AdminHost } from "../kernel/admin.js";

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

function buildFixtureState(): PipelineState {
  return {
    feature: "admin-parity",
    workflowName: "fixture",
    started: "2026-04-18T00:00:00.000Z",
    deployedUrl: null,
    notes: [],
    items: [
      { key: "dev", label: "Dev", agent: "dev", status: "done", error: null },
      { key: "push", label: "Push", agent: null, status: "done", error: null },
      { key: "ci", label: "CI", agent: null, status: "done", error: null },
    ],
    dependencies: { dev: [], push: ["dev"], ci: ["push"] },
    nodeTypes: { dev: "agent", push: "script", ci: "script" },
    nodeCategories: { dev: "dev", push: "deploy", ci: "deploy" },
    nodeKinds: {},
    errorLog: [],
    cycleCounters: {},
  } as unknown as PipelineState;
}

/** In-memory AdminHost — simulates `withLockedWrite` without hitting disk. */
function memoryHost(seed: PipelineState): {
  host: AdminHost;
  snapshot(): PipelineState;
} {
  let state = seed;
  return {
    host: {
      async withLockedWrite(_slug, fn) {
        const { next, result } = fn(state);
        state = next;
        return result;
      },
    },
    snapshot: () => state,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("kernel admin parity", () => {
  it("reset-scripts: reducer resets matching script nodes + increments cycle count", () => {
    const state = buildFixtureState();
    const result = applyAdminCommand(state, { type: "reset-scripts", category: "deploy" });

    assert.equal(result.kind, "reset-scripts");
    assert.equal(result.halted, false);
    assert.equal(result.cycleCount, 1);
    const resetItems = result.state.items.filter((i) => i.status === "pending");
    assert.deepEqual(resetItems.map((i) => i.key).sort(), ["ci", "push"]);
    assert.equal(
      (result.state as PipelineState & { cycleCounters?: Record<string, number> })
        .cycleCounters?.["reset-scripts:deploy"],
      1,
    );
  });

  it("reset-scripts: halts after maxCycles exceeded", () => {
    const state = buildFixtureState();
    state.errorLog = Array.from({ length: 10 }, (_, i) => ({
      timestamp: `2026-04-18T00:00:0${i}.000Z`,
      itemKey: "reset-scripts:deploy",
      message: `cycle ${i + 1}`,
    }));
    const result = applyAdminCommand(state, { type: "reset-scripts", category: "deploy" });
    assert.equal(result.halted, true);
    assert.equal(result.cycleCount, 10);
  });

  it("resume-after-elevated: reducer bumps resume-elevated counter", () => {
    const state = buildFixtureState();
    const result = applyAdminCommand(state, { type: "resume-after-elevated" });
    assert.equal(result.kind, "resume-after-elevated");
    assert.equal(result.halted, false);
    assert.equal(result.cycleCount, 1);
    assert.equal(
      (result.state as PipelineState & { cycleCounters?: Record<string, number> })
        .cycleCounters?.["resume-elevated"],
      1,
    );
  });

  it("runAdminCommand: forwards reducer output verbatim through the host", async () => {
    const state = buildFixtureState();

    const { host, snapshot } = memoryHost(state);
    const actual = await runAdminCommand(host, "slug", { type: "reset-scripts", category: "deploy" });

    assert.equal(actual.kind, "reset-scripts");
    assert.equal(actual.cycleCount, 1);
    assert.equal(actual.halted, false);
    // Host persisted the state emitted by the reducer.
    assert.deepEqual(snapshot(), actual.state);
    // Identical structural mutation regardless of path (compare derived fields
    // only — `errorLog[].timestamp` drifts by millisecond between reducer
    // invocations).
    const derived = (s: PipelineState) => ({
      pendingKeys: s.items.filter((i) => i.status === "pending").map((i) => i.key).sort(),
      counters: (s as PipelineState & { cycleCounters?: Record<string, number> }).cycleCounters,
      errorLogKeys: s.errorLog.map((e) => e.itemKey),
    });
    const expected = applyAdminCommand(buildFixtureState(), { type: "reset-scripts", category: "deploy" });
    assert.deepEqual(derived(actual.state), derived(expected.state));
  });

  it("runAdminCommand: serialises mutations — second call observes first's write", async () => {
    const { host, snapshot } = memoryHost(buildFixtureState());
    const first = await runAdminCommand(host, "slug", { type: "reset-scripts", category: "deploy" });
    const second = await runAdminCommand(host, "slug", { type: "reset-scripts", category: "deploy" });
    assert.equal(first.cycleCount, 1);
    assert.equal(second.cycleCount, 2);
    assert.equal(
      (snapshot() as PipelineState & { cycleCounters?: Record<string, number> })
        .cycleCounters?.["reset-scripts:deploy"],
      2,
    );
  });
});
