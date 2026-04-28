/**
 * kernel/__tests__/salvage-deploy-orphan.test.ts — A5 kernel-level fixture.
 *
 * Reproduces the `product-quick-view-plp` salvage scheduler bug at the
 * kernel boundary: an `e2e-runner` failure salvages with survivors
 * `[code-cleanup, docs-archived, publish-pr]`, but `publish-pr` only
 * promotes an existing PR — it cannot run with `create-draft-pr` already
 * N/A. Pre-fix the scheduler left `publish-pr` pending; post-fix the
 * deploy-orphan invariant demotes it.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PipelineKernel } from "../pipeline-kernel.js";
import { DefaultKernelRules } from "../rules.js";
import { createRunState } from "../types.js";
import { wrapDagCommands } from "../commands.js";
import type { PipelineState } from "../../types.js";

function makeProductQuickViewPlpState(): PipelineState {
  return {
    feature: "product-quick-view-plp",
    workflowName: "storefront",
    started: "2026-04-25T00:00:00Z",
    deployedUrl: null,
    implementationNotes: null,
    items: [
      { key: "stage-spec", label: "stage-spec", agent: null, status: "done", error: null },
      { key: "storefront-dev", label: "storefront-dev", agent: "dev", status: "done", error: null },
      { key: "e2e-runner", label: "e2e-runner", agent: null, status: "pending", error: null },
      { key: "create-draft-pr", label: "create-draft-pr", agent: "dev", status: "pending", error: null },
      { key: "code-cleanup", label: "code-cleanup", agent: "dev", status: "pending", error: null },
      { key: "docs-archived", label: "docs-archived", agent: "dev", status: "pending", error: null },
      { key: "publish-pr", label: "publish-pr", agent: null, status: "pending", error: null },
    ],
    errorLog: [],
    dependencies: {
      "stage-spec": [],
      "storefront-dev": ["stage-spec"],
      "e2e-runner": ["storefront-dev"],
      "create-draft-pr": ["e2e-runner"],
      "code-cleanup": ["e2e-runner", "create-draft-pr"],
      "docs-archived": ["code-cleanup"],
      // publish-pr is a promotion-only deploy node — its only artifact
      // producer is create-draft-pr (the PR id). docs-archived attaches
      // a non-required change-manifest but is not in depends_on (its
      // consumes_artifacts edge is required:false in the real workflow).
      "publish-pr": ["create-draft-pr"],
    },
    nodeTypes: {
      "stage-spec": "script",
      "storefront-dev": "agent",
      "e2e-runner": "script",
      "create-draft-pr": "agent",
      "code-cleanup": "agent",
      "docs-archived": "agent",
      "publish-pr": "script",
    },
    nodeCategories: {
      "stage-spec": "scaffold",
      "storefront-dev": "dev",
      "e2e-runner": "test",
      "create-draft-pr": "deploy",
      "code-cleanup": "finalize",
      "docs-archived": "finalize",
      "publish-pr": "deploy",
    },
    jsonGated: {},
    naByType: [],
    salvageSurvivors: ["code-cleanup", "docs-archived", "publish-pr"],
  };
}

describe("PipelineKernel — salvage deploy-orphan invariant (A5)", () => {
  it("demotes publish-pr to N/A when create-draft-pr is N/A after salvage", () => {
    const kernel = new PipelineKernel(
      "product-quick-view-plp",
      makeProductQuickViewPlpState(),
      createRunState(),
      new DefaultKernelRules(),
    );
    const cmds = wrapDagCommands([{
      type: "salvage-draft",
      failedItemKey: "e2e-runner",
      reason: "unfixable e2e timeout",
    }]);
    const { result } = kernel.process(cmds[0]);
    assert.equal(result.ok, true);

    const snap = kernel.dagSnapshot();
    const byKey = (k: string) => snap.items.find((i) => i.key === k)!;

    // Downstream of e2e-runner: create-draft-pr → na (downstream cascade).
    assert.equal(byKey("e2e-runner").status, "na", "failing seed na");
    assert.equal(byKey("create-draft-pr").status, "na", "downstream of e2e-runner na");

    // Finalize survivors stay pending — they are loss-tolerant.
    assert.equal(byKey("code-cleanup").status, "pending", "finalize survivor pending");
    assert.equal(byKey("docs-archived").status, "pending", "finalize survivor pending");

    // The bug: pre-fix, publish-pr stayed pending despite create-draft-pr
    // being N/A. Post-fix, the deploy-orphan sweep demotes it.
    assert.equal(byKey("publish-pr").status, "na", "deploy survivor with all-N/A producer chain must be demoted");
    assert.equal(byKey("publish-pr").salvaged, true);
    assert.deepEqual(snap.naBySalvage, ["publish-pr"]);
  });

  it("leaves a deploy survivor pending when at least one dep is non-N/A", () => {
    // Variant: publish-pr depends on docs-archived (a finalize survivor
    // that stays pending) AND create-draft-pr (na). Mixed deps → must
    // NOT be demoted because at least one producer is alive.
    const state = makeProductQuickViewPlpState();
    state.dependencies["publish-pr"] = ["docs-archived", "create-draft-pr"];
    const kernel = new PipelineKernel(
      "product-quick-view-plp",
      state,
      createRunState(),
      new DefaultKernelRules(),
    );
    const cmds = wrapDagCommands([{
      type: "salvage-draft",
      failedItemKey: "e2e-runner",
      reason: "unfixable e2e timeout",
    }]);
    kernel.process(cmds[0]);
    const snap = kernel.dagSnapshot();
    assert.equal(snap.items.find((i) => i.key === "publish-pr")?.status, "pending");
    assert.deepEqual(snap.naBySalvage ?? [], []);
  });
});
