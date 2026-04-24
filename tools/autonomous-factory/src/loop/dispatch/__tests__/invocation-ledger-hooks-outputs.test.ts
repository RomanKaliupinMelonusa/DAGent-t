/**
 * invocation-ledger-hooks-outputs.test.ts — verify that
 * `recordInvocationSeal` populates `InvocationRecord.outputs` from the
 * node's declared `produces_artifacts` by checking the filesystem.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ApmWorkflowNode } from "../../../apm/types.js";
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
  return mkdtempSync(join(tmpdir(), "dagent-seal-outputs-"));
}

function stubNode(produces: string[]): ApmWorkflowNode {
  return {
    type: "agent",
    category: "test",
    depends_on: [],
    triggers: ["schedule"],
    timeout_minutes: 15,
    requires_data_plane_ready: false,
    auto_skip_if_no_changes_in: [],
    auto_skip_if_no_deletions: false,
    auto_skip_unless_triage_reroute: false,
    template_flags: [],
    force_run_if_changed: [],
    commit_scope: "all",
    diff_attribution_dirs: [],
    writes_deploy_sentinel: false,
    generates_change_manifest: false,
    injects_infra_rollback: false,
    captures_head_sha: false,
    signals_create_pr: false,
    produces: [],
    consumes: [],
    consumes_kickoff: [],
    produces_artifacts: produces,
    consumes_artifacts: [],
  } as unknown as ApmWorkflowNode;
}

describe("recordInvocationSeal — outputs auto-population", () => {
  it("populates outputs for completed invocations when declared files exist", async () => {
    const appRoot = makeAppRoot();
    const slug = "demo";
    const nodeKey = "spec-compiler";
    const invocationId = newInvocationId();
    const dir = join(appRoot, "in-progress", slug, nodeKey, invocationId, "outputs");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "acceptance.yml"), "ok: true", "utf8");

    const seals: Array<{ outputs?: unknown }> = [];
    const stateStore: StateStore = {
      sealInvocation: async (_slug: string, input: unknown) => { seals.push(input as { outputs?: unknown }); },
    } as unknown as StateStore;

    const logger = { event: () => "" } as unknown as PipelineLogger;
    const fs: FeatureFilesystem = new LocalFilesystem();
    const pipelineState = { items: [] } as unknown as PipelineState;
    const ctx = {
      itemKey: nodeKey,
      executionId: invocationId,
      appRoot,
      filesystem: fs,
      pipelineState,
    } as unknown as NodeContext;

    const batchResult: BatchDispatchResult = {
      commands: [],
      itemResults: [{ itemKey: nodeKey, result: { summary: { outcome: "completed" } } as never }],
      errors: [],
    };

    await recordInvocationSeal(
      stateStore,
      slug,
      [[{} as NodeHandler, ctx]],
      batchResult,
      logger,
      { resolveNode: () => stubNode(["acceptance"]) },
    );

    assert.equal(seals.length, 1);
    const outputs = (seals[0] as { outputs?: Array<{ kind: string; path: string }> }).outputs ?? [];
    assert.equal(outputs.length, 1);
    assert.equal(outputs[0]!.kind, "acceptance");
    assert.ok(outputs[0]!.path.endsWith("acceptance.yml"));
  });

  it("does not populate outputs for failed invocations", async () => {
    const appRoot = makeAppRoot();
    const slug = "demo";
    const nodeKey = "spec-compiler";
    const invocationId = newInvocationId();
    const dir = join(appRoot, "in-progress", slug, nodeKey, invocationId, "outputs");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "acceptance.yml"), "partial", "utf8");

    const seals: Array<{ outputs?: unknown }> = [];
    const stateStore: StateStore = {
      sealInvocation: async (_slug: string, input: unknown) => { seals.push(input as { outputs?: unknown }); },
    } as unknown as StateStore;
    const logger = { event: () => "" } as unknown as PipelineLogger;
    const fs: FeatureFilesystem = new LocalFilesystem();
    const ctx = {
      itemKey: nodeKey,
      executionId: invocationId,
      appRoot,
      filesystem: fs,
      pipelineState: { items: [] } as unknown as PipelineState,
    } as unknown as NodeContext;

    const batchResult: BatchDispatchResult = {
      commands: [],
      itemResults: [{ itemKey: nodeKey, result: { summary: { outcome: "failed", errorMessage: "x" } } as never }],
      errors: [],
    };

    await recordInvocationSeal(
      stateStore,
      slug,
      [[{} as NodeHandler, ctx]],
      batchResult,
      logger,
      { resolveNode: () => stubNode(["acceptance"]) },
    );

    assert.equal(seals.length, 1);
    const outputs = (seals[0] as { outputs?: unknown[] }).outputs;
    assert.equal(outputs, undefined);
  });

  it("skips outputs when the declared file does not exist", async () => {
    const appRoot = makeAppRoot();
    const slug = "demo";
    const nodeKey = "spec-compiler";
    const invocationId = newInvocationId();

    const seals: Array<{ outputs?: unknown }> = [];
    const stateStore: StateStore = {
      sealInvocation: async (_slug: string, input: unknown) => { seals.push(input as { outputs?: unknown }); },
    } as unknown as StateStore;
    const logger = { event: () => "" } as unknown as PipelineLogger;
    const fs: FeatureFilesystem = new LocalFilesystem();
    const ctx = {
      itemKey: nodeKey,
      executionId: invocationId,
      appRoot,
      filesystem: fs,
      pipelineState: { items: [] } as unknown as PipelineState,
    } as unknown as NodeContext;

    const batchResult: BatchDispatchResult = {
      commands: [],
      itemResults: [{ itemKey: nodeKey, result: { summary: { outcome: "completed" } } as never }],
      errors: [],
    };

    await recordInvocationSeal(
      stateStore,
      slug,
      [[{} as NodeHandler, ctx]],
      batchResult,
      logger,
      { resolveNode: () => stubNode(["acceptance"]) },
    );

    assert.equal(seals.length, 1);
    const outputs = (seals[0] as { outputs?: unknown[] }).outputs;
    assert.equal(outputs, undefined);
  });

  it("skips outputs resolution when node has no produces_artifacts", async () => {
    const appRoot = makeAppRoot();
    const seals: Array<{ outputs?: unknown }> = [];
    const stateStore: StateStore = {
      sealInvocation: async (_slug: string, input: unknown) => { seals.push(input as { outputs?: unknown }); },
    } as unknown as StateStore;
    const logger = { event: () => "" } as unknown as PipelineLogger;
    const fs: FeatureFilesystem = new LocalFilesystem();
    const ctx = {
      itemKey: "noop-node",
      executionId: newInvocationId(),
      appRoot,
      filesystem: fs,
      pipelineState: { items: [] } as unknown as PipelineState,
    } as unknown as NodeContext;

    const batchResult: BatchDispatchResult = {
      commands: [],
      itemResults: [{ itemKey: "noop-node", result: { summary: { outcome: "completed" } } as never }],
      errors: [],
    };

    await recordInvocationSeal(
      stateStore,
      "demo",
      [[{} as NodeHandler, ctx]],
      batchResult,
      logger,
      { resolveNode: () => stubNode([]) },
    );

    assert.equal(seals.length, 1);
    const outputs = (seals[0] as { outputs?: unknown[] }).outputs;
    assert.equal(outputs, undefined);
  });
});
