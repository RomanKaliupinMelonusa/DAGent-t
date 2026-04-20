/**
 * triage/__tests__/contract-classifier.test.ts — Deterministic
 * structured-failure pre-classifier. See ../contract-classifier.ts.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { classifyStructuredFailure, classifyRawError, BROWSER_RUNTIME_ERROR_DOMAIN, SPEC_SCHEMA_VIOLATION_DOMAIN } from "../contract-classifier.js";
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

describe("classifyStructuredFailure", () => {
  it("returns null for undefined/null/non-playwright payloads", () => {
    assert.equal(classifyStructuredFailure(undefined), null);
    assert.equal(classifyStructuredFailure(null), null);
    assert.equal(classifyStructuredFailure({ kind: "jest-json" }), null);
    assert.equal(classifyStructuredFailure("some string"), null);
  });

  it("returns null when structured failure has no uncaughtErrors", () => {
    assert.equal(classifyStructuredFailure(BASE), null);
  });

  it("classifies uncaught browser errors to browser-runtime-error", () => {
    const payload: StructuredFailure = {
      ...BASE,
      uncaughtErrors: [
        {
          message: "TypeError: Cannot read properties of undefined (reading 'masterId')",
          inTest: "shows modal with product content",
        },
      ],
    };
    const result = classifyStructuredFailure(payload);
    assert.ok(result);
    assert.equal(result!.domain, BROWSER_RUNTIME_ERROR_DOMAIN);
    assert.equal(result!.source, "rag");
    assert.match(result!.reason, /shows modal with product content/);
    assert.match(result!.reason, /masterId/);
  });

  it("truncates very long uncaught error messages in the reason", () => {
    const payload: StructuredFailure = {
      ...BASE,
      uncaughtErrors: [{ message: "X".repeat(500), inTest: "t" }],
    };
    const result = classifyStructuredFailure(payload);
    assert.ok(result);
    // Reason should stay compact (prefix + 200 chars of error + quote chars).
    assert.ok(result!.reason.length < 260);
  });
});

describe("classifyRawError — spec-compiler schema violations", () => {
  const ACC_PATH = "/repo/apps/x/in-progress/feat_ACCEPTANCE.yml";

  it("routes Zod schema violations to schema-violation", () => {
    const msg =
      `spec-compiler produced an invalid acceptance contract at ${ACC_PATH}: ` +
      `[acceptance:${ACC_PATH}] schema violation: required_flows.4.steps: Invalid input: expected array, received undefined`;
    const r = classifyRawError(msg);
    assert.ok(r);
    assert.equal(r!.domain, SPEC_SCHEMA_VIOLATION_DOMAIN);
    assert.equal(r!.source, "rag");
    assert.match(r!.reason, /invalid ACCEPTANCE contract/i);
  });

  it("routes YAML parse errors to schema-violation", () => {
    const msg =
      `spec-compiler produced an invalid acceptance contract at ${ACC_PATH}: ` +
      `[acceptance:${ACC_PATH}] YAML parse error: end of the stream or a document separator is expected`;
    const r = classifyRawError(msg);
    assert.ok(r);
    assert.equal(r!.domain, SPEC_SCHEMA_VIOLATION_DOMAIN);
  });

  it("routes missing-file failures to schema-violation", () => {
    const msg =
      `spec-compiler reported success but did not produce ${ACC_PATH}. ` +
      `The acceptance contract is required for downstream nodes.`;
    const r = classifyRawError(msg);
    assert.ok(r);
    assert.equal(r!.domain, SPEC_SCHEMA_VIOLATION_DOMAIN);
  });

  it("does NOT match e2e-runner output that merely mentions .yml", () => {
    const msg =
      `TimeoutError: locator.waitFor: Timeout 5000ms exceeded.\n` +
      `  at some/path/file.yml:12:5\n` +
      `  waiting for getByTestId('quick-view-modal') to be visible`;
    assert.equal(classifyRawError(msg), null);
  });

  it("does NOT match unrelated storefront-dev errors", () => {
    assert.equal(classifyRawError("ReferenceError: foo is not defined"), null);
    assert.equal(classifyRawError(""), null);
    assert.equal(classifyRawError("session.idle timeout"), null);
  });

  it("truncates the reason line to stay compact", () => {
    const long = "A".repeat(1000);
    const msg =
      `spec-compiler produced an invalid acceptance contract at ${ACC_PATH}: ${long}`;
    const r = classifyRawError(msg);
    assert.ok(r);
    assert.ok(r!.reason.length < 400);
  });
});
