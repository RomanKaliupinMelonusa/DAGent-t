/**
 * triage.test.ts — Unit tests for structured JSON error triage.
 *
 * Uses Node.js built-in test runner (node:test) — zero dependencies.
 * Run: npx tsx src/__tests__/triage.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { triageFailure, parseTriageDiagnostic } from "../triage.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NO_NA = new Set<string>();

function makeJsonMsg(faultDomain: string, trace: string): string {
  return JSON.stringify({ fault_domain: faultDomain, diagnostic_trace: trace });
}

// ---------------------------------------------------------------------------
// parseTriageDiagnostic
// ---------------------------------------------------------------------------

describe("parseTriageDiagnostic", () => {
  it("parses valid backend diagnostic", () => {
    const msg = makeJsonMsg("backend", "API endpoint /api/jobs returns 500");
    const result = parseTriageDiagnostic(msg);
    assert.deepStrictEqual(result, {
      fault_domain: "backend",
      diagnostic_trace: "API endpoint /api/jobs returns 500",
    });
  });

  it("parses valid frontend diagnostic", () => {
    const msg = makeJsonMsg("frontend", "Element data-testid=modal not found");
    const result = parseTriageDiagnostic(msg);
    assert.equal(result?.fault_domain, "frontend");
    assert.equal(result?.diagnostic_trace, "Element data-testid=modal not found");
  });

  it("parses valid both diagnostic", () => {
    const msg = makeJsonMsg("both", "CORS error + error-banner visible");
    const result = parseTriageDiagnostic(msg);
    assert.equal(result?.fault_domain, "both");
  });

  it("parses valid environment diagnostic", () => {
    const msg = makeJsonMsg("environment", "az login required");
    const result = parseTriageDiagnostic(msg);
    assert.equal(result?.fault_domain, "environment");
  });

  it("returns null for plain text (not JSON)", () => {
    assert.equal(parseTriageDiagnostic("API endpoint /api/jobs returns 500"), null);
  });

  it("returns null for JSON missing fault_domain", () => {
    const msg = JSON.stringify({ diagnostic_trace: "something broke" });
    assert.equal(parseTriageDiagnostic(msg), null);
  });

  it("returns null for JSON missing diagnostic_trace", () => {
    const msg = JSON.stringify({ fault_domain: "backend" });
    assert.equal(parseTriageDiagnostic(msg), null);
  });

  it("returns null for invalid fault_domain value", () => {
    const msg = makeJsonMsg("infra", "terraform failed");
    assert.equal(parseTriageDiagnostic(msg), null);
  });

  it("returns null for non-string fault_domain", () => {
    const msg = JSON.stringify({ fault_domain: 42, diagnostic_trace: "test" });
    assert.equal(parseTriageDiagnostic(msg), null);
  });

  it("returns null for non-string diagnostic_trace", () => {
    const msg = JSON.stringify({ fault_domain: "backend", diagnostic_trace: 123 });
    assert.equal(parseTriageDiagnostic(msg), null);
  });

  it("returns null for JSON array", () => {
    assert.equal(parseTriageDiagnostic("[1,2,3]"), null);
  });

  it("returns null for JSON null", () => {
    assert.equal(parseTriageDiagnostic("null"), null);
  });

  it("returns null for empty string", () => {
    assert.equal(parseTriageDiagnostic(""), null);
  });
});

// ---------------------------------------------------------------------------
// triageFailure — structured JSON path
// ---------------------------------------------------------------------------

describe("triageFailure (structured JSON)", () => {
  it("backend fault_domain → resets backend-dev + backend-unit-test + itemKey", () => {
    const msg = makeJsonMsg("backend", "API returned 500");
    const keys = triageFailure("live-ui", msg, NO_NA);
    assert.deepStrictEqual(keys, ["backend-dev", "backend-unit-test", "live-ui"]);
  });

  it("frontend fault_domain → resets frontend-dev + frontend-unit-test + itemKey", () => {
    const msg = makeJsonMsg("frontend", "Button not clickable");
    const keys = triageFailure("live-ui", msg, NO_NA);
    assert.deepStrictEqual(keys, ["frontend-dev", "frontend-unit-test", "live-ui"]);
  });

  it("both fault_domain → resets all dev + test items + itemKey", () => {
    const msg = makeJsonMsg("both", "CORS error + UI error-banner");
    const keys = triageFailure("live-ui", msg, NO_NA);
    assert.deepStrictEqual(keys, [
      "backend-dev", "backend-unit-test",
      "frontend-dev", "frontend-unit-test",
      "live-ui",
    ]);
  });

  it("environment fault_domain → resets only itemKey (not a code bug)", () => {
    const msg = makeJsonMsg("environment", "az login required");
    const keys = triageFailure("live-ui", msg, NO_NA);
    assert.deepStrictEqual(keys, ["live-ui"]);
  });

  it("works with integration-test as itemKey", () => {
    const msg = makeJsonMsg("backend", "Missing endpoint /api/bulk");
    const keys = triageFailure("integration-test", msg, NO_NA);
    assert.deepStrictEqual(keys, ["backend-dev", "backend-unit-test", "integration-test"]);
  });

  it("filters out N/A items from structured path", () => {
    const msg = makeJsonMsg("both", "Mixed failure");
    const naItems = new Set(["frontend-dev", "frontend-unit-test"]);
    const keys = triageFailure("live-ui", msg, naItems);
    assert.deepStrictEqual(keys, ["backend-dev", "backend-unit-test", "live-ui"]);
  });

  it("environment filters out N/A itemKey", () => {
    const msg = makeJsonMsg("environment", "auth issue");
    const naItems = new Set(["live-ui"]);
    const keys = triageFailure("live-ui", msg, naItems);
    assert.deepStrictEqual(keys, []);
  });
});

// ---------------------------------------------------------------------------
// triageFailure — legacy keyword fallback
// ---------------------------------------------------------------------------

describe("triageFailure (keyword fallback)", () => {
  it("backend keywords → resets backend items", () => {
    const keys = triageFailure("live-ui", "API endpoint /api/jobs returns 500", NO_NA);
    assert.ok(keys.includes("backend-dev"));
    assert.ok(keys.includes("backend-unit-test"));
    assert.ok(keys.includes("live-ui"));
  });

  it("frontend keywords → resets frontend items", () => {
    const keys = triageFailure("live-ui", "UI component render failure", NO_NA);
    assert.ok(keys.includes("frontend-dev"));
    assert.ok(keys.includes("frontend-unit-test"));
    assert.ok(keys.includes("live-ui"));
  });

  it("mixed keywords → resets both domains", () => {
    const keys = triageFailure("live-ui", "API endpoint 500 and UI component broken", NO_NA);
    assert.ok(keys.includes("backend-dev"));
    assert.ok(keys.includes("frontend-dev"));
    assert.ok(keys.includes("live-ui"));
  });

  it("no matching keywords → resets everything including schema-dev", () => {
    const keys = triageFailure("live-ui", "something totally unknown broke", NO_NA);
    assert.ok(keys.includes("schema-dev"));
    assert.ok(keys.includes("backend-dev"));
    assert.ok(keys.includes("backend-unit-test"));
    assert.ok(keys.includes("frontend-dev"));
    assert.ok(keys.includes("frontend-unit-test"));
    assert.ok(keys.includes("live-ui"));
  });

  it("environment keywords → only resets itemKey", () => {
    const keys = triageFailure("live-ui", "az login required, credentials missing", NO_NA);
    assert.deepStrictEqual(keys, ["live-ui"]);
  });

  it("poll timeout keywords → only resets itemKey (not a code bug)", () => {
    const keys = triageFailure("poll-ci", "⏳ CI is still running. Exiting poll to prevent Copilot timeout.", NO_NA);
    assert.deepStrictEqual(keys, ["poll-ci"]);
  });

  it("schema keywords → resets schema-dev + all downstream dev/test items", () => {
    const keys = triageFailure("poll-ci", "FAIL packages/schemas/src/__tests__/auth.test.ts", NO_NA);
    assert.ok(keys.includes("schema-dev"));
    assert.ok(keys.includes("backend-dev"));
    assert.ok(keys.includes("backend-unit-test"));
    assert.ok(keys.includes("frontend-dev"));
    assert.ok(keys.includes("frontend-unit-test"));
    assert.ok(keys.includes("poll-ci"));
  });

  it("poll-ci.sh status line 'workflows' does NOT trigger cicd path", () => {
    // poll-ci.sh prints "All CI workflows completed" — must not match cicdSignals
    const keys = triageFailure("poll-ci", "✔ All CI workflows completed.\n❌ FAILED: CI Integration (run 123)\nFAIL some unknown test error", NO_NA);
    // Should fall through to reset-everything (no specific backend/frontend/cicd/schema signal)
    assert.ok(keys.includes("schema-dev"));
    assert.ok(keys.includes("backend-dev"));
    assert.ok(keys.includes("frontend-dev"));
    assert.ok(keys.includes("poll-ci"));
  });

  it("filters out N/A items in keyword fallback", () => {
    const naItems = new Set(["backend-dev", "backend-unit-test"]);
    const keys = triageFailure("live-ui", "API endpoint 500 and UI component broken", naItems);
    assert.ok(!keys.includes("backend-dev"));
    assert.ok(!keys.includes("backend-unit-test"));
    assert.ok(keys.includes("frontend-dev"));
    assert.ok(keys.includes("live-ui"));
  });
});

// ---------------------------------------------------------------------------
// Zod schema edge cases — verify the Zod-backed parser handles edge cases
// that the manual implementation also handled.
// ---------------------------------------------------------------------------

describe("parseTriageDiagnostic (Zod edge cases)", () => {
  it("accepts extra properties without failing (strips them)", () => {
    const msg = JSON.stringify({
      fault_domain: "backend",
      diagnostic_trace: "API 500",
      extra_field: "should be ignored",
    });
    const result = parseTriageDiagnostic(msg);
    assert.ok(result);
    assert.equal(result.fault_domain, "backend");
    assert.equal(result.diagnostic_trace, "API 500");
    // Extra field is stripped by Zod default behavior
    assert.equal("extra_field" in result, false);
  });

  it("rejects empty diagnostic_trace", () => {
    const msg = makeJsonMsg("backend", "");
    assert.equal(parseTriageDiagnostic(msg), null);
  });

  it("rejects fault_domain with leading/trailing whitespace", () => {
    const msg = JSON.stringify({ fault_domain: " backend ", diagnostic_trace: "test" });
    assert.equal(parseTriageDiagnostic(msg), null);
  });
});

// ---------------------------------------------------------------------------
// triageFailure — malformed JSON falls back to keywords
// ---------------------------------------------------------------------------

describe("triageFailure (malformed JSON → keyword fallback)", () => {
  it("valid JSON but missing fault_domain → falls back to keywords", () => {
    const msg = JSON.stringify({ diagnostic_trace: "API endpoint 500 error" });
    const keys = triageFailure("live-ui", msg, NO_NA);
    // Should still detect backend keywords in the stringified JSON
    assert.ok(keys.includes("live-ui"));
  });

  it("valid JSON with invalid fault_domain → falls back to keywords", () => {
    const msg = makeJsonMsg("infra", "terraform failed, backend issue");
    const keys = triageFailure("live-ui", msg, NO_NA);
    assert.ok(keys.includes("live-ui"));
    // Keyword matching on the full stringified message should pick up "backend"
    assert.ok(keys.includes("backend-dev"));
  });

  it("JSON array → falls back to keywords", () => {
    const keys = triageFailure("live-ui", '[{"error": "frontend component missing"}]', NO_NA);
    assert.ok(keys.includes("frontend-dev"));
    assert.ok(keys.includes("live-ui"));
  });
});

// ---------------------------------------------------------------------------
// triageFailure — IAM/permission env signals (Fix 6c)
// ---------------------------------------------------------------------------

describe("triageFailure (IAM/permission env signals)", () => {
  it("routes authorization_requestdenied as environment (keyword fallback)", () => {
    const result = triageFailure("poll-ci", "Authorization_RequestDenied: 403 on azuread_application.main", NO_NA);
    assert.deepStrictEqual(result, ["poll-ci"]);
  });

  it("routes insufficient privileges as environment (keyword fallback)", () => {
    const result = triageFailure("poll-ci", "403 Forbidden: Insufficient privileges to register application", NO_NA);
    assert.deepStrictEqual(result, ["poll-ci"]);
  });

  it("routes 'access is denied' as environment (keyword fallback)", () => {
    const result = triageFailure("integration-test", "Access is denied: service principal lacks permissions", NO_NA);
    assert.deepStrictEqual(result, ["integration-test"]);
  });

  it("does NOT route CORS 403 as environment (should route as backend)", () => {
    const result = triageFailure("live-ui", "CORS error: 403 Forbidden on OPTIONS /api/endpoint", NO_NA);
    // Should NOT classify as environment — should match backend signals (cors, api, endpoint)
    assert.ok(result.includes("backend-dev"), `Expected backend-dev in: ${result}`);
    assert.ok(!result.every(k => k === "live-ui"), "Should not be environment-only");
  });
});

// ---------------------------------------------------------------------------
// triageFailure — frontend+infra / backend+infra fault domains (Fix 7a)
// ---------------------------------------------------------------------------

describe("triageFailure (compound fault domains)", () => {
  it("routes frontend+infra to frontend-dev + frontend-unit-test", () => {
    const msg = makeJsonMsg("frontend+infra", "APIM route mismatch");
    const result = triageFailure("live-ui", msg, NO_NA);
    assert.deepStrictEqual(result, ["frontend-dev", "frontend-unit-test", "live-ui"]);
  });

  it("routes backend+infra to backend-dev + backend-unit-test", () => {
    const msg = makeJsonMsg("backend+infra", "Function app missing env var");
    const result = triageFailure("integration-test", msg, NO_NA);
    assert.deepStrictEqual(result, ["backend-dev", "backend-unit-test", "integration-test"]);
  });

  it("filters N/A items from frontend+infra", () => {
    const msg = makeJsonMsg("frontend+infra", "CORS misconfigured");
    const na = new Set(["frontend-unit-test"]);
    const result = triageFailure("live-ui", msg, na);
    assert.deepStrictEqual(result, ["frontend-dev", "live-ui"]);
  });
});
