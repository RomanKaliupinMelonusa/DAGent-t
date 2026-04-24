/**
 * task-prompt-io.test.ts — Phase C: buildTaskPrompt renders the declared
 * inputs/outputs block unconditionally, drops the hardcoded /_kickoff/spec.md step,
 * and renders a re-invocation lineage block when this dispatch was routed
 * here by a prior invocation.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildTaskPrompt } from "../apm/agents.js";
import { FileArtifactBus } from "../adapters/file-artifact-bus.js";
import { LocalFilesystem } from "../adapters/local-filesystem.js";
import { newInvocationId } from "../kernel/invocation-id.js";
import type { ApmCompiledOutput, ApmWorkflowNode } from "../apm/types.js";
import type { PipelineState, InvocationRecord } from "../types.js";

function stubApm(agentKey: string): ApmCompiledOutput {
  return {
    agents: { [agentKey]: { systemMessage: "sys", toolLimits: {}, harnessLimits: {} } },
    workflows: {},
    config: {},
  } as unknown as ApmCompiledOutput;
}

function stubNode(overrides: Partial<ApmWorkflowNode> = {}): ApmWorkflowNode {
  return {
    type: "agent",
    category: "dev",
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
    produces_artifacts: [],
    consumes_artifacts: [],
    ...overrides,
  } as unknown as ApmWorkflowNode;
}

function stubState(args: { slug: string; artifacts?: Record<string, InvocationRecord>; itemKey?: string; stagedParentInvocationId?: string; }): PipelineState {
  const itemKey = args.itemKey ?? "cur-node";
  // When a stagedParentInvocationId is requested, synthesize a staged
  // unsealed InvocationRecord for the item carrying that parent pointer
  // and wire `item.latestInvocationId` to it. This mirrors the runtime
  // shape produced by triage's `stage-invocation` command.
  const stagedRecord: InvocationRecord | null = args.stagedParentInvocationId
    ? {
      invocationId: "inv_staged_for_lineage_test",
      nodeKey: itemKey,
      cycleIndex: 1,
      trigger: "triage-reroute",
      parentInvocationId: args.stagedParentInvocationId,
      inputs: [],
      outputs: [],
    }
    : null;
  const mergedArtifacts: Record<string, InvocationRecord> = {
    ...(args.artifacts ?? {}),
    ...(stagedRecord ? { [stagedRecord.invocationId]: stagedRecord } : {}),
  };
  return {
    feature: args.slug,
    workflowName: "wf",
    started: new Date().toISOString(),
    deployedUrl: null,
    implementationNotes: null,
    items: [{
      key: itemKey, label: itemKey, agent: itemKey, status: "pending", error: null,
      ...(stagedRecord ? { latestInvocationId: stagedRecord.invocationId } : {}),
    }],
    errorLog: [],
    dependencies: { [itemKey]: [] },
    nodeTypes: { [itemKey]: "agent" },
    nodeCategories: { [itemKey]: "dev" },
    jsonGated: {},
    naByType: [],
    salvageSurvivors: [],
    artifacts: mergedArtifacts,
  };
}

describe("Phase C — buildTaskPrompt artifact-aware prompt", () => {
  it("drops the hardcoded /_kickoff/spec.md step in favour of the Declared Inputs block", () => {
    const appRoot = mkdtempSync(join(tmpdir(), "phaseC-"));
    const slug = "feat";
    const bus = new FileArtifactBus(appRoot, new LocalFilesystem());
    const prompt = buildTaskPrompt(
      { key: "cur-node", label: "Cur Node" }, slug, appRoot,
      stubApm("cur-node"),
      {
        node: stubNode({ consumes_kickoff: ["spec"], produces_artifacts: ["debug-notes"] }),
        pipelineState: stubState({ slug }),
        artifactBus: bus,
        invocationId: newInvocationId(),
      },
    );

    assert.ok(!prompt.includes("Read the feature spec:"), "legacy step should be gone");
    assert.ok(prompt.includes("Declared Inputs / Outputs"), "IO block always rendered");
    assert.ok(prompt.includes("spec →"), "kickoff spec listed");
    assert.ok(prompt.includes("debug-notes →"), "declared output listed");
    assert.ok(prompt.includes("Read the inputs declared above"), "new step 1 references IO block");
  });

  it("renders the default kickoff spec path when node declares no consumes_kickoff", () => {
    const appRoot = mkdtempSync(join(tmpdir(), "phaseC-default-"));
    const slug = "feat";
    const bus = new FileArtifactBus(appRoot, new LocalFilesystem());
    const prompt = buildTaskPrompt(
      { key: "cur-node", label: "Cur Node" }, slug, appRoot,
      stubApm("cur-node"),
      {
        node: stubNode({}), // nothing declared
        pipelineState: stubState({ slug }),
        artifactBus: bus,
        invocationId: newInvocationId(),
      },
    );

    assert.ok(prompt.includes("Declared Inputs / Outputs"));
    assert.ok(prompt.includes(`_kickoff/spec.md`), "default kickoff spec path rendered");
    assert.ok(prompt.includes("Outputs: (none declared"), "no-outputs message shown");
  });

  it("renders the Re-invocation lineage block when dispatched with a parent invocation", () => {
    const appRoot = mkdtempSync(join(tmpdir(), "phaseC-lineage-"));
    const slug = "feat";
    const bus = new FileArtifactBus(appRoot, new LocalFilesystem());
    const triageInv = newInvocationId();
    const unitTestInv = newInvocationId();
    const artifacts: Record<string, InvocationRecord> = {
      [triageInv]: {
        invocationId: triageInv, nodeKey: "triage-storefront", cycleIndex: 1,
        trigger: "initial", startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
        outcome: "completed", inputs: [], outputs: [],
        parentInvocationId: unitTestInv,
      },
      [unitTestInv]: {
        invocationId: unitTestInv, nodeKey: "unit-test", cycleIndex: 1,
        trigger: "initial", startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
        outcome: "failed", inputs: [], outputs: [],
      },
    };

    const prompt = buildTaskPrompt(
      { key: "storefront-dev", label: "Storefront Dev" }, slug, appRoot,
      stubApm("storefront-dev"),
      {
        node: stubNode({ consumes_kickoff: ["spec"] }),
        pipelineState: stubState({ slug, artifacts, itemKey: "storefront-dev", stagedParentInvocationId: triageInv }),
        artifactBus: bus,
        invocationId: newInvocationId(),
      },
    );

    assert.ok(prompt.includes("Re-invocation context"), "lineage block present");
    assert.ok(prompt.includes("triage-storefront"));
    assert.ok(prompt.includes("unit-test [failed]"));
  });

  it("omits the lineage block when no staged parent invocation", () => {
    const appRoot = mkdtempSync(join(tmpdir(), "phaseC-nolineage-"));
    const slug = "feat";
    const bus = new FileArtifactBus(appRoot, new LocalFilesystem());
    const prompt = buildTaskPrompt(
      { key: "cur-node", label: "Cur" }, slug, appRoot,
      stubApm("cur-node"),
      {
        node: stubNode({}),
        pipelineState: stubState({ slug }),
        artifactBus: bus,
        invocationId: newInvocationId(),
      },
    );
    assert.ok(!prompt.includes("Re-invocation context"));
  });
});
