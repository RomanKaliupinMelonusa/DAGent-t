/**
 * triage/__tests__/contract-classifier.test.ts — Deterministic
 * structured-failure pre-classifier. See ../contract-classifier.ts.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { classifyStructuredFailure, BROWSER_RUNTIME_ERROR_DOMAIN } from "../contract-classifier.js";
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
