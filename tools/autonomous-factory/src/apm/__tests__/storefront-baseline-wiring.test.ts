/**
 * storefront-baseline-wiring.test.ts — Session 2 Phase 1 regression guard.
 *
 * Asserts that the `commerce-storefront` APM workspace declares
 * `baseline-analyzer` → `baseline` as an optional `consumes_artifacts`
 * edge for every storefront node whose prompt mentions baseline-derived
 * console-error suppression:
 *
 *   - storefront-dev      (existing, regression guard)
 *   - storefront-debug    (existing, regression guard)
 *   - e2e-author          (Phase 1 — new)
 *   - qa-adversary        (Phase 1 — new)
 *
 * Hand-rolling the SDET's `BASELINE_NOISE_PATTERNS` from prose caused the
 * cycle-2 misroute on `product-quick-view-plp` (omitted `/403 Forbidden/`
 * even though `baseline-analyzer` flagged it `volatility: persistent`).
 * Wiring the artifact through `consumes_artifacts` lets the SDET derive
 * the allowlist mechanically from `inputs/baseline.json`.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { compileApm } from "../compiler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const STOREFRONT_APP_ROOT = path.resolve(
  __dirname,
  "../../../../../apps/commerce-storefront",
);

const NODES_REQUIRING_BASELINE = [
  "storefront-dev",
  "storefront-debug",
  "e2e-author",
  "qa-adversary",
] as const;

describe("commerce-storefront baseline-analyzer → consumer wiring", () => {
  const out = compileApm(STOREFRONT_APP_ROOT);
  const workflow = out.workflows["storefront"];

  it("loads the storefront workflow", () => {
    assert.ok(workflow, "expected storefront workflow to compile");
  });

  for (const nodeKey of NODES_REQUIRING_BASELINE) {
    it(`${nodeKey} declares { from: baseline-analyzer, kind: baseline, required: false }`, () => {
      const node = workflow.nodes[nodeKey];
      assert.ok(node, `expected node "${nodeKey}" in storefront workflow`);

      const edge = node.consumes_artifacts.find(
        (c) => c.from === "baseline-analyzer" && c.kind === "baseline",
      );
      assert.ok(
        edge,
        `expected ${nodeKey}.consumes_artifacts to declare baseline-analyzer/baseline; got ${JSON.stringify(node.consumes_artifacts)}`,
      );
      assert.equal(
        edge.required,
        false,
        `${nodeKey} must declare baseline as required: false (graceful-degrade)`,
      );
    });
  }
});
