/**
 * Phase D — hard-fail when a completed handler did not materialise its
 * declared `produces_artifacts`. The dispatch pipeline overrides the
 * outcome to `failed` with a stable `missing_required_output:<kind>`
 * signature so triage can route deterministically.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { dispatchItem } from "../loop/dispatch/item-dispatch.js";
import { LocalFilesystem } from "../adapters/local-filesystem.js";
import { newInvocationId } from "../kernel/invocation-id.js";
import type { NodeHandler, NodeContext, NodeResult } from "../handlers/types.js";

function makeHandler(result: NodeResult): NodeHandler {
  return { name: "test-handler", async execute() { return result; } };
}

function makeCtx(appRoot: string, overrides: Partial<NodeContext> = {}): NodeContext {
  return {
    itemKey: "dev-storefront",
    executionId: overrides.executionId ?? newInvocationId(),
    slug: "feat-d",
    appRoot,
    repoRoot: "/repo",
    baseBranch: "main",
    specFile: "/tmp/spec.md",
    attempt: 1,
    effectiveAttempts: 1,
    environment: {},
    apmContext: {
      agents: {},
      workflows: {
        wf: {
          name: "wf",
          nodes: {
            "dev-storefront": {
              type: "agent",
              produces_artifacts: ["debug-notes"],
            } as unknown,
          },
        },
      },
    } as unknown as NodeContext["apmContext"],
    pipelineState: {
      feature: "feat-d",
      workflowName: "wf",
      items: [{ key: "dev-storefront", label: "x", agent: "x", status: "pending", error: null }],
    } as unknown as NodeContext["pipelineState"],
    pipelineSummaries: [],
    preStepRefs: {},
    handlerData: {},
    onHeartbeat: () => {},
    logger: { event: () => {}, warn: () => {}, error: () => {}, info: () => {} } as unknown as NodeContext["logger"],
    vcs: {} as NodeContext["vcs"],
    stateReader: {} as NodeContext["stateReader"],
    shell: {} as NodeContext["shell"],
    filesystem: new LocalFilesystem() as unknown as NodeContext["filesystem"],
    copilotSessionRunner: {} as NodeContext["copilotSessionRunner"],
    invocation: {} as NodeContext["invocation"],
    invocationLogger: {} as NodeContext["invocationLogger"],
    triageArtifacts: {} as NodeContext["triageArtifacts"],
    artifactBus: {} as NodeContext["artifactBus"],
    ...overrides,
  };
}

describe("Phase D — hard-fail on missing declared outputs", () => {
  it("overrides completed → failed when declared produces_artifacts missing", async () => {
    const appRoot = mkdtempSync(join(tmpdir(), "phaseD-"));
    const handler = makeHandler({ outcome: "completed", summary: {} });
    const ctx = makeCtx(appRoot);
    const res = await dispatchItem(handler, ctx, []);

    const failCmd = res.commands.find((c) => c.type === "fail-item") as { message?: string } | undefined;
    assert.ok(failCmd, "expected fail-item command");
    assert.ok(!res.commands.some((c) => c.type === "complete-item"), "no complete-item should be emitted");
    const sumCmd = res.commands.find((c) => c.type === "record-summary") as
      | { summary: Record<string, unknown> } | undefined;
    assert.equal((sumCmd!.summary as { errorSignature?: string }).errorSignature, "missing_required_output:debug-notes");
  });

  it("passes through completed when declared outputs are present on disk", async () => {
    const appRoot = mkdtempSync(join(tmpdir(), "phaseD-ok-"));
    // Pre-create the expected artifact at its canonical invocation path.
    const slug = "feat-d";
    const invocationId = newInvocationId();
    const itemKey = "dev-storefront";
    const dir = join(appRoot, "in-progress", slug, itemKey, invocationId, "outputs");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "debug-notes.md"), "# debug\n");

    const handler = makeHandler({ outcome: "completed", summary: {} });
    const ctx = makeCtx(appRoot, { executionId: invocationId });
    const res = await dispatchItem(handler, ctx, []);

    assert.ok(res.commands.some((c) => c.type === "complete-item"), "complete-item should be emitted");
    assert.ok(!res.commands.some((c) => c.type === "fail-item"), "no fail-item should be emitted");
  });

  it("passes through completed when runtime producedArtifacts covers the kind", async () => {
    const appRoot = mkdtempSync(join(tmpdir(), "phaseD-runtime-"));
    const handler = makeHandler({
      outcome: "completed",
      summary: {},
      producedArtifacts: [{
        kind: "debug-notes",
        scope: "node",
        slug: "feat-d",
        nodeKey: "dev-storefront",
        invocationId: newInvocationId(),
        path: "/ignored",
      }],
    } as unknown as NodeResult);
    const ctx = makeCtx(appRoot);
    const res = await dispatchItem(handler, ctx, []);

    assert.ok(res.commands.some((c) => c.type === "complete-item"), "should honour runtime refs");
  });

  it("leaves failed outcomes untouched", async () => {
    const appRoot = mkdtempSync(join(tmpdir(), "phaseD-failed-"));
    const handler = makeHandler({ outcome: "failed", errorMessage: "orig", summary: {} });
    const ctx = makeCtx(appRoot);
    const res = await dispatchItem(handler, ctx, []);

    const failCmd = res.commands.find((c) => c.type === "fail-item") as { message?: string } | undefined;
    assert.ok(failCmd);
    assert.ok(failCmd!.message?.includes("orig"));
    assert.ok(!failCmd!.message?.includes("missing_required_output"));
  });
});
