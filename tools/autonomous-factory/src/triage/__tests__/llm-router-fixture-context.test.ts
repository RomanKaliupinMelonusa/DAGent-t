/**
 * triage/__tests__/llm-router-fixture-context.test.ts — Locks in the
 * `test-data` heuristic added by Phase C.
 *
 * The router must surface the fixture-context block when (a) `test-data`
 * is in the allowed-domain list AND (b) one or more fixtures are
 * supplied, so the LLM can prefer `test-data` over `test-code` for
 * trace-with-no-app-runtime-errors + fixture-assertion-context cases.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { __test, askLlmRouter } from "../llm-router.js";
import type { TriageLlm, TriageLlmRequest } from "../../ports/triage-llm.js";

const { buildTriagePrompt } = __test;

const STOREFRONT_DOMAINS = ["test-code", "code-defect", "test-data"];
const STOREFRONT_ROUTING = {
  "test-code": { description: "Spec defect" },
  "code-defect": { description: "App code defect" },
  "test-data": {
    description: "Acceptance fixture wrong for the running config — re-pick fixture",
  },
};

const FIXTURE_CTX = {
  failingFlow: "switch-color-swatch",
  fixtures: [
    {
      id: "plp-multi-color",
      url: "/category/newarrivals",
      asserts: [
        { kind: "first_tile_swatch_count", value: 2, comparator: "gte" as const },
      ],
    },
  ],
};

const TRACE =
  "TimeoutError: locator.waitFor: Timeout 10000ms exceeded.\n" +
  "expected swatch button count >= 2 but got 1";

describe("buildTriagePrompt — fixture context", () => {
  it("renders the fixture block when test-data is in the domain list", () => {
    const prompt = buildTriagePrompt(
      TRACE, STOREFRONT_DOMAINS, [], STOREFRONT_ROUTING, null, [],
      undefined, undefined, FIXTURE_CTX,
    );
    assert.match(prompt, /Test-fixture context for the failing flow:/);
    assert.match(prompt, /Failing flow: switch-color-swatch/);
    assert.match(prompt, /fixture id=plp-multi-color/);
    assert.match(prompt, /assert kind=first_tile_swatch_count gte 2/);
    assert.match(prompt, /prefer `test-data` over `test-code`/);
  });

  it("omits the block when test-data is NOT in the allowed-domain list", () => {
    const prompt = buildTriagePrompt(
      TRACE, ["test-code", "code-defect"], [], STOREFRONT_ROUTING, null, [],
      undefined, undefined, FIXTURE_CTX,
    );
    assert.doesNotMatch(prompt, /Test-fixture context/);
  });

  it("omits the block when no fixtures are supplied", () => {
    const prompt = buildTriagePrompt(
      TRACE, STOREFRONT_DOMAINS, [], STOREFRONT_ROUTING, null, [],
      undefined, undefined, { fixtures: [] },
    );
    assert.doesNotMatch(prompt, /Test-fixture context/);
  });
});

describe("askLlmRouter — test-data verdict on no-app-error trace + fixture context", () => {
  it("yields test-data when the model picks it citing a fixture-assertion mismatch", async () => {
    const fs = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");

    // Trace without baseline noise; only contains the fixture-assertion
    // mismatch evidence — the kind of failure cycles 3–5 of
    // product-quick-view-plp produced.
    const llm: TriageLlm = {
      async classify(_req: TriageLlmRequest): Promise<string> {
        return JSON.stringify({
          fault_domain: "test-data",
          reason: "fixture's first_tile_swatch_count >= 2 violated by chosen category",
          evidence_line: "expected swatch button count >= 2 but got 1",
        });
      },
    };

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "router-test-data-"));
    try {
      fs.mkdirSync(path.join(tmp, ".dagent", "regression"), { recursive: true });
      const result = await askLlmRouter(
        llm,
        TRACE,
        STOREFRONT_DOMAINS,
        [],
        "regression",
        tmp,
        STOREFRONT_ROUTING,
        null,
        [],
        "e2e-runner",
        undefined,
        undefined,
        FIXTURE_CTX,
      );
      assert.equal(result.fault_domain, "test-data");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
