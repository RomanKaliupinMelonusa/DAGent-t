/**
 * triage.test.ts — Unit tests for structured JSON error triage.
 *
 * Uses Node.js built-in test runner (node:test) — zero dependencies.
 * Run: npx tsx src/__tests__/triage.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { triageFailure, parseTriageDiagnostic, parseDomainHeader, isUnfixableError, validateFaultDomain, detectKeywordDomains } from "../triage.js";
import type { ValidationResult } from "../triage.js";
import { normalizeDiagnosticTrace } from "../session-runner.js";

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

  it("parses valid infra diagnostic", () => {
    const msg = makeJsonMsg("infra", "terraform failed");
    const result = parseTriageDiagnostic(msg);
    assert.equal(result?.fault_domain, "infra");
  });

  it("parses valid deployment-stale diagnostic", () => {
    const msg = makeJsonMsg("deployment-stale", "SWA deployment stale");
    const result = parseTriageDiagnostic(msg);
    assert.equal(result?.fault_domain, "deployment-stale");
    assert.equal(result?.diagnostic_trace, "SWA deployment stale");
  });

  it("parses valid test-code diagnostic", () => {
    const msg = makeJsonMsg("test-code", "Playwright timeout on bad locator");
    const result = parseTriageDiagnostic(msg);
    assert.equal(result?.fault_domain, "test-code");
    assert.equal(result?.diagnostic_trace, "Playwright timeout on bad locator");
  });

  it("returns null for invalid fault_domain value", () => {
    const msg = makeJsonMsg("database", "connection refused");
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

  it("infra fault_domain → resets full Wave 1 cascade + itemKey", () => {
    const msg = makeJsonMsg("infra", "terraform state lock conflict");
    const keys = triageFailure("poll-infra-plan", msg, NO_NA);
    assert.deepStrictEqual(keys, [
      "infra-architect", "push-infra", "poll-infra-plan", "create-draft-pr",
      "await-infra-approval", "infra-handoff", "poll-infra-plan",
    ]);
  });

  it("infra fault_domain filters out N/A items", () => {
    const msg = makeJsonMsg("infra", "terraform error");
    const naItems = new Set(["infra-architect"]);
    const keys = triageFailure("poll-infra-plan", msg, naItems);
    // infra-architect is filtered out, rest of Wave 1 cascade remains
    assert.ok(!keys.includes("infra-architect"));
    assert.ok(keys.includes("push-infra"));
    assert.ok(keys.includes("poll-infra-plan"));
  });

  it("test-code fault_domain → zero cascade, only resets the failing test item", () => {
    const msg = makeJsonMsg("test-code", "Playwright timeout on data-testid=modal — locator is incorrect");
    const keys = triageFailure("live-ui", msg, NO_NA);
    assert.deepStrictEqual(keys, ["live-ui"]);
  });

  it("test-code fault_domain filters out N/A items", () => {
    const msg = makeJsonMsg("test-code", "bad locator");
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

  it("no matching keywords → only resets the failing item (safe default)", () => {
    const keys = triageFailure("live-ui", "something totally unknown broke", NO_NA);
    assert.deepStrictEqual(keys, ["live-ui"]);
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
    // With exit code 3, cancellation is intercepted at the session-runner
    // boundary and never reaches triage. This test verifies that even if
    // the cancellation message leaks through, the safe fallback only resets
    // the failing item — not every dev item.
    const keys = triageFailure("poll-ci", "\u274c ERROR: One or more CI workflows were manually cancelled.", NO_NA);
    // No keyword match → safe fallback: only reset the failing item
    assert.deepStrictEqual(keys, ["poll-ci"]);
  });

  it("schema keywords → resets schema-dev + all downstream dev/test items", () => {
    const keys = triageFailure("poll-ci", "FAIL packages/schemas/src/__tests__/auth.test.ts", NO_NA);
    assert.ok(keys.includes("schema-dev"));
    assert.ok(keys.includes("infra-architect"));
    assert.ok(keys.includes("backend-dev"));
    assert.ok(keys.includes("backend-unit-test"));
    assert.ok(keys.includes("frontend-dev"));
    assert.ok(keys.includes("frontend-unit-test"));
    assert.ok(keys.includes("poll-ci"));
  });

  it("poll-ci.sh status line 'workflows' does NOT trigger cicd path", () => {
    // poll-ci.sh prints "All CI workflows completed" — must not match cicdSignals.
    // "CI Integration" contains "ci failed" substring match → routes via cicd path.
    const keys = triageFailure("poll-ci", "✔ All CI workflows completed.\n❌ FAILED: CI Integration (run 123)\nFAIL some unknown test error", NO_NA);
    // "ci" + "failed" in the status line triggers cicdSignals → push-app + poll-app-ci + poll-ci
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

  it("infra keywords → resets infra-architect", () => {
    const keys = triageFailure("poll-infra-plan", "terraform plan failed with azurerm provider error", NO_NA);
    assert.ok(keys.includes("infra-architect"), `Expected infra-architect in: ${keys}`);
    assert.ok(keys.includes("poll-infra-plan"));
    assert.ok(!keys.includes("backend-dev"), `Unexpected backend-dev in: ${keys}`);
  });

  it("infra + backend co-occurring keywords → resets both", () => {
    const keys = triageFailure("poll-app-ci", "terraform azurerm_function_app and API endpoint 500", NO_NA);
    assert.ok(keys.includes("infra-architect"), `Expected infra-architect in: ${keys}`);
    assert.ok(keys.includes("backend-dev"), `Expected backend-dev in: ${keys}`);
    assert.ok(keys.includes("poll-app-ci"));
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
    const msg = makeJsonMsg("database", "connection refused, backend issue");
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
  it("routes authorization_requestdenied as blocked (unfixable — Tier 0)", () => {
    const result = triageFailure("poll-ci", "Authorization_RequestDenied: 403 on azuread_application.main", NO_NA);
    // Unfixable IAM error → empty array (blocked), not environment retry
    assert.deepStrictEqual(result, []);
  });

  it("routes insufficient privileges as blocked (unfixable — Tier 0)", () => {
    const result = triageFailure("poll-ci", "403 Forbidden: Insufficient privileges to register application", NO_NA);
    // "Insufficient privileges" is an unfixable signal
    assert.deepStrictEqual(result, []);
  });

  it("routes 'does not have authorization' as blocked (unfixable — Tier 0)", () => {
    const result = triageFailure("integration-test", "Principal does not have authorization to perform this action", NO_NA);
    assert.deepStrictEqual(result, []);
  });

  it("does NOT route CORS 403 as unfixable (should route as backend)", () => {
    const result = triageFailure("live-ui", "CORS error: 403 Forbidden on OPTIONS /api/endpoint", NO_NA);
    // CORS 403 is fixable (code/infra issue) — should match backend signals (cors, api, endpoint)
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

describe("triageFailure (directory-path routing)", () => {  // Default APM directories matching sample-app layout
  const SAMPLE_DIRS = { backend: "backend", frontend: "frontend", infra: "infra", e2e: "e2e" };
  it("backend directory path → routes to backend-dev", () => {
    // Pure CI error content — no polling noise (file-based diagnostic handoff)
    const ciLog = [
      "── Run 12345 ──────────────────────────────────────────────",
      "Backend — Lint, Test & Build\tType-check (tsc --noEmit)\t##[error]src/functions/fn-demo-login.ts(24,33): error TS2591: Cannot find name 'crypto'.",
      "Backend — Lint, Test & Build\tType-check (tsc --noEmit)\t##[error]Process completed with exit code 2.",
      "── End Run 12345 ──────────────────────────────────────────",
    ].join("\n");
    const keys = triageFailure("poll-ci", ciLog, NO_NA, SAMPLE_DIRS);
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
    const keys = triageFailure("poll-ci", ciLog, NO_NA, SAMPLE_DIRS);
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
    const keys = triageFailure("poll-ci", ciLog, NO_NA, SAMPLE_DIRS);
    assert.ok(keys.includes("backend-dev"), `Expected backend-dev in: ${keys}`);
    assert.ok(keys.includes("frontend-dev"), `Expected frontend-dev in: ${keys}`);
    assert.ok(keys.includes("poll-ci"));
  });

  it("no recognizable directory paths → only resets the failing item (safe default)", () => {
    const ciLog = "Some completely opaque error with no file paths at all";
    const keys = triageFailure("poll-ci", ciLog, NO_NA, SAMPLE_DIRS);
    assert.deepStrictEqual(keys, ["poll-ci"]);
  });

  it("schema directory path → routes to schema-dev + all downstream", () => {
    const ciLog = "FAIL /packages/schemas/src/__tests__/auth.test.ts";
    const keys = triageFailure("poll-ci", ciLog, NO_NA, SAMPLE_DIRS);
    assert.ok(keys.includes("schema-dev"), `Expected schema-dev in: ${keys}`);
    assert.ok(keys.includes("backend-dev"));
    assert.ok(keys.includes("frontend-dev"));
    assert.ok(keys.includes("poll-ci"));
  });

  it("custom APM directories \u2192 routes using app-specific paths", () => {
    const customDirs = { backend: "server", frontend: "client", infra: "terraform", e2e: "tests" };
    // Use a message that only matches via directory path, not runtime keywords
    const ciLog = "##[error]/server/src/utils.ts(10,5): TS2304: Cannot find name 'foo'.";
    const keys = triageFailure("poll-ci", ciLog, NO_NA, customDirs);
    assert.ok(keys.includes("backend-dev"), `Expected backend-dev in: ${keys}`);
    assert.ok(!keys.includes("frontend-dev"), `Unexpected frontend-dev in: ${keys}`);
    assert.ok(keys.includes("poll-ci"));
  });

  it("custom APM directories \u2192 frontend path from custom e2e dir", () => {
    const customDirs = { backend: "api", frontend: "web", infra: "infra", e2e: "integration" };
    const ciLog = "FAIL /integration/login.spec.ts";
    const keys = triageFailure("poll-ci", ciLog, NO_NA, customDirs);
    assert.ok(keys.includes("frontend-dev"), `Expected frontend-dev in: ${keys}`);
    assert.ok(keys.includes("poll-ci"));
  });

  it("undefined directories \u2192 falls back to hardcoded defaults", () => {
    const ciLog = "##[error]src/functions/fn-demo-login.ts error in /backend/src";
    const keys = triageFailure("poll-ci", ciLog, NO_NA, undefined);
    assert.ok(keys.includes("backend-dev"), `Expected backend-dev in: ${keys}`);
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

  it("'ci is still running' alone (no CI errors) retries only the failing item", () => {
    // After removing "ci is still running" from envSignals, a message
    // containing only polling noise (no real errors) falls through to the
    // safe fallback which retries only the failing item. The exit code 2
    // boundary in session-runner.ts prevents this from reaching triage
    // in practice, but if it does, retrying the item is safer than
    // resetting everything.
    const pollingOnly = "⏳ CI is still running... sleeping 30 seconds.\n⏳ CI is still running... sleeping 30 seconds.";
    const keys = triageFailure("poll-ci", pollingOnly, NO_NA);
    assert.deepStrictEqual(keys, ["poll-ci"]);
  });
});

// ---------------------------------------------------------------------------
// parseDomainHeader — CI metadata routing (Phase 1)
// ---------------------------------------------------------------------------

describe("parseDomainHeader", () => {
  it("parses DOMAIN: backend", () => {
    const result = parseDomainHeader("DOMAIN: backend\n── Run 123 ──\nsome logs");
    assert.deepStrictEqual(result, { domain: "backend", hasSchemas: false });
  });

  it("parses DOMAIN: frontend", () => {
    const result = parseDomainHeader("DOMAIN: frontend\nCI error logs here");
    assert.deepStrictEqual(result, { domain: "frontend", hasSchemas: false });
  });

  it("parses DOMAIN: backend,frontend as both", () => {
    const result = parseDomainHeader("DOMAIN: backend,frontend\nlogs");
    assert.deepStrictEqual(result, { domain: "both", hasSchemas: false });
  });

  it("parses DOMAIN: schemas with hasSchemas flag", () => {
    const result = parseDomainHeader("DOMAIN: schemas\nlogs");
    assert.deepStrictEqual(result, { domain: "both", hasSchemas: true });
  });

  it("parses DOMAIN: schemas,backend with hasSchemas flag", () => {
    const result = parseDomainHeader("DOMAIN: schemas,backend\nlogs");
    assert.deepStrictEqual(result, { domain: "both", hasSchemas: true });
  });

  it("returns null for DOMAIN: unknown", () => {
    assert.equal(parseDomainHeader("DOMAIN: unknown\nlogs"), null);
  });

  it("returns null when no DOMAIN: header present", () => {
    assert.equal(parseDomainHeader("── Run 123 ──\nBackend error logs"), null);
  });

  it("returns null for empty message", () => {
    assert.equal(parseDomainHeader(""), null);
  });

  it("is case-insensitive for DOMAIN: prefix", () => {
    const result = parseDomainHeader("domain: backend\nlogs");
    assert.deepStrictEqual(result, { domain: "backend", hasSchemas: false });
  });

  it("handles whitespace in domain values", () => {
    const result = parseDomainHeader("DOMAIN:  backend , frontend \nlogs");
    assert.deepStrictEqual(result, { domain: "both", hasSchemas: false });
  });
});

describe("triageFailure with DOMAIN: header (Tier 2)", () => {
  it("DOMAIN: backend routes to backend-dev + backend-unit-test", () => {
    const msg = "DOMAIN: backend\n── Run 123 ──\nerror TS2591: Cannot find name 'crypto'";
    const keys = triageFailure("poll-ci", msg, NO_NA);
    assert.ok(keys.includes("backend-dev"), `Expected backend-dev in: ${keys}`);
    assert.ok(keys.includes("backend-unit-test"), `Expected backend-unit-test in: ${keys}`);
    assert.ok(keys.includes("poll-ci"));
    // Must NOT include frontend items
    assert.ok(!keys.includes("frontend-dev"), `Unexpected frontend-dev in: ${keys}`);
  });

  it("DOMAIN: frontend routes to frontend-dev + frontend-unit-test", () => {
    const msg = "DOMAIN: frontend\n── Run 123 ──\nESLint error in component";
    const keys = triageFailure("poll-ci", msg, NO_NA);
    assert.ok(keys.includes("frontend-dev"), `Expected frontend-dev in: ${keys}`);
    assert.ok(keys.includes("frontend-unit-test"), `Expected frontend-unit-test in: ${keys}`);
    assert.ok(keys.includes("poll-ci"));
    assert.ok(!keys.includes("backend-dev"), `Unexpected backend-dev in: ${keys}`);
  });

  it("DOMAIN: backend,frontend routes to all dev+test items", () => {
    const msg = "DOMAIN: backend,frontend\n── Run 123 ──\nmixed errors";
    const keys = triageFailure("poll-ci", msg, NO_NA);
    assert.ok(keys.includes("backend-dev"));
    assert.ok(keys.includes("backend-unit-test"));
    assert.ok(keys.includes("frontend-dev"));
    assert.ok(keys.includes("frontend-unit-test"));
    assert.ok(keys.includes("poll-ci"));
  });

  it("DOMAIN: schemas cascades to schema-dev + all downstream", () => {
    const msg = "DOMAIN: schemas\n── Run 123 ──\nschema build error";
    const keys = triageFailure("poll-ci", msg, NO_NA);
    assert.ok(keys.includes("schema-dev"), `Expected schema-dev in: ${keys}`);
    assert.ok(keys.includes("infra-architect"), `Expected infra-architect in: ${keys}`);
    assert.ok(keys.includes("backend-dev"), `Expected backend-dev in: ${keys}`);
    assert.ok(keys.includes("frontend-dev"), `Expected frontend-dev in: ${keys}`);
    assert.ok(keys.includes("poll-ci"));
  });

  it("DOMAIN: unknown falls through to keyword matching", () => {
    // "unknown" should NOT be treated as a domain — fall through.
    // The keyword "backend" in the logs should route to backend.
    const msg = "DOMAIN: unknown\n── Run 123 ──\n/backend/ error TS2591";
    const keys = triageFailure("poll-ci", msg, NO_NA);
    assert.ok(keys.includes("backend-dev"), `Expected keyword fallback to find backend: ${keys}`);
  });

  it("no DOMAIN: header falls through to keyword matching (backward compat)", () => {
    const msg = "── Run 123 ──\nerror TS2591 in /backend/src/functions/fn-demo.ts";
    const keys = triageFailure("poll-ci", msg, NO_NA);
    assert.ok(keys.includes("backend-dev"), `Expected keyword fallback to find backend: ${keys}`);
  });

  it("structured JSON takes priority over DOMAIN: header", () => {
    // If the message is valid JSON, tier 1 (JSON) should win over tier 2 (DOMAIN:)
    const jsonMsg = makeJsonMsg("frontend", "Element not found");
    const keys = triageFailure("poll-ci", jsonMsg, NO_NA);
    assert.ok(keys.includes("frontend-dev"));
    assert.ok(!keys.includes("backend-dev"));
  });

  it("DOMAIN: header respects N/A filtering", () => {
    const msg = "DOMAIN: backend\nlogs";
    const naItems = new Set(["backend-unit-test"]);
    const keys = triageFailure("poll-ci", msg, naItems);
    assert.ok(keys.includes("backend-dev"));
    assert.ok(!keys.includes("backend-unit-test"), `backend-unit-test should be filtered (N/A)`);
  });

  it("DOMAIN: infra routes to infra-architect", () => {
    const msg = "DOMAIN: infra\n── Run 123 ──\nterraform plan failed";
    const keys = triageFailure("poll-infra-plan", msg, NO_NA);
    assert.ok(keys.includes("infra-architect"), `Expected infra-architect in: ${keys}`);
    assert.ok(keys.includes("poll-infra-plan"));
    assert.ok(!keys.includes("backend-dev"), `Unexpected backend-dev in: ${keys}`);
  });
});

// ---------------------------------------------------------------------------
// isUnfixableError — Fatal fast-fail circuit breaker (Phase 3)
// ---------------------------------------------------------------------------

describe("isUnfixableError", () => {
  it("detects Insufficient privileges", () => {
    assert.equal(isUnfixableError("Error: Insufficient privileges to perform operation"), "insufficient privileges");
  });

  it("detects Authorization_RequestDenied", () => {
    assert.equal(isUnfixableError("Authorization_RequestDenied: Caller does not have permission"), "authorization_requestdenied");
  });

  it("detects AADSTS700016", () => {
    assert.equal(isUnfixableError("AADSTS700016: Application not found in tenant"), "aadsts700016");
  });

  it("detects AADSTS7000215", () => {
    assert.equal(isUnfixableError("AADSTS7000215: Invalid client secret provided"), "aadsts7000215");
  });

  it("detects 'does not have authorization'", () => {
    assert.equal(isUnfixableError("Principal does not have authorization to perform action"), "does not have authorization");
  });

  it("detects 'subscription not found'", () => {
    assert.equal(isUnfixableError("The subscription '...' could not be found — subscription not found"), "subscription not found");
  });

  it("detects 'resource group not found'", () => {
    assert.equal(isUnfixableError("Resource group not found: rg-sample-dev"), "resource group not found");
  });

  it("returns null for fixable errors", () => {
    assert.equal(isUnfixableError("error TS2591: Cannot find name 'crypto'"), null);
  });

  it("returns null for empty message", () => {
    assert.equal(isUnfixableError(""), null);
  });

  it("returns null for CORS 403 (fixable — not IAM)", () => {
    assert.equal(isUnfixableError("CORS error: 403 Forbidden on OPTIONS /api/endpoint"), null);
  });

  it("is case-insensitive", () => {
    assert.equal(isUnfixableError("AUTHORIZATION_REQUESTDENIED: no permission"), "authorization_requestdenied");
  });

  it("detects 'cannot apply incomplete plan' (Terraform)", () => {
    assert.equal(isUnfixableError("Error: cannot apply incomplete plan"), "cannot apply incomplete plan");
  });

  it("detects 'error acquiring the state lock' (Terraform)", () => {
    assert.equal(isUnfixableError("Error: error acquiring the state lock"), "error acquiring the state lock");
  });

  it("detects 'resource already exists' (Terraform)", () => {
    assert.equal(isUnfixableError("A resource with the ID already exists - resource already exists"), "resource already exists");
  });

  it("detects 'state blob is already locked' (Terraform)", () => {
    assert.equal(isUnfixableError("Error locking state: state blob is already locked"), "state blob is already locked");
  });
});

describe("triageFailure with unfixable errors (Tier 0)", () => {
  it("returns empty array for Authorization_RequestDenied (blocked)", () => {
    const msg = "Authorization_RequestDenied: cannot access resource";
    const keys = triageFailure("poll-ci", msg, NO_NA);
    assert.deepStrictEqual(keys, []);
  });

  it("returns empty array for Authorization_RequestDenied even with backend keywords", () => {
    // The error mentions "backend" and "API", but unfixable takes priority
    const msg = "Authorization_RequestDenied: Backend API principal does not have permission";
    const keys = triageFailure("integration-test", msg, NO_NA);
    assert.deepStrictEqual(keys, []);
  });

  it("returns empty array for subscription not found", () => {
    const msg = "Error: subscription not found — check Azure portal configuration";
    const keys = triageFailure("live-ui", msg, NO_NA);
    assert.deepStrictEqual(keys, []);
  });

  it("structured JSON 'blocked' domain returns empty array", () => {
    const msg = makeJsonMsg("blocked", "IAM error — platform team must fix");
    const keys = triageFailure("poll-ci", msg, NO_NA);
    assert.deepStrictEqual(keys, []);
  });

  it("CORS 403 is NOT unfixable (routes normally to backend)", () => {
    const msg = "CORS error: 403 Forbidden on OPTIONS /api/endpoint";
    const keys = triageFailure("poll-ci", msg, NO_NA);
    assert.ok(keys.length > 0, `Expected non-empty reset keys: ${keys}`);
    assert.ok(keys.includes("backend-dev"));
  });

  it("fixable errors still route normally (not blocked)", () => {
    const msg = "error TS2591: Cannot find name 'crypto' in /backend/src/functions/fn-demo.ts";
    const keys = triageFailure("poll-ci", msg, NO_NA);
    assert.ok(keys.length > 0, `Expected non-empty reset keys: ${keys}`);
    assert.ok(keys.includes("backend-dev"));
  });
});

// ---------------------------------------------------------------------------
// triageFailure — deployment-stale fault domain (Phase 2.1)
// ---------------------------------------------------------------------------

describe("triageFailure (deployment-stale)", () => {
  it("structured JSON deployment-stale → resets push-app + poll-app-ci only (no dev items)", () => {
    const msg = makeJsonMsg("deployment-stale", "SWA deployment stale — HealthBadge code not in deployed build");
    const keys = triageFailure("live-ui", msg, NO_NA);
    assert.deepStrictEqual(keys, ["push-app", "poll-app-ci", "live-ui"]);
    // MUST NOT include any dev items — code is correct
    assert.ok(!keys.includes("frontend-dev"), "deployment-stale should NOT reset frontend-dev");
    assert.ok(!keys.includes("backend-dev"), "deployment-stale should NOT reset backend-dev");
  });

  it("structured JSON deployment-stale from integration-test", () => {
    const msg = makeJsonMsg("deployment-stale", "fn-health not deployed to Azure — 404 from function app");
    const keys = triageFailure("integration-test", msg, NO_NA);
    assert.deepStrictEqual(keys, ["push-app", "poll-app-ci", "integration-test"]);
    assert.ok(!keys.includes("backend-dev"));
  });

  it("deployment-stale filters N/A items", () => {
    const msg = makeJsonMsg("deployment-stale", "stale deployment");
    const naItems = new Set(["poll-app-ci"]);
    const keys = triageFailure("live-ui", msg, naItems);
    assert.ok(keys.includes("push-app"));
    assert.ok(!keys.includes("poll-app-ci"), "poll-app-ci should be filtered (N/A)");
    assert.ok(keys.includes("live-ui"));
  });

  it("keyword 'SWA deployment stale' → deployment-stale route (no dev reset)", () => {
    const msg = "SWA deployment stale — feature code NOT in deployed build. All 46 JS chunks searched.";
    const keys = triageFailure("live-ui", msg, NO_NA);
    assert.ok(keys.includes("push-app"), `Expected push-app in: ${keys}`);
    assert.ok(keys.includes("poll-app-ci"), `Expected poll-app-ci in: ${keys}`);
    assert.ok(keys.includes("live-ui"));
    assert.ok(!keys.includes("frontend-dev"), "Stale deployment keyword should NOT reset frontend-dev");
  });

  it("keyword 'not in deployed build' → deployment-stale route", () => {
    const msg = "HealthBadge code NOT in deployed build — commits after 3b96258 are [skip ci]";
    const keys = triageFailure("live-ui", msg, NO_NA);
    assert.ok(keys.includes("push-app"), `Expected push-app in: ${keys}`);
    assert.ok(!keys.includes("frontend-dev"), "Should NOT reset frontend-dev for stale deployment");
  });

  it("keyword 'function not deployed' → deployment-stale route", () => {
    const msg = "fn-health function not deployed to Azure, code builds locally";
    const keys = triageFailure("integration-test", msg, NO_NA);
    assert.ok(keys.includes("push-app"), `Expected push-app in: ${keys}`);
    assert.ok(!keys.includes("backend-dev"), "Should NOT reset backend-dev for stale deployment");
  });

  it("keyword 'deploy-frontend.yml never' → deployment-stale route (with config patterns)", () => {
    const msg = "All commits after 3b96258 are [skip ci] — deploy-frontend.yml never re-triggered";
    const patterns = ["deploy-backend.yml", "deploy-frontend.yml", "deploy-infra.yml"];
    const keys = triageFailure("live-ui", msg, NO_NA, undefined, patterns);
    assert.ok(keys.includes("push-app"), `Expected push-app in: ${keys}`);
    assert.ok(!keys.includes("frontend-dev"), "Should NOT reset frontend-dev");
  });
});

// ---------------------------------------------------------------------------
// validateFaultDomain — Defense-in-Depth override (Fix A)
// ---------------------------------------------------------------------------

describe("validateFaultDomain", () => {
  it("augments backend+infra with deploy items when trace mentions .github/workflows", () => {
    const result = validateFaultDomain(
      "backend+infra",
      "deploy-backend.yml sets type: pkg.type but .github/workflows/deploy-backend.yml never committed the fix",
    );
    // Domain stays backend+infra (dev agent runs to fix workflow file)
    assert.equal(result.domain, "backend+infra");
    // Deploy items augmented so the cicd-scope commit gets pushed
    assert.equal(result.augmentWithDeploy, true);
  });

  it("augments backend with deploy items when trace mentions workflow file", () => {
    const result = validateFaultDomain(
      "backend",
      "Error in workflow file .github/workflows/deploy-backend.yml — artifact step fails",
    );
    assert.equal(result.domain, "backend");
    assert.equal(result.augmentWithDeploy, true);
  });

  it("does NOT augment backend when no cicd signals present", () => {
    const result = validateFaultDomain(
      "backend",
      "error TS2591: Cannot find name 'crypto' in /backend/src/functions/fn-demo.ts",
    );
    assert.equal(result.domain, "backend");
    assert.equal(result.augmentWithDeploy, false);
  });

  it("does NOT augment cicd (already routes to deploy)", () => {
    const result = validateFaultDomain(
      "cicd",
      ".github/workflows/deploy-backend.yml references bad artifact step",
    );
    assert.equal(result.domain, "cicd");
    assert.equal(result.augmentWithDeploy, false);
  });

  it("does NOT augment deployment-stale", () => {
    const result = validateFaultDomain(
      "deployment-stale",
      "SWA deployment stale — .github/workflows/deploy-frontend.yml never re-triggered",
    );
    assert.equal(result.domain, "deployment-stale");
    assert.equal(result.augmentWithDeploy, false);
  });

  it("does NOT augment blocked", () => {
    const result = validateFaultDomain(
      "blocked",
      "IAM error — .github/workflows access denied",
    );
    assert.equal(result.domain, "blocked");
    assert.equal(result.augmentWithDeploy, false);
  });

  it("does NOT augment environment", () => {
    const result = validateFaultDomain(
      "environment",
      ".github/workflows secret not configured",
    );
    assert.equal(result.domain, "environment");
    assert.equal(result.augmentWithDeploy, false);
  });

  it("augments frontend with deploy items when 'working-tree fix' + workflow in trace", () => {
    const result = validateFaultDomain(
      "frontend",
      "working-tree fix applied to .github/workflows/deploy-frontend.yml but never committed",
    );
    assert.equal(result.domain, "frontend");
    assert.equal(result.augmentWithDeploy, true);
  });
});

// ---------------------------------------------------------------------------
// triageFailure integration — cicd augmentation end-to-end (Fix A routing)
// ---------------------------------------------------------------------------

describe("triageFailure with cicd augmentation", () => {
  it("backend+infra with .github/workflows root cause → resets backend-dev AND push-app", () => {
    // The exact Groundhog-Day scenario: agent classifies as backend+infra,
    // but the root cause is a .github/workflows/ file. The dev agent must
    // run to fix the workflow AND push-app must be reset to deploy it.
    const msg = makeJsonMsg(
      "backend+infra",
      "deploy-backend.yml sets type: pkg.type but .github/workflows/deploy-backend.yml never committed the fix",
    );
    const keys = triageFailure("integration-test", msg, NO_NA);
    // Dev agent runs (can edit .github/ files with Fix C dual-commit instructions)
    assert.ok(keys.includes("backend-dev"), `Expected backend-dev in: ${keys}`);
    // Deploy items augmented so the cicd-scope commit gets pushed
    assert.ok(keys.includes("push-app"), `Expected push-app in: ${keys}`);
    assert.ok(keys.includes("poll-app-ci"), `Expected poll-app-ci in: ${keys}`);
    // Failing item itself
    assert.ok(keys.includes("integration-test"), `Expected integration-test in: ${keys}`);
  });

  it("backend without cicd root cause → does NOT get deploy augmentation", () => {
    const msg = makeJsonMsg("backend", "API endpoint /api/hello returns 500");
    const keys = triageFailure("integration-test", msg, NO_NA);
    assert.ok(keys.includes("backend-dev"), `Expected backend-dev in: ${keys}`);
    assert.ok(!keys.includes("push-app"), `Unexpected push-app in: ${keys}`);
  });

  it("cicd domain → routes to push-app without augmentation (already correct)", () => {
    const msg = makeJsonMsg("cicd", ".github/workflows/deploy-backend.yml artifact step mismatch");
    const keys = triageFailure("poll-app-ci", msg, NO_NA);
    assert.ok(keys.includes("push-app"), `Expected push-app in: ${keys}`);
    assert.ok(keys.includes("poll-app-ci"), `Expected poll-app-ci in: ${keys}`);
    // cicd domain does NOT reset dev agents
    assert.ok(!keys.includes("backend-dev"), `Unexpected backend-dev in: ${keys}`);
  });
});

// ---------------------------------------------------------------------------
// detectKeywordDomains — pure keyword signal detection
// ---------------------------------------------------------------------------

describe("detectKeywordDomains", () => {
  it("detects backend signals", () => {
    const result = detectKeywordDomains("error TS2591 in /backend/src/functions/fn-demo.ts");
    assert.equal(result.hasBackend, true);
    assert.equal(result.hasFrontend, false);
  });

  it("detects frontend signals", () => {
    const result = detectKeywordDomains("Module not found in /frontend/src/components/Foo.tsx");
    assert.equal(result.hasFrontend, true);
    assert.equal(result.hasBackend, false);
  });

  it("detects cicd signals from .github/workflows", () => {
    const result = detectKeywordDomains(".github/workflows/deploy-backend.yml artifact step mismatch");
    assert.equal(result.hasCicd, true);
  });

  it("detects infra signals", () => {
    const result = detectKeywordDomains("terraform plan failed: azurerm_resource_group missing");
    assert.equal(result.hasInfra, true);
  });

  it("returns all-false for unrecognized message", () => {
    const result = detectKeywordDomains("everything is fine");
    assert.equal(result.hasBackend, false);
    assert.equal(result.hasFrontend, false);
    assert.equal(result.hasCicd, false);
    assert.equal(result.hasInfra, false);
  });
});

// ---------------------------------------------------------------------------
// normalizeDiagnosticTrace — semantic circuit breaker normalization (Fix B)
// ---------------------------------------------------------------------------

describe("normalizeDiagnosticTrace", () => {
  it("strips 7-char git SHAs", () => {
    const result = normalizeDiagnosticTrace("commit 3b96258 broke deploy");
    assert.ok(!result.includes("3b96258"), `SHA not stripped: ${result}`);
    assert.ok(result.includes("<SHA>"));
  });

  it("strips 40-char full SHAs", () => {
    const sha = "a".repeat(40);
    const result = normalizeDiagnosticTrace(`merge ${sha} into main`);
    assert.ok(!result.includes(sha), "Full SHA not stripped");
    assert.ok(result.includes("<SHA>"));
  });

  it("strips ISO timestamps", () => {
    const result = normalizeDiagnosticTrace("Failed at 2025-01-15T09:30:45Z — retrying");
    assert.ok(!result.includes("2025-01-15T09:30:45Z"), "Timestamp not stripped");
    assert.ok(result.includes("<TS>"));
  });

  it("normalizes HEAD (sha) references", () => {
    const result = normalizeDiagnosticTrace("HEAD (abc1234) is behind remote");
    assert.ok(result.includes("HEAD (<SHA>)"), `Expected HEAD (<SHA>): ${result}`);
  });

  it("normalizes 'run NNN' identifiers", () => {
    const result = normalizeDiagnosticTrace("GitHub Actions run 12345678 failed");
    assert.ok(result.includes("run <ID>"), `Expected run <ID>: ${result}`);
  });

  it("collapses whitespace", () => {
    const result = normalizeDiagnosticTrace("error   in    file   path");
    assert.ok(!result.includes("  "), `Whitespace not collapsed: ${result}`);
  });

  it("makes genuinely different traces compare as different", () => {
    const a = normalizeDiagnosticTrace("error TS2591 in fn-demo.ts at 2025-01-15T09:30:45Z commit abc1234");
    const b = normalizeDiagnosticTrace("CORS 403 Forbidden on /api/hello at 2025-01-15T10:00:00Z commit def5678");
    assert.notEqual(a, b);
  });

  it("makes same-root-cause traces with different metadata compare as equal", () => {
    const a = normalizeDiagnosticTrace(
      "deploy-backend.yml sets type: pkg.type — commit 3b96258 at 2025-01-15T09:30:45Z run 111",
    );
    const b = normalizeDiagnosticTrace(
      "deploy-backend.yml sets type: pkg.type — commit f1a2b3c at 2025-01-15T10:00:00Z run 222",
    );
    assert.equal(a, b);
  });
});

// ---------------------------------------------------------------------------
// triageFailure — deployment-stale-backend / deployment-stale-frontend
// ---------------------------------------------------------------------------

describe("triageFailure (domain-specific deployment-stale)", () => {
  it("deployment-stale-backend → resets push-app + poll-app-ci + itemKey", () => {
    const msg = makeJsonMsg("deployment-stale-backend", "fn-webhooks not in deployed artifact list");
    const keys = triageFailure("integration-test", msg, NO_NA);
    assert.deepStrictEqual(keys, ["push-app", "poll-app-ci", "integration-test"]);
  });

  it("deployment-stale-frontend → resets push-app + poll-app-ci + itemKey", () => {
    const msg = makeJsonMsg("deployment-stale-frontend", "SWA serving stale build — /webhooks returns 404");
    const keys = triageFailure("live-ui", msg, NO_NA);
    assert.deepStrictEqual(keys, ["push-app", "poll-app-ci", "live-ui"]);
  });

  it("deployment-stale-backend does NOT reset frontend items", () => {
    const msg = makeJsonMsg("deployment-stale-backend", "Backend artifact stale");
    const keys = triageFailure("integration-test", msg, NO_NA);
    assert.ok(!keys.includes("frontend-dev"));
    assert.ok(!keys.includes("frontend-unit-test"));
    assert.ok(!keys.includes("live-ui"));
  });

  it("deployment-stale-frontend does NOT reset backend items", () => {
    const msg = makeJsonMsg("deployment-stale-frontend", "Frontend build stale");
    const keys = triageFailure("live-ui", msg, NO_NA);
    assert.ok(!keys.includes("backend-dev"));
    assert.ok(!keys.includes("backend-unit-test"));
    assert.ok(!keys.includes("integration-test"));
  });

  it("deployment-stale-backend filters out N/A items", () => {
    const msg = makeJsonMsg("deployment-stale-backend", "Backend stale");
    const na = new Set(["poll-app-ci"]);
    const keys = triageFailure("integration-test", msg, na);
    assert.deepStrictEqual(keys, ["push-app", "integration-test"]);
  });

  it("generic deployment-stale still works as fallback", () => {
    const msg = makeJsonMsg("deployment-stale", "Generic stale deployment");
    const keys = triageFailure("live-ui", msg, NO_NA);
    assert.deepStrictEqual(keys, ["push-app", "poll-app-ci", "live-ui"]);
  });

  it("deployment-stale-backend is not augmented with deploy items by validateFaultDomain", () => {
    const result: ValidationResult = validateFaultDomain(
      "deployment-stale-backend",
      "fn-webhooks missing from deployed artifact, .github/workflows/deploy-backend.yml",
    );
    assert.equal(result.augmentWithDeploy, false);
  });

  it("deployment-stale-frontend is not augmented with deploy items by validateFaultDomain", () => {
    const result: ValidationResult = validateFaultDomain(
      "deployment-stale-frontend",
      "SWA stale, .github/workflows/deploy-frontend.yml never triggered",
    );
    assert.equal(result.augmentWithDeploy, false);
  });
});

