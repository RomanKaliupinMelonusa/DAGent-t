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
    // "exiting poll to prevent" is kept as defense-in-depth for exit code 2 leaks.
    // "ci is still running" was REMOVED to prevent triage poisoning (see below).
    const keys = triageFailure("poll-ci", "⏳ Exiting poll to prevent Copilot timeout.", NO_NA);
    assert.deepStrictEqual(keys, ["poll-ci"]);
  });

  it("manually cancelled CI run → only resets itemKey (not a code bug)", () => {
    const keys = triageFailure("poll-ci", "❌ ERROR: One or more CI workflows were manually cancelled.\nCI_RUN_CANCELLED_MANUALLY", NO_NA);
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

// ---------------------------------------------------------------------------
// triageFailure — directory-path-based CI error routing (Fix: triage poisoning)
// ---------------------------------------------------------------------------

describe("triageFailure (directory-path routing)", () => {
  it("backend directory path → routes to backend-dev", () => {
    // Pure CI error content — no polling noise (file-based diagnostic handoff)
    const ciLog = [
      "── Run 12345 ──────────────────────────────────────────────",
      "Backend — Lint, Test & Build\tType-check (tsc --noEmit)\t##[error]src/functions/fn-demo-login.ts(24,33): error TS2591: Cannot find name 'crypto'.",
      "Backend — Lint, Test & Build\tType-check (tsc --noEmit)\t##[error]Process completed with exit code 2.",
      "── End Run 12345 ──────────────────────────────────────────",
    ].join("\n");
    const keys = triageFailure("poll-ci", ciLog, NO_NA);
    assert.ok(keys.includes("backend-dev"), `Expected backend-dev in: ${keys}`);
    assert.ok(keys.includes("backend-unit-test"), `Expected backend-unit-test in: ${keys}`);
    assert.ok(keys.includes("poll-ci"));
  });

  it("frontend directory path → routes to frontend-dev", () => {
    const ciLog = [
      "── Run 12345 ──────────────────────────────────────────────",
      "Frontend — Lint, Test & Build\tLint\tnpm error path /home/runner/work/DAGent-t/DAGent-t/apps/sample-app/frontend",
      "Frontend — Lint, Test & Build\tLint\tESLint couldn't find an eslint.config file.",
      "── End Run 12345 ──────────────────────────────────────────",
    ].join("\n");
    const keys = triageFailure("poll-ci", ciLog, NO_NA);
    assert.ok(keys.includes("frontend-dev"), `Expected frontend-dev in: ${keys}`);
    assert.ok(keys.includes("frontend-unit-test"), `Expected frontend-unit-test in: ${keys}`);
    assert.ok(keys.includes("poll-ci"));
  });

  it("both backend + frontend directory paths → routes to both domains", () => {
    const ciLog = [
      "── Run 12345 ──────────────────────────────────────────────",
      "Backend — Lint, Test & Build\tType-check\t##[error]src/functions/fn-profile.ts(20,33): error TS2591",
      "── End Run 12345 ──────────────────────────────────────────",
      "── Run 67890 ──────────────────────────────────────────────",
      "Frontend — Lint, Test & Build\tLint\tnpm error path /apps/sample-app/frontend",
      "── End Run 67890 ──────────────────────────────────────────",
    ].join("\n");
    const keys = triageFailure("poll-ci", ciLog, NO_NA);
    assert.ok(keys.includes("backend-dev"), `Expected backend-dev in: ${keys}`);
    assert.ok(keys.includes("frontend-dev"), `Expected frontend-dev in: ${keys}`);
    assert.ok(keys.includes("poll-ci"));
  });

  it("no recognizable directory paths → resets everything (safe default)", () => {
    const ciLog = "Some completely opaque error with no file paths at all";
    const keys = triageFailure("poll-ci", ciLog, NO_NA);
    assert.ok(keys.includes("schema-dev"), `Expected schema-dev in: ${keys}`);
    assert.ok(keys.includes("backend-dev"), `Expected backend-dev in: ${keys}`);
    assert.ok(keys.includes("frontend-dev"), `Expected frontend-dev in: ${keys}`);
    assert.ok(keys.includes("poll-ci"));
  });

  it("schema directory path → routes to schema-dev + all downstream", () => {
    const ciLog = "FAIL /packages/schemas/src/__tests__/auth.test.ts";
    const keys = triageFailure("poll-ci", ciLog, NO_NA);
    assert.ok(keys.includes("schema-dev"), `Expected schema-dev in: ${keys}`);
    assert.ok(keys.includes("backend-dev"));
    assert.ok(keys.includes("frontend-dev"));
    assert.ok(keys.includes("poll-ci"));
  });
});

// ---------------------------------------------------------------------------
// triageFailure — triage poisoning regression (Fix: envSignal contamination)
// ---------------------------------------------------------------------------

describe("triageFailure (triage poisoning regression)", () => {
  // This is the EXACT scenario that caused the 6-cycle deadlock.
  // Previously, "ci is still running" in the polling status lines matched
  // envSignals and short-circuited all error analysis, returning only
  // ["poll-ci"]. Dev agents were never woken up.
  it("mixed polling noise + CI errors: routes to dev agents, NOT environment", () => {
    // Simulates the full stdout that poll-ci.sh produces: polling status
    // lines FOLLOWED BY actual CI failure content. With the file-based
    // diagnostic handoff, triage only sees the pure CI content. But even
    // if the full output were passed (fallback), this must not classify
    // as "environment" thanks to the envSignal fix.
    const fullPollOutput = [
      "Polling GitHub Actions for branch: feature/user-profile...",
      "⏳ CI is still running... sleeping 30 seconds.",
      "⏳ CI is still running... sleeping 30 seconds.",
      "✔ All CI workflows completed.",
      "❌ FAILED: CI Integration (run 23656485030) — conclusion: failure",
      "✔ PASSED: Deploy Backend (run 23656297813)",
      "✔ PASSED: Deploy Frontend (run 23656329829)",
      "❌ ERROR: One or more CI workflows failed! Check GitHub Actions.",
      "── Run 23656485030 ──────────────────────────────────────────────",
      "Backend — Lint, Test & Build\tType-check (tsc --noEmit)\t##[error]src/functions/fn-demo-login.ts(24,33): error TS2591: Cannot find name 'crypto'.",
      "Backend — Lint, Test & Build\tType-check (tsc --noEmit)\t##[error]src/functions/fn-demo-login.ts(36,16): error TS2591: Cannot find name 'Buffer'.",
      "Frontend — Lint, Test & Build\tLint\tnpm error path /home/runner/work/DAGent-t/DAGent-t/apps/sample-app/frontend",
      "Frontend — Lint, Test & Build\tLint\tESLint couldn't find an eslint.config.(js|mjs|cjs) file.",
      "── End Run 23656485030 ──────────────────────────────────────────",
    ].join("\n");

    const keys = triageFailure("poll-ci", fullPollOutput, NO_NA);

    // MUST route to dev agents — NOT just ["poll-ci"]
    assert.ok(keys.includes("backend-dev"), `Expected backend-dev in: ${keys}`);
    assert.ok(keys.includes("frontend-dev"), `Expected frontend-dev in: ${keys}`);
    assert.ok(keys.includes("poll-ci"));
    // Should NOT be environment-only (the old broken behavior)
    assert.ok(keys.length > 1, `Expected more than just poll-ci, got: ${keys}`);
  });

  it("pure CI diagnostic content (file-based handoff) routes correctly", () => {
    // This is what triage ACTUALLY sees with the file-based handoff —
    // just the CI failure logs, no polling noise.
    const pureDiagContent = [
      "── Run 23656485030 ──────────────────────────────────────────────",
      "Backend — Lint, Test & Build\tType-check (tsc --noEmit)\t##[error]src/functions/fn-demo-login.ts(24,33): error TS2591: Cannot find name 'crypto'.",
      "Backend — Lint, Test & Build\tType-check (tsc --noEmit)\t##[error]src/functions/fn-profile.ts(20,33): error TS2591: Cannot find name 'crypto'.",
      "Frontend — Lint, Test & Build\tLint\tnpm error path /home/runner/work/DAGent-t/DAGent-t/apps/sample-app/frontend",
      "Frontend — Lint, Test & Build\tLint\tESLint couldn't find an eslint.config file.",
      "── End Run 23656485030 ──────────────────────────────────────────",
    ].join("\n");

    const keys = triageFailure("poll-ci", pureDiagContent, NO_NA);
    assert.ok(keys.includes("backend-dev"), `Expected backend-dev in: ${keys}`);
    assert.ok(keys.includes("frontend-dev"), `Expected frontend-dev in: ${keys}`);
    assert.ok(keys.includes("poll-ci"));
  });

  it("'ci is still running' alone (no CI errors) no longer routes as environment", () => {
    // After removing "ci is still running" from envSignals, a message
    // containing only polling noise (no real errors) should fall through
    // to the "reset everything" default — which is safe. The exit code 2
    // boundary in session-runner.ts prevents this from reaching triage
    // in practice, but if it does, "reset everything" is better than
    // "do nothing" (the old deadlock behavior).
    const pollingOnly = "⏳ CI is still running... sleeping 30 seconds.\n⏳ CI is still running... sleeping 30 seconds.";
    const keys = triageFailure("poll-ci", pollingOnly, NO_NA);
    // Should NOT return just ["poll-ci"] (the old broken behavior)
    assert.ok(keys.length > 1, `Expected reset-everything, got: ${keys}`);
    assert.ok(keys.includes("poll-ci"));
  });
});
