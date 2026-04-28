/**
 * triage/__tests__/baseline-filter.test.ts — Pure-function noise filter
 * that subtracts pre-feature baseline entries from a structured
 * Playwright failure. See ../baseline-filter.ts.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { filterNoise, getLastDropCounts, matchesAnyBaselinePattern } from "../baseline-filter.js";
import type { StructuredFailure } from "../playwright-report.js";
import type { BaselineProfile } from "../../ports/baseline-loader.js";

const BASE: StructuredFailure = {
  kind: "playwright-json",
  total: 1,
  passed: 0,
  failed: 1,
  skipped: 0,
  failedTests: [],
  uncaughtErrors: [],
  consoleErrors: [],
  failedRequests: [],
};

describe("filterNoise", () => {
  it("returns the payload reference-unchanged when baseline is null", () => {
    const payload = { ...BASE, consoleErrors: ["noisy"] };
    assert.equal(filterNoise(payload, null), payload);
    assert.equal(filterNoise(payload, undefined), payload);
  });

  it("is an identity no-op for non-playwright payloads", () => {
    const baseline: BaselineProfile = {
      feature: "x",
      console_errors: [{ pattern: "noisy" }],
    };
    assert.equal(filterNoise(undefined, baseline), undefined);
    assert.equal(filterNoise("raw string", baseline), "raw string");
    assert.deepEqual(filterNoise({ kind: "jest-json" }, baseline), { kind: "jest-json" });
  });

  it("drops console errors whose message contains a baseline pattern", () => {
    const payload: StructuredFailure = {
      ...BASE,
      consoleErrors: [
        "Warning: Each child in a list should have a unique key prop",
        "TypeError: feature-specific regression",
      ],
    };
    const baseline: BaselineProfile = {
      feature: "pqv",
      console_errors: [{ pattern: "unique key prop", source_page: "PLP" }],
    };
    const out = filterNoise(payload, baseline) as StructuredFailure;
    assert.notEqual(out, payload); // new object
    assert.deepEqual(out.consoleErrors, ["TypeError: feature-specific regression"]);
    assert.equal(out.uncaughtErrors.length, 0);
  });

  it("drops uncaught errors whose message matches a baseline pattern", () => {
    const payload: StructuredFailure = {
      ...BASE,
      uncaughtErrors: [
        { message: "TypeError: legacy recommendations widget crashed", inTest: "t1" },
        { message: "ReferenceError: featureFoo is not defined", inTest: "t2" },
      ],
    };
    const baseline: BaselineProfile = {
      feature: "pqv",
      uncaught_exceptions: [{ pattern: "legacy recommendations widget", kind: "uncaught" }],
    };
    const out = filterNoise(payload, baseline) as StructuredFailure;
    assert.equal(out.uncaughtErrors.length, 1);
    assert.match(out.uncaughtErrors[0].message, /featureFoo/);
  });

  it("drops failed-request entries whose URL matches a baseline pattern", () => {
    const payload: StructuredFailure = {
      ...BASE,
      failedRequests: [
        "GET /mobify/proxy/api/v1/recommendations",
        "GET /mobify/proxy/api/v1/products/ABC",
      ],
    };
    const baseline: BaselineProfile = {
      feature: "pqv",
      network_failures: [{ pattern: "/recommendations", kind: "network" }],
    };
    const out = filterNoise(payload, baseline) as StructuredFailure;
    assert.equal(out.failedRequests.length, 1);
    assert.match(out.failedRequests[0], /products\/ABC/);
  });

  it("returns the original reference when no baseline entry matches", () => {
    const payload: StructuredFailure = {
      ...BASE,
      consoleErrors: ["genuine feature error"],
    };
    const baseline: BaselineProfile = {
      feature: "pqv",
      console_errors: [{ pattern: "something unrelated" }],
    };
    assert.equal(filterNoise(payload, baseline), payload);
  });

  it("ignores malformed baseline entries without throwing", () => {
    const payload: StructuredFailure = {
      ...BASE,
      consoleErrors: ["some error"],
    };
    const baseline = {
      feature: "pqv",
      console_errors: [
        { pattern: 123 },
        null,
        { pattern: "" },
      ],
    } as unknown as BaselineProfile;
    assert.equal(filterNoise(payload, baseline), payload);
  });

  it("kind-less baseline entries apply to every channel (conservative default)", () => {
    const payload: StructuredFailure = {
      ...BASE,
      consoleErrors: ["generic-noise: foo"],
      uncaughtErrors: [{ message: "generic-noise: boom", inTest: "t" }],
      failedRequests: ["GET /api/generic-noise/x"],
    };
    const baseline: BaselineProfile = {
      feature: "pqv",
      console_errors: [{ pattern: "generic-noise" }], // kind omitted
    };
    const out = filterNoise(payload, baseline) as StructuredFailure;
    assert.equal(out.consoleErrors.length, 0);
    // uncaught/network channels don't match console_errors without kind alignment
    assert.equal(out.uncaughtErrors.length, 1);
    assert.equal(out.failedRequests.length, 1);
  });

  // ─────────────────────────────────────────────────────────────────────
  // Cosmetic-drift resistance (Level-1 normalisation)
  // ─────────────────────────────────────────────────────────────────────

  it("strips volatile tokens before matching (timestamps / stack paths)", () => {
    const payload: StructuredFailure = {
      ...BASE,
      consoleErrors: [
        "2026-04-20T10:15:32.123Z [WARN] Slow render in /home/node/src/components/ListItem.jsx",
      ],
    };
    // Pattern captured at baseline time carried a different timestamp and
    // a different absolute path prefix. Both are stripped by the default
    // volatile-token normaliser before substring comparison.
    const baseline: BaselineProfile = {
      feature: "pqv",
      console_errors: [
        { pattern: "2025-11-01T00:00:00.000Z [WARN] Slow render in /opt/app/src/components/ListItem.jsx" },
      ],
    };
    const out = filterNoise(payload, baseline) as StructuredFailure;
    assert.equal(out.consoleErrors.length, 0);
  });

  it("strips line/column numbers before matching (source-map drift)", () => {
    const payload: StructuredFailure = {
      ...BASE,
      uncaughtErrors: [
        {
          message: "TypeError: recs is undefined at Recommendations.jsx:142:9",
          inTest: "t1",
        },
      ],
    };
    // Baseline captured the same error at an earlier line number.
    const baseline: BaselineProfile = {
      feature: "pqv",
      uncaught_exceptions: [
        { pattern: "TypeError: recs is undefined at Recommendations.jsx:87:15", kind: "uncaught" },
      ],
    };
    const out = filterNoise(payload, baseline) as StructuredFailure;
    assert.equal(out.uncaughtErrors.length, 0);
  });

  it("pattern fragment still matches full runtime message (substring on normalised form)", () => {
    const payload: StructuredFailure = {
      ...BASE,
      uncaughtErrors: [
        {
          message: "TypeError: Cannot read properties of undefined (reading 'itemId') at ListItem.jsx:42:17",
          inTest: "renders tile",
        },
      ],
    };
    // Baseline entry is deliberately just the core message fragment, no
    // prefix, no stack frame — the agent prompt recommends this shape.
    const baseline: BaselineProfile = {
      feature: "pqv",
      uncaught_exceptions: [
        { pattern: "Cannot read properties of undefined (reading 'itemId')", kind: "uncaught" },
      ],
    };
    const out = filterNoise(payload, baseline) as StructuredFailure;
    assert.equal(out.uncaughtErrors.length, 0);
  });

  it("drops baseline entries that normalise to the empty string", () => {
    const payload: StructuredFailure = {
      ...BASE,
      consoleErrors: ["genuine feature failure"],
    };
    // Pattern is only a timestamp — strips to empty. An empty-pattern
    // match would otherwise swallow every message.
    const baseline: BaselineProfile = {
      feature: "pqv",
      console_errors: [{ pattern: "2026-04-20T10:00:00.000Z" }],
    };
    assert.equal(filterNoise(payload, baseline), payload);
  });

  it("network patterns keep URL paths intact (no normalisation on network channel)", () => {
    const payload: StructuredFailure = {
      ...BASE,
      failedRequests: [
        "GET /mobify/proxy/api/v1/recommendations?locale=en-US failed 500",
        "GET /mobify/proxy/api/v1/products/ABC failed 404",
      ],
    };
    // A URL-path fragment must match its own endpoint only — not ALL
    // requests. If the filter stripped paths via the default
    // `<PATH>` normalisation both entries would match.
    const baseline: BaselineProfile = {
      feature: "pqv",
      network_failures: [{ pattern: "/api/v1/recommendations", kind: "network" }],
    };
    const out = filterNoise(payload, baseline) as StructuredFailure;
    assert.equal(out.failedRequests.length, 1);
    assert.match(out.failedRequests[0], /products\/ABC/);
  });

  // ─────────────────────────────────────────────────────────────────────
  // product-quick-view-plp regression — the exact baseline pattern and
  // runtime console-error string captured during cycle-2. Pins the
  // structured filter against re-occurrence of the misclassification.
  // ─────────────────────────────────────────────────────────────────────

  it("drops the getServerSnapshot warning recorded by cycle-2 of product-quick-view-plp", () => {
    const payload: StructuredFailure = {
      ...BASE,
      consoleErrors: [
        // Verbatim from triage-handoff.json errorExcerpt of cycle-2.
        "Warning: The result of getServerSnapshot should be cached to avoid an infinite loop%s at App (http://localhost:3000/mobify/bundle/development/main.js:212:5) at RouteComponent (http://localhost:3000/mobify/bundle/development/vendor.js:23025:7)",
        "TypeError: feature-specific regression",
      ],
    };
    // Verbatim from baseline-analyzer/.../baseline.json console_errors.
    const baseline: BaselineProfile = {
      feature: "product-quick-view-plp",
      console_errors: [
        { pattern: "Warning: The result of getServerSnapshot should be cached to avoid an infinite loop" },
      ],
    };
    const out = filterNoise(payload, baseline) as StructuredFailure;
    assert.notEqual(out, payload);
    assert.equal(out.consoleErrors.length, 1);
    assert.match(out.consoleErrors[0], /feature-specific regression/);
    assert.equal(getLastDropCounts().console, 1);
  });
});

describe("matchesAnyBaselinePattern — shared single-message matcher", () => {
  it("returns true when message matches a console pattern (normalised)", () => {
    const baseline: BaselineProfile = {
      feature: "x",
      console_errors: [
        { pattern: "Warning: The result of getServerSnapshot should be cached" },
      ],
    };
    assert.equal(
      matchesAnyBaselinePattern(
        "Warning: The result of getServerSnapshot should be cached to avoid an infinite loop",
        baseline,
      ),
      true,
    );
  });

  it("returns true when message matches a network pattern (raw substring)", () => {
    const baseline: BaselineProfile = {
      feature: "x",
      network_failures: [{ pattern: "/api/v1/recommendations", kind: "network" }],
    };
    assert.equal(
      matchesAnyBaselinePattern("GET /api/v1/recommendations failed 500", baseline),
      true,
    );
  });

  it("returns false when no baseline pattern applies", () => {
    const baseline: BaselineProfile = {
      feature: "x",
      console_errors: [{ pattern: "something else entirely" }],
    };
    assert.equal(matchesAnyBaselinePattern("genuine feature error", baseline), false);
  });

  it("returns false when baseline is null/undefined or message is empty", () => {
    assert.equal(matchesAnyBaselinePattern("anything", null), false);
    assert.equal(matchesAnyBaselinePattern("anything", undefined), false);
    assert.equal(
      matchesAnyBaselinePattern("", { feature: "x", console_errors: [{ pattern: "y" }] }),
      false,
    );
  });
});
