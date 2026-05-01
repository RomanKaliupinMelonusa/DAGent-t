/**
 * triage/__tests__/contract-classifier.test.ts — profile-driven L0
 * pattern evaluator. See ../contract-classifier.ts.
 *
 * Covers the three built-in patterns shipped via
 * `triage/builtin-patterns.ts` by assembling a synthetic compiled
 * profile that embeds them — mirrors what the APM compiler produces
 * for every profile unless `builtin_patterns: false` is set.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { evaluateProfilePatterns } from "../contract-classifier.js";
import { BUILTIN_TRIAGE_PATTERNS } from "../builtin-patterns.js";
import type { CompiledTriageProfile } from "../../apm/index.js";
import type { StructuredFailure } from "../playwright-report.js";

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

function profileWithBuiltins(extraRoutingKeys: string[] = []): CompiledTriageProfile {
  const routingKeys = ["browser-runtime-error", "frontend", "schema-violation", ...extraRoutingKeys];
  const routing: Record<string, { description?: string }> = {};
  for (const k of routingKeys) routing[k] = {};
  return {
    llm_fallback: true,
    max_reroutes: 5,
    routing,
    domains: routingKeys,
    patterns: [...BUILTIN_TRIAGE_PATTERNS],
    evidence_enrichment: true,
    baseline_noise_filter: true,
    signatures: [],
  };
}

describe("evaluateProfilePatterns — structured-field built-ins", () => {
  it("returns null for undefined/null/non-playwright payloads", () => {
    const p = profileWithBuiltins();
    assert.equal(evaluateProfilePatterns(p, { structuredFailure: undefined }), null);
    assert.equal(evaluateProfilePatterns(p, { structuredFailure: null }), null);
    assert.equal(evaluateProfilePatterns(p, { structuredFailure: { kind: "jest-json" } }), null);
    assert.equal(evaluateProfilePatterns(p, { structuredFailure: "some string" }), null);
  });

  it("returns null when structured failure has no uncaughtErrors", () => {
    const p = profileWithBuiltins();
    assert.equal(evaluateProfilePatterns(p, { structuredFailure: BASE }), null);
  });

  it("classifies uncaught browser errors to browser-runtime-error", () => {
    const payload: StructuredFailure = {
      ...BASE,
      uncaughtErrors: [
        {
          message: "TypeError: Cannot read properties of undefined (reading 'itemId')",
          inTest: "shows modal with widget content",
        },
      ],
    };
    const result = evaluateProfilePatterns(profileWithBuiltins(), { structuredFailure: payload });
    assert.ok(result);
    assert.equal(result!.domain, "browser-runtime-error");
    assert.equal(result!.source, "contract");
    assert.match(result!.reason, /shows modal with widget content/);
    assert.match(result!.reason, /itemId/);
  });

  it("truncates very long uncaught error messages in the reason", () => {
    const payload: StructuredFailure = {
      ...BASE,
      uncaughtErrors: [{ message: "X".repeat(500), inTest: "t" }],
    };
    const result = evaluateProfilePatterns(profileWithBuiltins(), { structuredFailure: payload });
    assert.ok(result);
    assert.ok(result!.reason.length < 260);
  });
});

describe("evaluateProfilePatterns — raw-regex built-ins (spec-schema-violation)", () => {
  const ACC_PATH = "/repo/apps/x/.dagent/feat/_kickoff/acceptance.yml";

  it("routes Zod schema violations to schema-violation", () => {
    const msg =
      `spec-compiler produced an invalid acceptance contract at ${ACC_PATH}: ` +
      `[acceptance:${ACC_PATH}] schema violation: required_flows.4.steps: Invalid input: expected array, received undefined`;
    const r = evaluateProfilePatterns(profileWithBuiltins(), { rawError: msg });
    assert.ok(r);
    assert.equal(r!.domain, "schema-violation");
    assert.equal(r!.source, "contract");
    assert.match(r!.reason, /invalid ACCEPTANCE contract/i);
  });

  it("routes YAML parse errors to schema-violation", () => {
    const msg =
      `spec-compiler produced an invalid acceptance contract at ${ACC_PATH}: ` +
      `[acceptance:${ACC_PATH}] YAML parse error: end of the stream or a document separator is expected`;
    const r = evaluateProfilePatterns(profileWithBuiltins(), { rawError: msg });
    assert.ok(r);
    assert.equal(r!.domain, "schema-violation");
  });

  it("routes missing-file failures to schema-violation", () => {
    const msg =
      `spec-compiler reported success but did not produce ${ACC_PATH}. ` +
      `The acceptance contract is required for downstream nodes.`;
    const r = evaluateProfilePatterns(profileWithBuiltins(), { rawError: msg });
    assert.ok(r);
    assert.equal(r!.domain, "schema-violation");
  });

  it("does NOT match e2e-runner output that merely mentions .yml", () => {
    const msg =
      `TimeoutError: locator.waitFor: Timeout 5000ms exceeded.\n` +
      `  at some/path/file.yml:12:5\n` +
      `  waiting for getByTestId('widget-modal') to be visible`;
    assert.equal(evaluateProfilePatterns(profileWithBuiltins(), { rawError: msg }), null);
  });

  it("does NOT match unrelated dev-node errors", () => {
    const p = profileWithBuiltins();
    assert.equal(evaluateProfilePatterns(p, { rawError: "ReferenceError: foo is not defined" }), null);
    assert.equal(evaluateProfilePatterns(p, { rawError: "" }), null);
    assert.equal(evaluateProfilePatterns(p, { rawError: "session.idle timeout" }), null);
  });

  it("truncates the reason line to stay compact", () => {
    const long = "A".repeat(1000);
    const msg =
      `spec-compiler produced an invalid acceptance contract at ${ACC_PATH}: ${long}`;
    const r = evaluateProfilePatterns(profileWithBuiltins(), { rawError: msg });
    assert.ok(r);
    assert.ok(r!.reason.length < 400);
  });
});

describe("evaluateProfilePatterns — producer-side declared-output faults", () => {
  it("routes `missing_required_output` text to schema-violation (singular)", () => {
    // Verbatim message shape from
    // `loop/dispatch/item-dispatch.ts` when a node declared
    // `produces_artifacts: [debug-notes]` but emitted nothing.
    const msg =
      "Node declared `produces_artifacts` kind `debug-notes` but no file " +
      "materialised at its canonical invocation path.";
    const r = evaluateProfilePatterns(profileWithBuiltins(), { rawError: msg });
    assert.ok(r, "should classify");
    assert.equal(r!.domain, "schema-violation");
    assert.equal(r!.source, "contract");
    assert.match(r!.reason, /did not emit/i);
  });

  it("routes `missing_required_output` text to schema-violation (plural)", () => {
    const msg =
      "Node declared `produces_artifacts` kinds [a, b] but none materialised " +
      "at their canonical invocation paths.";
    const r = evaluateProfilePatterns(profileWithBuiltins(), { rawError: msg });
    assert.ok(r);
    assert.equal(r!.domain, "schema-violation");
  });

  it("routes `invalid_envelope_output` text to schema-violation", () => {
    // Verbatim shape from item-dispatch.ts envelope gate.
    const msg =
      "Node declared `produces_artifacts` kind `change-manifest` but its " +
      "output is missing the envelope under strict_artifacts: " +
      "Artifact 'change-manifest' at /repo/x.json failed schema validation: " +
      "envelope.schemaVersion: Invalid input: expected number, received undefined";
    const r = evaluateProfilePatterns(profileWithBuiltins(), { rawError: msg });
    assert.ok(r);
    assert.equal(r!.domain, "schema-violation");
    assert.match(r!.reason, /envelope/i);
  });

  it("does NOT match unrelated mentions of `produces_artifacts`", () => {
    // Free-text mention without the canonical "no file materialised" /
    // "missing the envelope" phrasing should not classify.
    const msg = "diagnostic: see produces_artifacts spec for details";
    assert.equal(evaluateProfilePatterns(profileWithBuiltins(), { rawError: msg }), null);
  });
});

describe("evaluateProfilePatterns — contract-testid timeout rule", () => {
  it("classifies a timeout on a contract-declared testid to frontend", () => {
    const payload: StructuredFailure = {
      ...BASE,
      failedTests: [{
        title: "shows the widget modal",
        file: "e2e/feat.spec.ts",
        line: 42,
        error: "TimeoutError: locator.waitFor: Timeout 30000ms exceeded",
        stackHead: "at getByTestId('widget-modal').waitFor()",
      }],
    };
    const acceptance = {
      required_dom: [{ testid: "widget-modal", description: "main modal" }],
    } as any;
    const r = evaluateProfilePatterns(profileWithBuiltins(), {
      structuredFailure: payload,
      acceptance,
    });
    assert.ok(r);
    assert.equal(r!.domain, "frontend");
    assert.match(r!.reason, /widget-modal/);
  });

  it("returns null when timed-out testid is not in the contract", () => {
    const payload: StructuredFailure = {
      ...BASE,
      failedTests: [{
        title: "t",
        file: "e2e/f.spec.ts",
        line: 1,
        error: "TimeoutError waiting for getByTestId('unlisted')",
        stackHead: "",
      }],
    };
    const acceptance = { required_dom: [{ testid: "widget-modal" }] } as any;
    assert.equal(
      evaluateProfilePatterns(profileWithBuiltins(), { structuredFailure: payload, acceptance }),
      null,
    );
  });
});

describe("evaluateProfilePatterns — custom patterns", () => {
  it("first match wins across the ordered pattern list", () => {
    const profile: CompiledTriageProfile = {
      llm_fallback: false,
      max_reroutes: 5,
      routing: { "catalog-data": {}, "mrt-deploy-auth": {} },
      domains: ["catalog-data", "mrt-deploy-auth"],
      patterns: [
        {
          match_kind: "raw-regex",
          pattern: "Invalid catalog entry:",
          domain: "catalog-data",
          reason_template: "SFCC catalog integrity error: ${errFirstLine}",
        },
        {
          match_kind: "raw-regex",
          pattern: "unauthorized_client",
          domain: "mrt-deploy-auth",
        },
      ],
      evidence_enrichment: true,
      baseline_noise_filter: true,
      signatures: [],
    };
    const r = evaluateProfilePatterns(profile, {
      rawError: "Invalid catalog entry: SKU=ABC not found\nunauthorized_client",
    });
    assert.ok(r);
    assert.equal(r!.domain, "catalog-data");
    assert.match(r!.reason, /SFCC catalog integrity/);
  });

  it("returns null for profile with no patterns", () => {
    const profile: CompiledTriageProfile = {
      llm_fallback: true,
      max_reroutes: 5,
      routing: {},
      domains: [],
      patterns: [],
      evidence_enrichment: true,
      baseline_noise_filter: true,
      signatures: [],
    };
    assert.equal(
      evaluateProfilePatterns(profile, { rawError: "anything" }),
      null,
    );
  });
});

// ---------------------------------------------------------------------------
// 🆁3 — `json-path` arm
// ---------------------------------------------------------------------------

describe("evaluateProfilePatterns — json-path arm", () => {
  it("reaches parity with the uncaughtErrors.nonEmpty built-in", () => {
    const profile: CompiledTriageProfile = {
      llm_fallback: false,
      max_reroutes: 5,
      routing: { "browser-runtime-error": {} },
      domains: ["browser-runtime-error"],
      patterns: [
        {
          match_kind: "json-path",
          format: "playwright-json",
          path: "$.uncaughtErrors[*].message",
          op: "nonEmpty",
          domain: "browser-runtime-error",
          reason_template: 'Uncaught in "${inTest}": ${firstMsg}',
          capture: {
            firstMsg: "$.uncaughtErrors[0].message",
            inTest: "$.uncaughtErrors[0].inTest",
          },
        },
      ],
      evidence_enrichment: true,
      baseline_noise_filter: true,
      signatures: [],
    };
    const payload: StructuredFailure = {
      ...BASE,
      uncaughtErrors: [
        { message: "TypeError: itemId undefined", inTest: "shows modal" },
      ],
    };
    const r = evaluateProfilePatterns(profile, { structuredFailure: payload });
    assert.ok(r);
    assert.equal(r!.domain, "browser-runtime-error");
    assert.equal(r!.source, "contract");
    assert.equal(r!.reason, 'Uncaught in "shows modal": TypeError: itemId undefined');
  });

  it("populates reason_template variables via capture selectors on a regex op", () => {
    const profile: CompiledTriageProfile = {
      llm_fallback: false,
      max_reroutes: 5,
      routing: { "mrt-runtime": {} },
      domains: ["mrt-runtime"],
      patterns: [
        {
          match_kind: "json-path",
          format: "playwright-json",
          path: "$.uncaughtErrors[*].message",
          op: "regex",
          value: "Managed Runtime",
          domain: "mrt-runtime",
          reason_template: "MRT error in ${inTest}: ${firstMsg}",
          capture: {
            firstMsg: "$.uncaughtErrors[0].message",
            inTest: "$.uncaughtErrors[0].inTest",
          },
        },
      ],
      evidence_enrichment: true,
      baseline_noise_filter: true,
      signatures: [],
    };
    const payload: StructuredFailure = {
      ...BASE,
      uncaughtErrors: [
        { message: "Managed Runtime: catalog lookup failed", inTest: "PDP renders" },
      ],
    };
    const r = evaluateProfilePatterns(profile, { structuredFailure: payload });
    assert.ok(r);
    assert.equal(r!.domain, "mrt-runtime");
    assert.equal(r!.reason, "MRT error in PDP renders: Managed Runtime: catalog lookup failed");
  });

  it("first match wins across mixed arms (structured-field before json-path)", () => {
    // structured-field built-in fires on uncaughtErrors before the
    // json-path pattern below gets a chance, proving ordering is
    // preserved regardless of arm.
    const profile: CompiledTriageProfile = {
      llm_fallback: false,
      max_reroutes: 5,
      routing: { "browser-runtime-error": {}, "mrt-runtime": {} },
      domains: ["browser-runtime-error", "mrt-runtime"],
      patterns: [
        {
          match_kind: "structured-field",
          format: "playwright-json",
          when: "uncaughtErrors.nonEmpty",
          domain: "browser-runtime-error",
        },
        {
          match_kind: "json-path",
          format: "playwright-json",
          path: "$.uncaughtErrors[*].message",
          op: "nonEmpty",
          domain: "mrt-runtime",
        },
      ],
      evidence_enrichment: true,
      baseline_noise_filter: true,
      signatures: [],
    };
    const payload: StructuredFailure = {
      ...BASE,
      uncaughtErrors: [{ message: "boom", inTest: "t" }],
    };
    const r = evaluateProfilePatterns(profile, { structuredFailure: payload });
    assert.ok(r);
    assert.equal(r!.domain, "browser-runtime-error");
  });

  it("evaluates json-path profiles with no built-ins (builtin_patterns: false parity)", () => {
    // Simulates a profile compiled with `builtin_patterns: false` where
    // all detection is expressed as json-path declaratives. Evaluation
    // order is still first-match-wins; falls through to null if no
    // pattern matches.
    const profile: CompiledTriageProfile = {
      llm_fallback: false,
      max_reroutes: 5,
      routing: { "mrt-runtime": {}, "frontend": {} },
      domains: ["mrt-runtime", "frontend"],
      patterns: [
        {
          match_kind: "json-path",
          format: "playwright-json",
          path: "$.uncaughtErrors[*].message",
          op: "contains",
          value: "Managed Runtime",
          domain: "mrt-runtime",
        },
        {
          match_kind: "json-path",
          format: "playwright-json",
          path: "$.failedTests[*].error",
          op: "regex",
          value: "Timeout \\d+ms exceeded",
          domain: "frontend",
        },
      ],
      evidence_enrichment: true,
      baseline_noise_filter: true,
      signatures: [],
    };

    // Case 1: the second pattern wins because the first does not match.
    const payloadA: StructuredFailure = {
      ...BASE,
      failedTests: [{
        title: "t",
        file: "a.spec.ts",
        line: 1,
        error: "TimeoutError: locator.waitFor: Timeout 30000ms exceeded",
        stackHead: "",
      }],
    };
    const rA = evaluateProfilePatterns(profile, { structuredFailure: payloadA });
    assert.ok(rA);
    assert.equal(rA!.domain, "frontend");

    // Case 2: no pattern matches → null (triage falls through to RAG/LLM).
    assert.equal(
      evaluateProfilePatterns(profile, { structuredFailure: { ...BASE } }),
      null,
    );
  });
});

