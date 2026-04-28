/**
 * salvage-immune-e2e.test.ts — End-to-end propagation test for `salvage_immune`.
 *
 * The Phase 1 hotfix has three integration points beyond the pure
 * `salvageForDraft()` reducer:
 *   1. Zod schema (apm/types.ts) must accept `salvage_immune`.
 *   2. APM compiler must preserve it in `context.json`.
 *   3. `buildInitialState()` must populate `state.salvageImmune` from it.
 *
 * Pure-domain unit tests build a `TransitionState` literal and bypass all
 * three. This test exercises the real path against the real storefront
 * manifest so a regression at any layer fails loudly.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { compileApm } from "../../apm/compiler.js";
import { buildInitialState, type CompiledNode } from "../init-state.js";

const STOREFRONT_APP_ROOT = resolve(
  import.meta.dirname,
  "..", "..", "..", "..", "..",
  "apps", "commerce-storefront",
);

describe("salvage_immune end-to-end propagation", () => {
  it("publish-pr is marked salvage_immune in the compiled storefront context", () => {
    const compiled = compileApm(STOREFRONT_APP_ROOT);
    const wf = compiled.workflows?.["storefront"];
    assert.ok(wf, "storefront workflow missing from compiled output");
    const node = wf.nodes?.["publish-pr"] as CompiledNode | undefined;
    assert.ok(node, "publish-pr node missing from compiled storefront workflow");
    assert.equal(
      node.salvage_immune,
      true,
      "publish-pr.salvage_immune must survive Zod parse + compiler",
    );
  });

  it("buildInitialState() promotes salvage_immune nodes into state.salvageImmune", () => {
    const compiled = compileApm(STOREFRONT_APP_ROOT);
    const wf = compiled.workflows?.["storefront"];
    assert.ok(wf?.nodes, "storefront nodes missing");
    const seed = buildInitialState({
      feature: "test-slug",
      workflowName: "storefront",
      started: "2026-04-28T00:00:00Z",
      nodes: wf.nodes as Record<string, CompiledNode>,
    });
    assert.ok(
      seed.salvageImmune.includes("publish-pr"),
      `expected publish-pr in seed.salvageImmune, got: ${JSON.stringify(seed.salvageImmune)}`,
    );
  });
});
