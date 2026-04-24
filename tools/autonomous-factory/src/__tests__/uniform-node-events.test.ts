/**
 * uniform-node-events.test.ts — Phase B: every handler type gets a matched
 * `node.start`/`node.end` pair stamped with invocationId, regardless of
 * whether the handler itself emits item.start/item.end. Artifact writes
 * and seals also emit uniform events.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { LocalFilesystem } from "../adapters/local-filesystem.js";
import { FileArtifactBus } from "../adapters/file-artifact-bus.js";
import { newInvocationId } from "../kernel/invocation-id.js";
import {
  recordInvocationDispatch,
  recordInvocationSeal,
} from "../loop/dispatch/invocation-ledger-hooks.js";
import type { PipelineState } from "../types.js";
import type { NodeContext, NodeHandler } from "../handlers/types.js";
import type { StateStore } from "../ports/state-store.js";
import type { PipelineLogger, EventKind } from "../telemetry/events.js";
import type { BatchDispatchResult } from "../loop/dispatch/batch-dispatcher.js";

interface CapturedEvent { kind: EventKind; itemKey: string | null; data: Record<string, unknown>; }

function makeLogger(): { logger: PipelineLogger; events: CapturedEvent[] } {
  const events: CapturedEvent[] = [];
  const logger = {
    event: (kind: EventKind, itemKey: string | null, data: Record<string, unknown>) => {
      events.push({ kind, itemKey, data });
      return "evt-" + events.length;
    },
    blob: () => {},
    query: () => [],
    setAttempt: () => {},
    materializeItemSummary: () => null,
    queryNodeTrace: () => ({ itemKey: "", totalAttempts: 0, attempts: [], upstreamNodes: [], downstreamNodes: [] }),
    runId: "test-run",
  } as unknown as PipelineLogger;
  return { logger, events };
}

function makeCtx(appRoot: string, itemKey: string, invocationId: string): NodeContext {
  return {
    itemKey,
    executionId: invocationId,
    appRoot,
    filesystem: new LocalFilesystem(),
    pipelineState: { items: [] } as unknown as PipelineState,
    attempt: 1,
    effectiveAttempts: 1,
  } as unknown as NodeContext;
}

describe("Phase B — uniform node.* events", () => {
  it("dispatch: emits node.start for every invocation with lineage metadata", async () => {
    const { logger, events } = makeLogger();
    const appendInvocationRecord = async () => ({} as never);
    const stateStore = { appendInvocationRecord } as unknown as StateStore;

    const ctx = makeCtx("/tmp/ignored", "my-node", newInvocationId());
    await recordInvocationDispatch(stateStore, "slug", [[{} as NodeHandler, ctx]], logger);

    const startEvts = events.filter((e) => e.kind === "node.start");
    assert.equal(startEvts.length, 1);
    const e = startEvts[0]!;
    assert.equal(e.itemKey, "my-node");
    assert.equal(e.data.invocationId, ctx.executionId);
    assert.equal(e.data.nodeKey, "my-node");
    assert.equal(e.data.trigger, "initial");
    assert.equal(e.data.attempt, 1);
    assert.ok(typeof e.data.startedAt === "string" && e.data.startedAt.length > 0);
  });

  it("seal: emits node.end and node.artifact.seal with outputs", async () => {
    const appRoot = mkdtempSync(join(tmpdir(), "phaseB-"));
    const { logger, events } = makeLogger();
    const stateStore = {
      sealInvocation: async () => ({} as never),
    } as unknown as StateStore;

    const ctx = makeCtx(appRoot, "my-node", newInvocationId());
    const batchResult: BatchDispatchResult = {
      commands: [],
      itemResults: [{ itemKey: "my-node", result: { outcome: "completed", summary: {} } as never }],
      errors: [],
    };

    await recordInvocationSeal(stateStore, "slug", [[{} as NodeHandler, ctx]], batchResult, logger);

    const endEvts = events.filter((e) => e.kind === "node.end");
    assert.equal(endEvts.length, 1);
    assert.equal(endEvts[0]!.data.invocationId, ctx.executionId);
    assert.equal(endEvts[0]!.data.outcome, "completed");
    assert.deepEqual(endEvts[0]!.data.outputKinds, []);

    const sealEvts = events.filter((e) => e.kind === "node.artifact.seal");
    assert.equal(sealEvts.length, 1);
    assert.equal(sealEvts[0]!.data.invocationId, ctx.executionId);
  });

  it("bus: emits node.artifact.write on successful writes", async () => {
    const appRoot = mkdtempSync(join(tmpdir(), "phaseB-write-"));
    const { logger, events } = makeLogger();
    const bus = new FileArtifactBus(appRoot, new LocalFilesystem(), logger);
    const inv = newInvocationId();
    const ref = bus.ref("slug", "params", { nodeKey: "spec-compiler", invocationId: inv });

    await bus.write(ref, '{"ok":1}');

    const writes = events.filter((e) => e.kind === "node.artifact.write");
    assert.equal(writes.length, 1);
    assert.equal(writes[0]!.data.kind, "params");
    assert.equal(writes[0]!.data.scope, "node");
    assert.equal(writes[0]!.data.invocationId, inv);
    assert.equal(writes[0]!.data.nodeKey, "spec-compiler");
    assert.equal(writes[0]!.data.bytes, 8);
  });

  it("bus: no event emitted when logger absent (backward compat)", async () => {
    const appRoot = mkdtempSync(join(tmpdir(), "phaseB-nolog-"));
    const bus = new FileArtifactBus(appRoot, new LocalFilesystem()); // no logger
    const ref = bus.ref("slug", "params", { nodeKey: "x", invocationId: newInvocationId() });
    await bus.write(ref, "{}"); // does not throw
  });
});
