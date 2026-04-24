/**
 * invocation-logs-populated.test.ts — Phase 4 end-to-end shape assertion.
 *
 * Drives `recordInvocationDispatch` + `recordInvocationSeal` against a
 * real `FileInvocationFilesystem` / `FileInvocationLogger` pair and
 * asserts that `<inv>/logs/events.jsonl` is populated with both the
 * dispatch.start and dispatch.end records — the verifiable gate for
 * Phase 4 ("every invocation dir has populated logs/").
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { LocalFilesystem } from "../adapters/local-filesystem.js";
import { FileArtifactBus } from "../adapters/file-artifact-bus.js";
import { FileInvocationFilesystem } from "../adapters/file-invocation-filesystem.js";
import { FileInvocationLogger } from "../adapters/file-invocation-logger.js";
import { newInvocationId } from "../kernel/invocation-id.js";
import {
  recordInvocationDispatch,
  recordInvocationSeal,
} from "../loop/dispatch/invocation-ledger-hooks.js";
import type { NodeContext, NodeHandler } from "../handlers/types.js";
import type { PipelineLogger, EventKind } from "../telemetry/index.js";
import type { PipelineState } from "../types.js";
import type { StateStore } from "../ports/state-store.js";
import type { BatchDispatchResult } from "../loop/dispatch/batch-dispatcher.js";

function makeLogger(): PipelineLogger {
  return {
    event: (_k: EventKind, _i: string | null, _d: Record<string, unknown>) => "evt",
    blob: () => {},
    query: () => [],
    setAttempt: () => {},
    materializeItemSummary: () => null,
    queryNodeTrace: () => ({
      itemKey: "", totalAttempts: 0, attempts: [],
      upstreamNodes: [], downstreamNodes: [],
    }),
    runId: "test-run",
  } as unknown as PipelineLogger;
}

describe("Phase 4 — <inv>/logs/events.jsonl populated end-to-end", () => {
  it("records dispatch.start + dispatch.end for every invocation", async () => {
    const appRoot = mkdtempSync(join(tmpdir(), "phase4-log-"));
    const fs = new LocalFilesystem();
    const bus = new FileArtifactBus(appRoot, fs);
    const ifs = new FileInvocationFilesystem(appRoot, fs, bus);
    const slug = "feat";
    const nodeKey = "backend-dev";
    const inv = newInvocationId();
    const handles = ifs.pathsFor(slug, nodeKey, inv);

    const stateStore = {
      appendInvocationRecord: async () => ({} as never),
      sealInvocation: async () => ({} as never),
    } as unknown as StateStore;

    const ctx = {
      itemKey: nodeKey,
      executionId: inv,
      slug,
      appRoot,
      filesystem: fs,
      pipelineState: { items: [] } as unknown as PipelineState,
      attempt: 1,
      effectiveAttempts: 1,
      invocation: ifs,
      invocationLogger: new FileInvocationLogger(handles.logsDir),
    } as unknown as NodeContext;

    const logger = makeLogger();

    await recordInvocationDispatch(stateStore, slug, [[{} as NodeHandler, ctx]], logger);

    const eventsPath = join(handles.logsDir, "events.jsonl");
    assert.ok(existsSync(eventsPath), "events.jsonl exists after dispatch");
    let lines = readFileSync(eventsPath, "utf8").split("\n").filter(Boolean);
    assert.equal(lines.length, 1);
    const start = JSON.parse(lines[0]);
    assert.equal(start.kind, "dispatch.start");
    assert.equal(start.invocationId, inv);
    assert.equal(start.nodeKey, nodeKey);
    assert.equal(start.trigger, "initial");

    const batchResult: BatchDispatchResult = {
      commands: [],
      itemResults: [{
        itemKey: nodeKey,
        result: { summary: { outcome: "completed" } } as never,
      }],
      errors: [],
    };
    await recordInvocationSeal(stateStore, slug, [[{} as NodeHandler, ctx]], batchResult, logger);

    lines = readFileSync(eventsPath, "utf8").split("\n").filter(Boolean);
    assert.equal(lines.length, 2);
    const end = JSON.parse(lines[1]);
    assert.equal(end.kind, "dispatch.end");
    assert.equal(end.invocationId, inv);
    assert.equal(end.outcome, "completed");
  });
});
