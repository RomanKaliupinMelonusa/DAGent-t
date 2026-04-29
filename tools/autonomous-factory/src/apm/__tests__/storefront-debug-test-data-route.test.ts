/**
 * storefront-debug-test-data-route.test.ts — Phase A regression guard.
 *
 * `storefront-debug` classifies fixture/test-data drift as the `test-data`
 * domain. Without this edge the kernel has nowhere to send the handoff and
 * degrades to a salvage Draft PR. Asserts the route exists and points at
 * `spec-compiler` so acceptance gets refreshed.
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

describe("commerce-storefront storefront-debug.on_failure routes", () => {
  const out = compileApm(STOREFRONT_APP_ROOT);
  const workflow = out.workflows["storefront"];

  it("loads the storefront workflow", () => {
    assert.ok(workflow, "expected storefront workflow to compile");
  });

  it("routes `test-data` failures to spec-compiler", () => {
    const node = workflow.nodes["storefront-debug"];
    assert.ok(node, "expected storefront-debug node");
    const routes = node.on_failure?.routes ?? {};
    assert.equal(
      routes["test-data"],
      "spec-compiler",
      `expected storefront-debug.on_failure.routes['test-data']='spec-compiler'; got ${JSON.stringify(routes)}`,
    );
  });
});
