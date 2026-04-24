/**
 * Tests for dispatch/batch-dispatcher.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dispatchBatch } from "../batch-dispatcher.js";
import type { NodeHandler, NodeContext } from "../../../handlers/types.js";

function makeCtx(key: string): NodeContext {
  return {
    itemKey: key,
    executionId: `exec-${key}`,
    slug: "feat-1",
    appRoot: "/app",
    repoRoot: "/repo",
    baseBranch: "main",
    specFile: "/tmp/spec.md",
    attempt: 1,
    effectiveAttempts: 1,
    environment: {},
    apmContext: { agents: {}, workflows: {} } as NodeContext["apmContext"],
    pipelineState: { items: {}, deps: {}, metadata: {} } as unknown as NodeContext["pipelineState"],
    pipelineSummaries: [],
    preStepRefs: {},
    handlerData: {},
    onHeartbeat: () => {},
    logger: { event: () => {}, warn: () => {}, error: () => {}, info: () => {} } as unknown as NodeContext["logger"],
    vcs: {} as NodeContext["vcs"],
    stateReader: {} as NodeContext["stateReader"],
    shell: {} as NodeContext["shell"],
    filesystem: {} as NodeContext["filesystem"],
    invocation: {} as NodeContext["invocation"],
    invocationLogger: {} as NodeContext["invocationLogger"],
    copilotSessionRunner: {} as NodeContext["copilotSessionRunner"],
  };
}

function successHandler(): NodeHandler {
  return {
    name: "ok",
    async execute() {
      return { outcome: "completed", summary: {} };
    },
  };
}

function crashHandler(): NodeHandler {
  return {
    name: "crash",
    async execute() { throw new Error("CRASH"); },
  };
}

describe("dispatchBatch", () => {
  it("dispatches multiple items in parallel and aggregates commands", async () => {
    const pairs: Array<readonly [NodeHandler, NodeContext]> = [
      [successHandler(), makeCtx("a")],
      [successHandler(), makeCtx("b")],
    ];
    const result = await dispatchBatch(pairs);

    // Each item: record-attempt + complete-item + record-summary = 3 commands each
    assert.equal(result.commands.length, 6);
    assert.equal(result.errors.length, 0);
    assert.equal(result.itemResults.length, 2);
  });

  it("handles rejected handler as fail-item command", async () => {
    const pairs: Array<readonly [NodeHandler, NodeContext]> = [
      [crashHandler(), makeCtx("crash-item")],
    ];
    const result = await dispatchBatch(pairs);

    // The dispatchItem catches the throw internally, so it's fulfilled, not rejected.
    // But let's verify the flow works either way.
    assert.ok(result.commands.length >= 1);
    const failCmds = result.commands.filter(c => c.type === "fail-item");
    assert.ok(failCmds.length >= 1);
  });

  it("mixes success and failure items", async () => {
    const pairs: Array<readonly [NodeHandler, NodeContext]> = [
      [successHandler(), makeCtx("ok-item")],
      [crashHandler(), makeCtx("bad-item")],
    ];
    const result = await dispatchBatch(pairs);

    const completeCmds = result.commands.filter(c => c.type === "complete-item");
    const failCmds = result.commands.filter(c => c.type === "fail-item");
    assert.ok(completeCmds.length >= 1);
    assert.ok(failCmds.length >= 1);
  });

  it("handles empty batch", async () => {
    const result = await dispatchBatch([]);
    assert.equal(result.commands.length, 0);
    assert.equal(result.itemResults.length, 0);
    assert.equal(result.errors.length, 0);
  });
});
