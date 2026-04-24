/**
 * compile-node-io-contract.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { compileNodeIOContract } from "../compile-node-io-contract.js";
import type { ApmWorkflowNode } from "../types.js";

// Minimal factory for the fields we care about; tests cast through unknown
// to avoid duplicating the huge Zod-inferred schema.
function node(overrides: Partial<ApmWorkflowNode>): ApmWorkflowNode {
  return {
    type: "agent",
    category: "dev",
    timeout_minutes: 15,
    depends_on: [],
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
    consumes_reroute: [],
    triggers: ["schedule"],
    ...overrides,
  } as unknown as ApmWorkflowNode;
}

describe("compileNodeIOContract", () => {
  it("compiles kickoff + upstream + produces into a frozen contract", () => {
    const c = compileNodeIOContract(
      "storefront-dev",
      node({
        consumes_kickoff: ["spec"],
        consumes_artifacts: [
          { from: "spec-compiler", kind: "acceptance", required: true, pick: "latest" },
          { from: "baseline-analyzer", kind: "baseline", required: false, pick: "latest" },
        ],
        produces_artifacts: [],
      }),
    );

    assert.equal(c.nodeKey, "storefront-dev");
    assert.deepEqual(c.consumes.kickoff, [{ kind: "spec", required: true }]);
    assert.equal(c.consumes.upstream.length, 2);
    assert.equal(c.consumes.upstream[0].from, "spec-compiler");
    assert.equal(c.consumes.upstream[0].required, true);
    assert.equal(c.consumes.upstream[1].required, false);
    assert.equal(c.consumes.reroute.length, 0);
    assert.equal(c.produces.length, 0);
  });

  it("compiles reroute consumes and produces", () => {
    const c = compileNodeIOContract(
      "storefront-debug",
      node({
        consumes_reroute: [{ kind: "triage-handoff", required: true }],
        produces_artifacts: ["debug-notes"],
      }),
    );

    assert.deepEqual(c.consumes.reroute, [{ kind: "triage-handoff", required: true }]);
    assert.deepEqual(c.produces, [{ kind: "debug-notes", required: true }]);
  });

  it("throws on unknown artifact kind", () => {
    assert.throws(
      () =>
        compileNodeIOContract(
          "bad",
          node({ produces_artifacts: ["not-a-real-kind"] }),
        ),
      /unknown artifact kind/,
    );
  });
});
