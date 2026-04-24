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
import type { CompiledTriageProfile } from "../../apm/types.js";
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
  const ACC_PATH = "/repo/apps/x/in-progress/feat/_kickoff/acceptance.yml";

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
      signatures: [],
    };
    assert.equal(
      evaluateProfilePatterns(profile, { rawError: "anything" }),
      null,
    );
  });
});
