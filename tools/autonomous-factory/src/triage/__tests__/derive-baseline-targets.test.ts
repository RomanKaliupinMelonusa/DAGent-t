/**
 * triage/__tests__/derive-baseline-targets.test.ts — unit coverage for the
 * pure ACCEPTANCE.yml → targets extractor used by the baseline-analyzer
 * dispatch-time prompt injection.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  deriveBaselineTargets,
  formatDerivedTargetsMarkdown,
} from "../derive-baseline-targets.js";
import type { AcceptanceContract } from "../../apm/acceptance-schema.js";

function contract(
  flows: AcceptanceContract["required_flows"],
): AcceptanceContract {
  return {
    feature: "test",
    summary: "t",
    required_dom: [],
    required_flows: flows,
    forbidden_console_patterns: [],
    forbidden_network_failures: [],
    base_template_reuse: [],
  };
}

describe("deriveBaselineTargets", () => {
  it("returns [] for contracts with no flows", () => {
    assert.deepEqual(deriveBaselineTargets(contract([])), []);
  });

  it("extracts a single page target from a single goto", () => {
    const t = deriveBaselineTargets(
      contract([
        {
          name: "visit PLP",
          description: "d",
          steps: [{ action: "goto", url: "/category/newarrivals" }],
        },
      ]),
    );
    assert.equal(t.length, 1);
    assert.equal(t[0].kind, "page");
    assert.equal(t[0].url, "/category/newarrivals");
    assert.equal(t[0].name, "visit PLP");
  });

  it("dedupes repeated gotos across flows (first wins)", () => {
    const t = deriveBaselineTargets(
      contract([
        { name: "f1", description: "d", steps: [{ action: "goto", url: "/x" }] },
        { name: "f2", description: "d", steps: [{ action: "goto", url: "/x" }] },
      ]),
    );
    assert.equal(t.length, 1);
    assert.equal(t[0].name, "f1");
  });

  it("detects a modal when a trigger-like click is followed by assert_visible", () => {
    const t = deriveBaselineTargets(
      contract([
        {
          name: "quick view",
          description: "d",
          steps: [
            { action: "goto", url: "/category/newarrivals" },
            { action: "click", testid: "quick-view-btn", match: "first" },
            { action: "assert_visible", testid: "quick-view-modal", match: "only" },
          ],
        },
      ]),
    );
    const modal = t.find((x) => x.kind === "modal");
    assert.ok(modal);
    assert.equal(modal!.trigger_testid, "quick-view-btn");
    assert.equal(modal!.url, "/category/newarrivals");
  });

  it("detects a modal when the asserted element name looks modal-ish even with a plain click testid", () => {
    const t = deriveBaselineTargets(
      contract([
        {
          name: "open drawer",
          description: "d",
          steps: [
            { action: "goto", url: "/cart" },
            { action: "click", testid: "cart-toggle", match: "only" },
            { action: "assert_visible", testid: "mini-cart-drawer", match: "only" },
          ],
        },
      ]),
    );
    const modal = t.find((x) => x.kind === "modal");
    assert.ok(modal);
    assert.equal(modal!.trigger_testid, "cart-toggle");
  });

  it("does NOT register a modal when a click has no following assert_visible", () => {
    const t = deriveBaselineTargets(
      contract([
        {
          name: "add",
          description: "d",
          steps: [
            { action: "goto", url: "/pdp" },
            { action: "click", testid: "add-to-cart-btn", match: "only" },
          ],
        },
      ]),
    );
    assert.equal(t.filter((x) => x.kind === "modal").length, 0);
  });
});

describe("formatDerivedTargetsMarkdown", () => {
  it("returns '' for contracts with no derivable targets", () => {
    assert.equal(formatDerivedTargetsMarkdown(contract([])), "");
  });

  it("renders a bullet per target", () => {
    const md = formatDerivedTargetsMarkdown(
      contract([
        {
          name: "quick view",
          description: "d",
          steps: [
            { action: "goto", url: "/cat" },
            { action: "click", testid: "quick-view-btn", match: "first" },
            { action: "assert_visible", testid: "quick-view-modal", match: "only" },
          ],
        },
      ]),
    );
    assert.match(md, /Pre-computed capture targets/);
    assert.match(md, /\*\*page\*\* `\/cat`/);
    assert.match(md, /\*\*modal\*\* trigger `quick-view-btn`/);
  });
});
