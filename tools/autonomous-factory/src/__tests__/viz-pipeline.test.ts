/**
 * scripts/__tests__/viz-pipeline.test.ts — Phase 5 smoke test for the viz
 * renderers. Validates that both Mermaid and DOT outputs contain the expected
 * edges, subgraphs, and styling hints for a fixture workflow.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderMermaid, renderDot } from "../viz/render.js";
import type { ApmWorkflow } from "../apm/index.js";

/**
 * Build a hand-rolled workflow fixture. We skip `ApmWorkflowSchema.parse` so
 * that we don't need to also construct a triage profile registry just to
 * satisfy the refine — the renderers only consume the compiled shape, not
 * parse errors.
 */
function mkNode(overrides: Record<string, unknown>): unknown {
  return {
    type: "agent",
    category: "dev",
    timeout_minutes: 15,
    requires_data_plane_ready: false,
    auto_skip_if_no_changes_in: [],
    auto_skip_if_no_deletions: false,
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
    triggers: ["schedule"],
    depends_on: [],
    ...overrides,
  };
}

const fixture = {
  nodes: {
    "dev": mkNode({ agent: "@backend-dev" }),
    "test": mkNode({
      agent: "@backend-test",
      category: "test",
      depends_on: ["dev"],
      on_failure: { triage: "triage-backend", routes: { backend: "dev" } },
    }),
    "triage-backend": mkNode({ type: "triage", category: "test", triage_profile: "default" }),
    "ship": mkNode({ type: "script", category: "deploy", script_type: "local-exec", command: "echo ok", depends_on: ["test"] }),
    "hidden-debug": mkNode({ category: "test", agent: "@backend-dev", triggers: ["route"], node_kind: "diagnostic" }),
    "approve": mkNode({ type: "approval", category: "deploy", depends_on: ["ship"] }),
  },
  unfixable_signals: [],
  triage: {},
} as unknown as ApmWorkflow;

describe("renderMermaid", () => {
  const out = renderMermaid({ demo: fixture });

  it("contains flowchart header + subgraph", () => {
    assert.ok(out.startsWith("flowchart TD"));
    assert.ok(out.includes("subgraph demo"));
    assert.ok(out.includes("end"));
  });

  it("emits depends_on edges", () => {
    assert.ok(out.includes("demo__dev --> demo__test"));
    assert.ok(out.includes("demo__test --> demo__ship"));
  });

  it("emits triage routing as dotted edge", () => {
    assert.ok(out.includes("demo__test -.backend.-> demo__dev"));
  });

  it("marks triage + approval + script + diagnostic nodes with correct class", () => {
    assert.ok(out.includes("class demo__triage_backend triage"));
    assert.ok(out.includes("class demo__approve approval"));
    assert.ok(out.includes("class demo__ship script"));
    assert.ok(out.includes("class demo__hidden_debug diagnostic"));
  });

  it("labels hidden nodes with 'hidden' badge", () => {
    assert.ok(/hidden_debug.*hidden/.test(out));
  });
});

describe("renderDot", () => {
  const out = renderDot({ demo: fixture });

  it("emits digraph + cluster", () => {
    assert.ok(out.startsWith("digraph pipeline"));
    assert.ok(out.includes("cluster_0"));
    assert.ok(out.includes('label="workflow: demo"'));
  });

  it("emits directed edges + dotted triage edges", () => {
    assert.ok(out.includes('"demo__dev" -> "demo__test"'));
    assert.ok(out.includes('"demo__test" -> "demo__dev" [label="backend", style=dotted'));
  });

  it("marks diagnostic with dashed style", () => {
    assert.ok(/hidden_debug.*dashed/.test(out));
  });
});
