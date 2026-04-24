/**
 * params-artifact.test.ts — Phase A wiring: verifies the end-to-end path for
 * the Unified Node I/O Contract.
 *
 *   report_outcome.handoffArtifact
 *     → ArtifactBus writes `<slug>/<nodeKey>/<inv>/params.json`
 *     → seal hook records the ref on state.artifacts[inv].outputs
 *     → downstream buildAgentContext reads it back via the ledger
 *
 * No copilot-sdk in the loop — these tests target the pure helpers.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { LocalFilesystem } from "../adapters/local-filesystem.js";
import { FileArtifactBus } from "../adapters/file-artifact-bus.js";
import { newInvocationId } from "../kernel/invocation-id.js";
import { collectUpstreamArtifacts } from "../handlers/support/agent-context.js";
import { recordInvocationSeal } from "../loop/dispatch/invocation-ledger-hooks.js";
import type { PipelineState, InvocationRecord, ArtifactRefSerialized } from "../types.js";
import type { NodeContext, NodeHandler } from "../handlers/types.js";
import type { ApmWorkflowNode } from "../apm/types.js";
import type { StateStore } from "../ports/state-store.js";
import type { PipelineLogger } from "../telemetry/index.js";
import type { BatchDispatchResult } from "../loop/dispatch/batch-dispatcher.js";

function stubNode(produces: string[] = []): ApmWorkflowNode {
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

describe("Phase A — params artifact end-to-end", () => {
  it("write: ArtifactBus persists handoff JSON at the canonical params path", async () => {
    const appRoot = mkdtempSync(join(tmpdir(), "params-art-write-"));
    const bus = new FileArtifactBus(appRoot, new LocalFilesystem());
    const slug = "feat";
    const nodeKey = "spec-compiler";
    const invocationId = newInvocationId();
    const ref = bus.ref(slug, "params", { nodeKey, invocationId });
    assert.ok(ref.path.endsWith(`in-progress/${slug}/${nodeKey}/${invocationId}/outputs/params.json`));
    await bus.write(ref, '{"contract":1}');
    const body = readFileSync(ref.path, "utf8");
    assert.equal(body, '{"contract":1}');
  });

  it("seal: runtime-produced `params` ref surfaces on the ledger even when node does not declare produces_artifacts", async () => {
    const appRoot = mkdtempSync(join(tmpdir(), "params-art-seal-"));
    const slug = "feat";
    const nodeKey = "spec-compiler";
    const invocationId = newInvocationId();

    // Simulate what the handler would have written.
    const bus = new FileArtifactBus(appRoot, new LocalFilesystem());
    const ref = bus.ref(slug, "params", { nodeKey, invocationId });
    await bus.write(ref, '{"ok":true}');

    const seals: Array<{ outputs?: unknown }> = [];
    const stateStore: StateStore = {
      sealInvocation: async (_slug: string, input: unknown) => { seals.push(input as { outputs?: unknown }); },
    } as unknown as StateStore;
    const logger = { event: () => "" } as unknown as PipelineLogger;
    const ctx = {
      itemKey: nodeKey,
      executionId: invocationId,
      appRoot,
      filesystem: new LocalFilesystem(),
      pipelineState: { items: [] } as unknown as PipelineState,
    } as unknown as NodeContext;

    const runtimeRef: ArtifactRefSerialized = {
      kind: ref.kind,
      scope: ref.scope,
      slug: ref.slug,
      nodeKey: nodeKey,
      invocationId,
      path: ref.path,
    };

    const batchResult: BatchDispatchResult = {
      commands: [],
      itemResults: [{
        itemKey: nodeKey,
        result: { summary: { outcome: "completed" }, producedArtifacts: [runtimeRef] } as never,
      }],
      errors: [],
    };

    await recordInvocationSeal(
      stateStore,
      slug,
      [[{} as NodeHandler, ctx]],
      batchResult,
      logger,
      { resolveNode: () => stubNode([]) }, // node does NOT declare produces_artifacts
    );

    const outputs = (seals[0] as { outputs?: ArtifactRefSerialized[] }).outputs ?? [];
    const paramsOut = outputs.find((o) => o.kind === "params");
    assert.ok(paramsOut, "expected a params entry in the sealed outputs");
    assert.equal(paramsOut!.path, ref.path);
  });

  it("read: collectUpstreamArtifacts resolves params from state.artifacts via the bus", async () => {
    const appRoot = mkdtempSync(join(tmpdir(), "params-art-read-"));
    const slug = "feat";
    const upstreamKey = "spec-compiler";
    const inv = newInvocationId();

    // Stage the artifact on disk.
    const dir = join(appRoot, "in-progress", slug, upstreamKey, inv);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "params.json"), '{"contract":"v1","testids":["foo"]}', "utf8");

    const rec: InvocationRecord = {
      invocationId: inv,
      nodeKey: upstreamKey,
      cycleIndex: 1,
      trigger: "initial",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      outcome: "completed",
      inputs: [],
      outputs: [{
        kind: "params",
        scope: "node",
        slug,
        nodeKey: upstreamKey,
        invocationId: inv,
        path: join(dir, "params.json"),
      }],
    };

    const state: PipelineState = {
      feature: slug,
      workflowName: "wf",
      started: new Date().toISOString(),
      deployedUrl: null,
      implementationNotes: null,
      items: [{
        key: upstreamKey,
        label: upstreamKey,
        agent: upstreamKey,
        status: "done",
        error: null,
      }],
      errorLog: [],
      dependencies: { [upstreamKey]: [] },
      nodeTypes: { [upstreamKey]: "agent" },
      nodeCategories: { [upstreamKey]: "dev" },
      jsonGated: {},
      naByType: [],
      salvageSurvivors: [],
      artifacts: { [inv]: rec },
    };

    const result = await collectUpstreamArtifacts(state, appRoot, new LocalFilesystem());
    assert.deepEqual(result[upstreamKey], { contract: "v1", testids: ["foo"] });
  });
});