/**
 * triage.test.ts — Unit tests for structured JSON error triage.
 *
 * Uses Node.js built-in test runner (node:test) — zero dependencies.
 * Run: npx tsx src/__tests__/triage.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { triageFailure, parseTriageDiagnostic, parseDomainHeader, isUnfixableError, isOrchestratorTimeout, validateFaultDomain } from "../triage.js";
import type { ValidationResult } from "../triage.js";
import type { ApmFaultRoute } from "../apm-types.js";
import type { TriageSignature } from "../apm-types.js";
import { normalizeDiagnosticTrace } from "../session-runner.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NO_NA = new Set<string>();

/**
 * The canonical unfixable_signals fixture — mirrors apps/sample-app/.apm/workflows.yml.
 * Passed to isUnfixableError() and triageFailure() in tests.
 */
const UNFIXABLE_SIGNALS = [
  "authorization_requestdenied",
  "aadsts700016",
  "aadsts7000215",
  "application.readwrite",
  "insufficient privileges",
  "does not have authorization",
  "subscription not found",
  "resource group not found",
  "cannot apply incomplete plan",
  "error acquiring the state lock",
  "resource already exists",
  "state blob is already locked",
];

function makeJsonMsg(faultDomain: string, trace: string): string {
  return JSON.stringify({ fault_domain: faultDomain, diagnostic_trace: trace });
}

/**
 * The canonical fault_routing fixture — mirrors apps/sample-app/.apm/workflows.yml.
 * WYSIWYG: the kernel returns exactly what is declared. "$SELF" → itemKey at runtime.
 */
const FAULT_ROUTING: Record<string, ApmFaultRoute> = {
  backend:                    { reset_nodes: ["backend-dev", "backend-unit-test", "$SELF"] },
  frontend:                   { reset_nodes: ["frontend-dev", "frontend-unit-test", "$SELF"] },
  both:                       { reset_nodes: ["backend-dev", "backend-unit-test", "frontend-dev", "frontend-unit-test", "$SELF"] },
  schemas:                    { reset_nodes: ["schema-dev", "infra-architect", "backend-dev", "backend-unit-test", "frontend-dev", "frontend-unit-test", "$SELF"] },
  "frontend+infra":           { reset_nodes: ["infra-architect", "frontend-dev", "frontend-unit-test", "$SELF"] },
  "backend+infra":            { reset_nodes: ["infra-architect", "backend-dev", "backend-unit-test", "$SELF"] },
  cicd:                       { reset_nodes: ["push-app", "poll-app-ci"] },
  "deployment-stale":         { reset_nodes: ["push-app", "poll-app-ci"] },
  "deployment-stale-backend": { reset_nodes: ["push-app", "poll-app-ci"] },
  "deployment-stale-frontend":{ reset_nodes: ["push-app", "poll-app-ci"] },
  infra:                      { reset_nodes: ["infra-architect", "push-infra", "poll-infra-plan", "create-draft-pr", "await-infra-approval", "infra-handoff", "$SELF"] },
  "test-code":                { reset_nodes: ["$SELF"] },
  environment:                { reset_nodes: ["$SELF"] },
  blocked:                    { reset_nodes: [] },
};

/**
 * Workflow nodes fixture for dynamic deploy-augmentation lookup.
 * Contains script_type declarations matching the canonical sample-app DAG.
 */
const WORKFLOW_NODES: Record<string, { script_type?: string }> = {
  "push-app":           { script_type: "push" },
  "push-infra":         { script_type: "push" },
  "poll-app-ci":        { script_type: "poll" },
  "poll-infra-plan":    { script_type: "poll" },
  // Agent/approval nodes have no script_type
  "backend-dev":        {},
  "frontend-dev":       {},
  "schema-dev":         {},
  "infra-architect":    {},
  "live-ui":            {},
  "integration-test":   {},
};

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
  it("backend fault_domain → resets backend-dev + backend-unit-test + itemKey", async () => {
    const msg = makeJsonMsg("backend", "API returned 500");
    const keys = await triageFailure("live-ui", msg, NO_NA, FAULT_ROUTING, WORKFLOW_NODES);
    assert.deepStrictEqual(keys, ["backend-dev", "backend-unit-test", "live-ui"]);
  });

  it("frontend fault_domain → resets frontend-dev + frontend-unit-test + itemKey", async () => {
    const msg = makeJsonMsg("frontend", "Button not clickable");
    const keys = await triageFailure("live-ui", msg, NO_NA, FAULT_ROUTING, WORKFLOW_NODES);
    assert.deepStrictEqual(keys, ["frontend-dev", "frontend-unit-test", "live-ui"]);
  });

  it("both fault_domain → resets all dev + test items + itemKey", async () => {
    const msg = makeJsonMsg("both", "CORS error + UI error-banner");
    const keys = await triageFailure("live-ui", msg, NO_NA, FAULT_ROUTING, WORKFLOW_NODES);
    assert.deepStrictEqual(keys, [
      "backend-dev", "backend-unit-test",
      "frontend-dev", "frontend-unit-test",
      "live-ui",
    ]);
  });

  it("environment fault_domain → resets only itemKey (not a code bug)", async () => {
    const msg = makeJsonMsg("environment", "az login required");
    const keys = await triageFailure("live-ui", msg, NO_NA, FAULT_ROUTING, WORKFLOW_NODES);
    assert.deepStrictEqual(keys, ["live-ui"]);
  });

  it("works with integration-test as itemKey", async () => {
    const msg = makeJsonMsg("backend", "Missing endpoint /api/bulk");
    const keys = await triageFailure("integration-test", msg, NO_NA, FAULT_ROUTING, WORKFLOW_NODES);
    assert.deepStrictEqual(keys, ["backend-dev", "backend-unit-test", "integration-test"]);
  });

  it("filters out N/A items from structured path", async () => {
    const msg = makeJsonMsg("both", "Mixed failure");
    const naItems = new Set(["frontend-dev", "frontend-unit-test"]);
    const keys = await triageFailure("live-ui", msg, naItems, FAULT_ROUTING, WORKFLOW_NODES);
    assert.deepStrictEqual(keys, ["backend-dev", "backend-unit-test", "live-ui"]);
  });

  it("environment filters out N/A itemKey", async () => {
    const msg = makeJsonMsg("environment", "auth issue");
    const naItems = new Set(["live-ui"]);
    const keys = await triageFailure("live-ui", msg, naItems, FAULT_ROUTING, WORKFLOW_NODES);
    assert.deepStrictEqual(keys, []);
  });

  it("infra fault_domain → resets full Wave 1 cascade + itemKey", async () => {
    const msg = makeJsonMsg("infra", "terraform state lock conflict");
    const keys = await triageFailure("poll-infra-plan", msg, NO_NA, FAULT_ROUTING, WORKFLOW_NODES);
    assert.deepStrictEqual(keys, [
      "infra-architect", "push-infra", "poll-infra-plan", "create-draft-pr",
      "await-infra-approval", "infra-handoff",
    ]);
  });

  it("infra fault_domain filters out N/A items", async () => {
    const msg = makeJsonMsg("infra", "terraform error");
    const naItems = new Set(["infra-architect"]);
    const keys = await triageFailure("poll-infra-plan", msg, naItems, FAULT_ROUTING, WORKFLOW_NODES);
    // infra-architect is filtered out, rest of Wave 1 cascade remains
    assert.ok(!keys.includes("infra-architect"));
    assert.ok(keys.includes("push-infra"));
    assert.ok(keys.includes("poll-infra-plan"));
  });

  it("test-code fault_domain → zero cascade, only resets the failing test item", async () => {
    const msg = makeJsonMsg("test-code", "Playwright timeout on data-testid=modal — locator is incorrect");
    const keys = await triageFailure("live-ui", msg, NO_NA, FAULT_ROUTING, WORKFLOW_NODES);
    assert.deepStrictEqual(keys, ["live-ui"]);
  });

  it("test-code fault_domain filters out N/A items", async () => {
    const msg = makeJsonMsg("test-code", "bad locator");
    const naItems = new Set(["live-ui"]);
    const keys = await triageFailure("live-ui", msg, naItems, FAULT_ROUTING, WORKFLOW_NODES);
    assert.deepStrictEqual(keys, []);
  });

  it("graceful degradation — unknown domain returns [] when faultRouting provided", async () => {
    // "database" is not in the FaultDomain enum, so parseTriageDiagnostic returns null.
    // Fall through to keywords. But if we force an unknown domain via a custom routing
    // table that omits it, we get []. This tests applyFaultDomain's graceful degradation.
    const msg = makeJsonMsg("blocked", "IAM error — platform team must fix");
    const keys = await triageFailure("poll-ci", msg, NO_NA, FAULT_ROUTING, WORKFLOW_NODES);
    assert.deepStrictEqual(keys, []);
  });

  it("graceful degradation — missing faultRouting returns [] for all Tier 1 domains", async () => {
    const msg = makeJsonMsg("backend", "API returned 500");
    const keys = await triageFailure("live-ui", msg, NO_NA);
    // No faultRouting → applyFaultDomain returns [] → empty = blocked
    assert.deepStrictEqual(keys, []);
  });
});

// ---------------------------------------------------------------------------
// triageFailure — legacy keyword fallback
// ---------------------------------------------------------------------------

// Test KB that covers the same domains as the old keyword_signals
const TEST_KB: TriageSignature[] = [
  // Backend
  { error_snippet: "api endpoint", fault_domain: "backend", reason: "API endpoint error" },
  { error_snippet: "500", fault_domain: "backend", reason: "HTTP 500 error" },
  { error_snippet: "502", fault_domain: "backend", reason: "HTTP 502 error" },
  { error_snippet: "504", fault_domain: "backend", reason: "HTTP 504 error" },
  { error_snippet: "error ts", fault_domain: "backend", reason: "TypeScript compilation error" },
  { error_snippet: "src/functions", fault_domain: "backend", reason: "Backend functions path" },
  { error_snippet: "/backend/", fault_domain: "backend", reason: "Backend directory path" },
  // Frontend
  { error_snippet: "ui component", fault_domain: "frontend", reason: "UI component error" },
  { error_snippet: "render failure", fault_domain: "frontend", reason: "Render failure" },
  { error_snippet: "selector", fault_domain: "frontend", reason: "DOM selector error" },
  { error_snippet: "eslint", fault_domain: "frontend", reason: "ESLint error" },
  { error_snippet: "/frontend/", fault_domain: "frontend", reason: "Frontend directory path" },
  // Schemas
  { error_snippet: "packages/schemas", fault_domain: "schemas", reason: "Schema package error" },
  // Infra
  { error_snippet: "terraform", fault_domain: "infra", reason: "Terraform error" },
  { error_snippet: "azurerm", fault_domain: "infra", reason: "Azure RM error" },
  { error_snippet: "cors", fault_domain: "infra", reason: "CORS configuration error" },
  { error_snippet: "403 forbidden", fault_domain: "infra", reason: "CORS/auth config error" },
  // CI/CD (migrated from former hardcoded CICD_ROOT_CAUSE_INDICATORS)
  { error_snippet: ".github/workflows", fault_domain: "cicd", reason: "CI/CD workflow error" },
  { error_snippet: "never committed", fault_domain: "cicd", reason: "Working-tree fix never committed" },
  { error_snippet: "working-tree fix", fault_domain: "cicd", reason: "Working-tree fix not persisted" },
  { error_snippet: "workflow file", fault_domain: "cicd", reason: "GitHub Actions workflow file error" },
  { error_snippet: "deploy artifact step", fault_domain: "cicd", reason: "CI/CD deploy artifact step misconfigured" },
  { error_snippet: "deploy package.json", fault_domain: "cicd", reason: "CI/CD deploy package.json step misconfigured" },
  // Deployment-stale
  { error_snippet: "deployment stale", fault_domain: "deployment-stale", reason: "Stale deployment" },
  { error_snippet: "not in deployed build", fault_domain: "deployment-stale", reason: "Code not deployed" },
  { error_snippet: "not deployed", fault_domain: "deployment-stale", reason: "Function not deployed" },
  { error_snippet: "never re-triggered", fault_domain: "deployment-stale", reason: "Deployment workflow not triggered" },
];

describe("triageFailure (RAG retriever fallback)", () => {
  it("backend KB match → resets backend items", async () => {
    const keys = await triageFailure("live-ui", "API endpoint /api/jobs returns 500", NO_NA, FAULT_ROUTING, WORKFLOW_NODES, TEST_KB);
    assert.ok(keys.includes("backend-dev"));
    assert.ok(keys.includes("backend-unit-test"));
    assert.ok(keys.includes("live-ui"));
  });

  it("frontend KB match → resets frontend items", async () => {
    const keys = await triageFailure("live-ui", "UI component render failure", NO_NA, FAULT_ROUTING, WORKFLOW_NODES, TEST_KB);
    assert.ok(keys.includes("frontend-dev"));
    assert.ok(keys.includes("frontend-unit-test"));
    assert.ok(keys.includes("live-ui"));
  });

  it("mixed KB matches → routes via top match (longest snippet)", async () => {
    // "API endpoint" (12 chars) beats "500" (3 chars) → routes to backend
    const keys = await triageFailure("live-ui", "API endpoint 500 and UI component broken", NO_NA, FAULT_ROUTING, WORKFLOW_NODES, TEST_KB);
    // The retriever uses the top match (longest snippet), so "ui component" (12 chars)
    // ties with "api endpoint" (12 chars). Both match, but retriever returns top 1 for routing.
    // Either backend or frontend domain is valid for the top match.
    assert.ok(keys.includes("live-ui"));
  });

  it("no KB matches → only resets the failing item (safe default)", async () => {
    const keys = await triageFailure("live-ui", "something totally unknown broke", NO_NA, FAULT_ROUTING, WORKFLOW_NODES, TEST_KB);
    assert.deepStrictEqual(keys, ["live-ui"]);
  });

  it("environment keywords → only resets itemKey (no KB match, safe retry)", async () => {
    const keys = await triageFailure("live-ui", "az login required, credentials missing", NO_NA, FAULT_ROUTING, WORKFLOW_NODES, TEST_KB);
    assert.deepStrictEqual(keys, ["live-ui"]);
  });

  it("poll timeout → only resets itemKey (safe default)", async () => {
    const keys = await triageFailure("poll-ci", "⏳ Exiting poll to prevent Copilot timeout.", NO_NA, FAULT_ROUTING, WORKFLOW_NODES, TEST_KB);
    assert.deepStrictEqual(keys, ["poll-ci"]);
  });

  it("manually cancelled CI run → only resets itemKey", async () => {
    const keys = await triageFailure("poll-ci", "\u274c ERROR: One or more CI workflows were manually cancelled.", NO_NA, FAULT_ROUTING, WORKFLOW_NODES, TEST_KB);
    assert.deepStrictEqual(keys, ["poll-ci"]);
  });

  it("schema KB match → resets schema-dev + all downstream dev/test items", async () => {
    const keys = await triageFailure("poll-ci", "FAIL packages/schemas/src/__tests__/auth.test.ts", NO_NA, FAULT_ROUTING, WORKFLOW_NODES, TEST_KB);
    assert.ok(keys.includes("schema-dev"));
    assert.ok(keys.includes("infra-architect"));
    assert.ok(keys.includes("backend-dev"));
    assert.ok(keys.includes("backend-unit-test"));
    assert.ok(keys.includes("frontend-dev"));
    assert.ok(keys.includes("frontend-unit-test"));
    assert.ok(keys.includes("poll-ci"));
  });

  it("no KB match for CI noise → safe retry only", async () => {
    const keys = await triageFailure("poll-ci", "✔ All CI workflows completed.\n❌ FAILED: CI Integration (run 123)\nFAIL some unknown test error", NO_NA, FAULT_ROUTING, WORKFLOW_NODES, TEST_KB);
    assert.ok(keys.includes("poll-ci"));
  });

  it("filters out N/A items in retriever fallback", async () => {
    const naItems = new Set(["backend-dev", "backend-unit-test"]);
    const keys = await triageFailure("live-ui", "API endpoint 500 and UI component broken", naItems, FAULT_ROUTING, WORKFLOW_NODES, TEST_KB);
    assert.ok(!keys.includes("backend-dev"));
    assert.ok(!keys.includes("backend-unit-test"));
    assert.ok(keys.includes("live-ui"));
  });

  it("infra KB match → resets infra-architect", async () => {
    const keys = await triageFailure("poll-infra-plan", "terraform plan failed with azurerm provider error", NO_NA, FAULT_ROUTING, WORKFLOW_NODES, TEST_KB);
    assert.ok(keys.includes("infra-architect"), `Expected infra-architect in: ${keys}`);
    assert.ok(keys.includes("poll-infra-plan"));
  });

  it("infra + backend co-occurring → routes via top KB match (longest snippet)", async () => {
    // "api endpoint" (12 chars) > "terraform" (9 chars) → backend wins as top match
    const keys = await triageFailure("poll-app-ci", "terraform azurerm_function_app error and API endpoint 500", NO_NA, FAULT_ROUTING, WORKFLOW_NODES, TEST_KB);
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
// triageFailure — malformed JSON falls back to retriever
// ---------------------------------------------------------------------------

describe("triageFailure (malformed JSON → retriever fallback)", () => {
  it("valid JSON but missing fault_domain → falls back to retriever", async () => {
    const msg = JSON.stringify({ diagnostic_trace: "API endpoint 500 error" });
    const keys = await triageFailure("live-ui", msg, NO_NA, FAULT_ROUTING, WORKFLOW_NODES, TEST_KB);
    // Missing fault_domain → Zod parse fails → Tier 3 retriever
    assert.ok(keys.includes("live-ui"));
  });

  it("valid JSON with invalid fault_domain → falls through to safe retry", async () => {
    const msg = makeJsonMsg("database", "connection refused, backend issue");
    const keys = await triageFailure("live-ui", msg, NO_NA, FAULT_ROUTING, WORKFLOW_NODES, TEST_KB);
    // "database" is not a valid FaultDomain → Zod parse fails → Tier 3
    // No KB match for "connection refused" → safe retry
    assert.ok(keys.includes("live-ui"));
  });

  it("JSON array → falls through to retriever", async () => {
    const keys = await triageFailure("live-ui", '[{"error": "ui component render failure"}]', NO_NA, FAULT_ROUTING, WORKFLOW_NODES, TEST_KB);
    // JSON array is not TriageDiagnostic → Tier 3 → "ui component" matches frontend
    assert.ok(keys.includes("frontend-dev"));
    assert.ok(keys.includes("live-ui"));
  });
});

// ---------------------------------------------------------------------------
// triageFailure — IAM/permission env signals (Fix 6c)
// ---------------------------------------------------------------------------

describe("triageFailure (IAM/permission env signals)", () => {
  it("routes authorization_requestdenied as blocked (unfixable — Tier 0)", async () => {
    const result = await triageFailure("poll-ci", "Authorization_RequestDenied: 403 on azuread_application.main", NO_NA, FAULT_ROUTING, WORKFLOW_NODES, undefined, undefined, undefined, undefined, UNFIXABLE_SIGNALS);
    // Unfixable IAM error → empty array (blocked), not environment retry
    assert.deepStrictEqual(result, []);
  });

  it("routes insufficient privileges as blocked (unfixable — Tier 0)", async () => {
    const result = await triageFailure("poll-ci", "403 Forbidden: Insufficient privileges to register application", NO_NA, FAULT_ROUTING, WORKFLOW_NODES, undefined, undefined, undefined, undefined, UNFIXABLE_SIGNALS);
    // "Insufficient privileges" is an unfixable signal
    assert.deepStrictEqual(result, []);
  });

  it("routes 'does not have authorization' as blocked (unfixable — Tier 0)", async () => {
    const result = await triageFailure("integration-test", "Principal does not have authorization to perform this action", NO_NA, FAULT_ROUTING, WORKFLOW_NODES, undefined, undefined, undefined, undefined, UNFIXABLE_SIGNALS);
    assert.deepStrictEqual(result, []);
  });

  it("does NOT route CORS 403 as unfixable (routes as infra via retriever)", async () => {
    const result = await triageFailure("live-ui", "CORS error: 403 Forbidden on OPTIONS /api/endpoint", NO_NA, FAULT_ROUTING, WORKFLOW_NODES, TEST_KB);
    // CORS 403 is fixable (infra configuration issue) — KB matches "403 forbidden" → infra
    assert.ok(result.includes("infra-architect"), `Expected infra-architect in: ${result}`);
    assert.ok(!result.every(k => k === "live-ui"), "Should not be environment-only");
  });
});

// ---------------------------------------------------------------------------
// triageFailure — frontend+infra / backend+infra fault domains (Fix 7a)
// ---------------------------------------------------------------------------

describe("triageFailure (compound fault domains)", () => {
  it("routes frontend+infra to infra-architect + frontend-dev + frontend-unit-test + $SELF", async () => {
    const msg = makeJsonMsg("frontend+infra", "APIM route mismatch");
    const result = await triageFailure("live-ui", msg, NO_NA, FAULT_ROUTING, WORKFLOW_NODES);
    assert.deepStrictEqual(result, ["infra-architect", "frontend-dev", "frontend-unit-test", "live-ui"]);
  });

  it("routes backend+infra to infra-architect + backend-dev + backend-unit-test + $SELF", async () => {
    const msg = makeJsonMsg("backend+infra", "Function app missing env var");
    const result = await triageFailure("integration-test", msg, NO_NA, FAULT_ROUTING, WORKFLOW_NODES);
    assert.deepStrictEqual(result, ["infra-architect", "backend-dev", "backend-unit-test", "integration-test"]);
  });

  it("filters N/A items from frontend+infra", async () => {
    const msg = makeJsonMsg("frontend+infra", "CORS misconfigured");
    const na = new Set(["frontend-unit-test"]);
    const result = await triageFailure("live-ui", msg, na, FAULT_ROUTING, WORKFLOW_NODES);
    assert.deepStrictEqual(result, ["infra-architect", "frontend-dev", "live-ui"]);
  });
});

// ---------------------------------------------------------------------------
// triageFailure — retriever-based CI error routing (replaces keyword_signals)
// ---------------------------------------------------------------------------

describe("triageFailure (retriever-based CI routing)", () => {
  it("backend error patterns → routes to backend-dev", async () => {
    // Pure CI error content — no polling noise (file-based diagnostic handoff)
    const ciLog = [
      "── Run 12345 ──────────────────────────────────────────────",
      "Backend — Lint, Test & Build\tType-check (tsc --noEmit)\t##[error]src/functions/fn-demo-login.ts(24,33): error TS2591: Cannot find name 'crypto'.",
      "Backend — Lint, Test & Build\tType-check (tsc --noEmit)\t##[error]Process completed with exit code 2.",
      "── End Run 12345 ──────────────────────────────────────────",
    ].join("\n");
    const keys = await triageFailure("poll-ci", ciLog, NO_NA, FAULT_ROUTING, WORKFLOW_NODES, TEST_KB);
    assert.ok(keys.includes("backend-dev"), `Expected backend-dev in: ${keys}`);
    assert.ok(keys.includes("backend-unit-test"), `Expected backend-unit-test in: ${keys}`);
    assert.ok(keys.includes("poll-ci"));
  });

  it("frontend error patterns → routes to frontend-dev", async () => {
    const ciLog = [
      "── Run 12345 ──────────────────────────────────────────────",
      "Frontend — Lint, Test & Build\tLint\tnpm error path /home/runner/work/DAGent-t/DAGent-t/apps/sample-app/frontend/",
      "Frontend — Lint, Test & Build\tLint\tESLint couldn't find an eslint.config file.",
      "── End Run 12345 ──────────────────────────────────────────",
    ].join("\n");
    const keys = await triageFailure("poll-ci", ciLog, NO_NA, FAULT_ROUTING, WORKFLOW_NODES, TEST_KB);
    assert.ok(keys.includes("frontend-dev"), `Expected frontend-dev in: ${keys}`);
    assert.ok(keys.includes("frontend-unit-test"), `Expected frontend-unit-test in: ${keys}`);
    assert.ok(keys.includes("poll-ci"));
  });

  it("both backend + frontend errors → routes via top match (single domain)", async () => {
    const ciLog = [
      "── Run 12345 ──────────────────────────────────────────────",
      "Backend — Lint, Test & Build\tType-check\t##[error]src/functions/fn-profile.ts(20,33): error TS2591",
      "── End Run 12345 ──────────────────────────────────────────",
      "── Run 67890 ──────────────────────────────────────────────",
      "Frontend — Lint, Test & Build\tLint\tnpm error path /apps/sample-app/frontend/",
      "── End Run 67890 ──────────────────────────────────────────",
    ].join("\n");
    const keys = await triageFailure("poll-ci", ciLog, NO_NA, FAULT_ROUTING, WORKFLOW_NODES, TEST_KB);
    // Retriever routes via top match (longest snippet) — at least one dev domain found
    assert.ok(keys.includes("backend-dev") || keys.includes("frontend-dev"),
      `Expected at least one dev domain in: ${keys}`);
    assert.ok(keys.includes("poll-ci"));
  });

  it("no recognizable patterns → only resets the failing item (safe default)", async () => {
    const ciLog = "Some completely opaque error with no file paths at all";
    const keys = await triageFailure("poll-ci", ciLog, NO_NA, FAULT_ROUTING, WORKFLOW_NODES, TEST_KB);
    assert.deepStrictEqual(keys, ["poll-ci"]);
  });

  it("schema path → routes to schema-dev + all downstream", async () => {
    const ciLog = "FAIL /packages/schemas/src/__tests__/auth.test.ts";
    const keys = await triageFailure("poll-ci", ciLog, NO_NA, FAULT_ROUTING, WORKFLOW_NODES, TEST_KB);
    assert.ok(keys.includes("schema-dev"), `Expected schema-dev in: ${keys}`);
    assert.ok(keys.includes("backend-dev"));
    assert.ok(keys.includes("frontend-dev"));
    assert.ok(keys.includes("poll-ci"));
  });

  it("custom KB routes to correct domain via retriever", async () => {
    const customFR: Record<string, ApmFaultRoute> = {
      backend: { reset_nodes: ["backend-dev", "backend-unit-test", "$SELF"] },
      frontend: { reset_nodes: ["frontend-dev", "frontend-unit-test", "$SELF"] },
    };
    const customKB: TriageSignature[] = [
      { error_snippet: "/server/", fault_domain: "backend", reason: "Server directory" },
      { error_snippet: "/client/", fault_domain: "frontend", reason: "Client directory" },
    ];
    const ciLog = "##[error]/server/src/utils.ts(10,5): TS2304: Cannot find name 'foo'.";
    const keys = await triageFailure("poll-ci", ciLog, NO_NA, customFR, WORKFLOW_NODES, customKB);
    assert.ok(keys.includes("backend-dev"), `Expected backend-dev in: ${keys}`);
    assert.ok(!keys.includes("frontend-dev"), `Unexpected frontend-dev in: ${keys}`);
    assert.ok(keys.includes("poll-ci"));
  });

  it("custom KB routes frontend path from custom integration dir", async () => {
    const customFR: Record<string, ApmFaultRoute> = {
      backend: { reset_nodes: ["backend-dev", "backend-unit-test", "$SELF"] },
      frontend: { reset_nodes: ["frontend-dev", "frontend-unit-test", "$SELF"] },
    };
    const customKB: TriageSignature[] = [
      { error_snippet: "/api/", fault_domain: "backend", reason: "API directory" },
      { error_snippet: "/web/", fault_domain: "frontend", reason: "Web directory" },
      { error_snippet: "/integration/", fault_domain: "frontend", reason: "Integration test directory" },
    ];
    const ciLog = "FAIL /integration/login.spec.ts";
    const keys = await triageFailure("poll-ci", ciLog, NO_NA, customFR, WORKFLOW_NODES, customKB);
    assert.ok(keys.includes("frontend-dev"), `Expected frontend-dev in: ${keys}`);
    assert.ok(keys.includes("poll-ci"));
  });

  it("retriever-based path matching works without explicit directories param", async () => {
    const ciLog = "##[error]src/functions/fn-demo-login.ts error in /backend/src";
    const keys = await triageFailure("poll-ci", ciLog, NO_NA, FAULT_ROUTING, WORKFLOW_NODES, TEST_KB);
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
  it("mixed polling noise + CI errors: routes to dev agents, NOT environment", async () => {
    // Simulates the full stdout that poll-ci.sh produces: polling status
    // lines FOLLOWED BY actual CI failure content. With the file-based
    // diagnostic handoff, triage only sees the pure CI content. But even
    // if the full output were passed (fallback), this must not classify
    // as "environment" thanks to the retriever.
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
      "Frontend — Lint, Test & Build\tLint\tnpm error path /home/runner/work/DAGent-t/DAGent-t/apps/sample-app/frontend/",
      "Frontend — Lint, Test & Build\tLint\tESLint couldn't find an eslint.config.(js|mjs|cjs) file.",
      "── End Run 23656485030 ──────────────────────────────────────────",
    ].join("\n");

    const keys = await triageFailure("poll-ci", fullPollOutput, NO_NA, FAULT_ROUTING, WORKFLOW_NODES, TEST_KB);

    // MUST route to at least one dev domain — NOT just ["poll-ci"]
    assert.ok(keys.includes("backend-dev") || keys.includes("frontend-dev"),
      `Expected at least one dev agent in: ${keys}`);
    assert.ok(keys.includes("poll-ci"));
    assert.ok(keys.length > 1, `Expected more than just poll-ci, got: ${keys}`);
  });

  it("pure CI diagnostic content (file-based handoff) routes correctly", async () => {
    // This is what triage ACTUALLY sees with the file-based handoff —
    // just the CI failure logs, no polling noise.
    const pureDiagContent = [
      "── Run 23656485030 ──────────────────────────────────────────────",
      "Backend — Lint, Test & Build\tType-check (tsc --noEmit)\t##[error]src/functions/fn-demo-login.ts(24,33): error TS2591: Cannot find name 'crypto'.",
      "Backend — Lint, Test & Build\tType-check (tsc --noEmit)\t##[error]src/functions/fn-profile.ts(20,33): error TS2591: Cannot find name 'crypto'.",
      "Frontend — Lint, Test & Build\tLint\tnpm error path /home/runner/work/DAGent-t/DAGent-t/apps/sample-app/frontend/",
      "Frontend — Lint, Test & Build\tLint\tESLint couldn't find an eslint.config file.",
      "── End Run 23656485030 ──────────────────────────────────────────",
    ].join("\n");

    const keys = await triageFailure("poll-ci", pureDiagContent, NO_NA, FAULT_ROUTING, WORKFLOW_NODES, TEST_KB);
    // Retriever routes via top match (longest snippet) — at least one dev domain
    assert.ok(keys.includes("backend-dev") || keys.includes("frontend-dev"),
      `Expected at least one dev agent in: ${keys}`);
    assert.ok(keys.includes("poll-ci"));
  });

  it("'ci is still running' alone (no CI errors) retries only the failing item", async () => {
    // After removing "ci is still running" from envSignals, a message
    // containing only polling noise (no real errors) falls through to the
    // safe fallback which retries only the failing item. The exit code 2
    // boundary in session-runner.ts prevents this from reaching triage
    // in practice, but if it does, retrying the item is safer than
    // resetting everything.
    const pollingOnly = "⏳ CI is still running... sleeping 30 seconds.\n⏳ CI is still running... sleeping 30 seconds.";
    const keys = await triageFailure("poll-ci", pollingOnly, NO_NA, FAULT_ROUTING, WORKFLOW_NODES);
    assert.deepStrictEqual(keys, ["poll-ci"]);
  });
});

// ---------------------------------------------------------------------------
// parseDomainHeader — CI metadata routing (Phase 1)
// ---------------------------------------------------------------------------

describe("parseDomainHeader", () => {
  it("parses DOMAIN: backend → returns matched domain array", () => {
    const result = parseDomainHeader("DOMAIN: backend\n── Run 123 ──\nsome logs", FAULT_ROUTING);
    assert.deepStrictEqual(result, ["backend"]);
  });

  it("parses DOMAIN: frontend → returns matched domain array", () => {
    const result = parseDomainHeader("DOMAIN: frontend\nCI error logs here", FAULT_ROUTING);
    assert.deepStrictEqual(result, ["frontend"]);
  });

  it("parses DOMAIN: backend,frontend → returns both domains", () => {
    const result = parseDomainHeader("DOMAIN: backend,frontend\nlogs", FAULT_ROUTING);
    assert.deepStrictEqual(result, ["backend", "frontend"]);
  });

  it("parses DOMAIN: schemas → returns schemas domain", () => {
    const result = parseDomainHeader("DOMAIN: schemas\nlogs", FAULT_ROUTING);
    assert.deepStrictEqual(result, ["schemas"]);
  });

  it("parses DOMAIN: schemas,backend → returns both domains", () => {
    const result = parseDomainHeader("DOMAIN: schemas,backend\nlogs", FAULT_ROUTING);
    assert.deepStrictEqual(result, ["schemas", "backend"]);
  });

  it("returns null for DOMAIN: unknown", () => {
    assert.equal(parseDomainHeader("DOMAIN: unknown\nlogs", FAULT_ROUTING), null);
  });

  it("returns null when no DOMAIN: header present", () => {
    assert.equal(parseDomainHeader("── Run 123 ──\nBackend error logs", FAULT_ROUTING), null);
  });

  it("returns null for empty message", () => {
    assert.equal(parseDomainHeader("", FAULT_ROUTING), null);
  });

  it("is case-insensitive for DOMAIN: prefix", () => {
    const result = parseDomainHeader("domain: backend\nlogs", FAULT_ROUTING);
    assert.deepStrictEqual(result, ["backend"]);
  });

  it("handles whitespace in domain values", () => {
    const result = parseDomainHeader("DOMAIN:  backend , frontend \nlogs", FAULT_ROUTING);
    assert.deepStrictEqual(result, ["backend", "frontend"]);
  });

  it("filters out domains not in faultRouting", () => {
    const result = parseDomainHeader("DOMAIN: ios,backend\nlogs", FAULT_ROUTING);
    // "ios" is not a key in FAULT_ROUTING, so only "backend" is returned
    assert.deepStrictEqual(result, ["backend"]);
  });

  it("returns matched domains when faultRouting has the key", () => {
    const customFR: Record<string, ApmFaultRoute> = {
      ios: { reset_nodes: ["ios-dev", "$SELF"] },
    };
    const result = parseDomainHeader("DOMAIN: ios\nlogs", customFR);
    assert.deepStrictEqual(result, ["ios"]);
  });

  it("returns null when no parsed domains exist in faultRouting", () => {
    const customFR: Record<string, ApmFaultRoute> = {
      android: { reset_nodes: ["android-dev"] },
    };
    const result = parseDomainHeader("DOMAIN: ios\nlogs", customFR);
    assert.equal(result, null);
  });
});

describe("triageFailure with DOMAIN: header (Tier 2)", () => {
  it("DOMAIN: backend routes to backend-dev + backend-unit-test", async () => {
    const msg = "DOMAIN: backend\n── Run 123 ──\nerror TS2591: Cannot find name 'crypto'";
    const keys = await triageFailure("poll-ci", msg, NO_NA, FAULT_ROUTING, WORKFLOW_NODES);
    assert.ok(keys.includes("backend-dev"), `Expected backend-dev in: ${keys}`);
    assert.ok(keys.includes("backend-unit-test"), `Expected backend-unit-test in: ${keys}`);
    assert.ok(keys.includes("poll-ci"));
    // Must NOT include frontend items
    assert.ok(!keys.includes("frontend-dev"), `Unexpected frontend-dev in: ${keys}`);
  });

  it("DOMAIN: frontend routes to frontend-dev + frontend-unit-test", async () => {
    const msg = "DOMAIN: frontend\n── Run 123 ──\nESLint error in component";
    const keys = await triageFailure("poll-ci", msg, NO_NA, FAULT_ROUTING, WORKFLOW_NODES);
    assert.ok(keys.includes("frontend-dev"), `Expected frontend-dev in: ${keys}`);
    assert.ok(keys.includes("frontend-unit-test"), `Expected frontend-unit-test in: ${keys}`);
    assert.ok(keys.includes("poll-ci"));
    assert.ok(!keys.includes("backend-dev"), `Unexpected backend-dev in: ${keys}`);
  });

  it("DOMAIN: backend,frontend routes to all dev+test items", async () => {
    const msg = "DOMAIN: backend,frontend\n── Run 123 ──\nmixed errors";
    const keys = await triageFailure("poll-ci", msg, NO_NA, FAULT_ROUTING, WORKFLOW_NODES);
    assert.ok(keys.includes("backend-dev"));
    assert.ok(keys.includes("backend-unit-test"));
    assert.ok(keys.includes("frontend-dev"));
    assert.ok(keys.includes("frontend-unit-test"));
    assert.ok(keys.includes("poll-ci"));
  });

  it("DOMAIN: schemas cascades to schema-dev + all downstream", async () => {
    // Schema cascade is driven by FAULT_ROUTING["schemas"].reset_nodes
    const msg = "DOMAIN: schemas\n── Run 123 ──\nschema build error";
    const keys = await triageFailure("poll-ci", msg, NO_NA, FAULT_ROUTING, WORKFLOW_NODES);
    assert.ok(keys.includes("schema-dev"), `Expected schema-dev in: ${keys}`);
    assert.ok(keys.includes("infra-architect"), `Expected infra-architect in: ${keys}`);
    assert.ok(keys.includes("backend-dev"), `Expected backend-dev in: ${keys}`);
    assert.ok(keys.includes("frontend-dev"), `Expected frontend-dev in: ${keys}`);
    assert.ok(keys.includes("poll-ci"));
  });

  it("DOMAIN: unknown falls through to retriever matching", async () => {
    // "unknown" should NOT be treated as a domain — fall through.
    // The "/backend/" in the logs should route to backend via retriever KB.
    const msg = "DOMAIN: unknown\n── Run 123 ──\n/backend/ error TS2591";
    const keys = await triageFailure("poll-ci", msg, NO_NA, FAULT_ROUTING, WORKFLOW_NODES, TEST_KB);
    assert.ok(keys.includes("backend-dev"), `Expected retriever fallback to find backend: ${keys}`);
  });

  it("no DOMAIN: header falls through to retriever matching (backward compat)", async () => {
    const msg = "── Run 123 ──\nerror TS2591 in /backend/src/functions/fn-demo.ts";
    const keys = await triageFailure("poll-ci", msg, NO_NA, FAULT_ROUTING, WORKFLOW_NODES, TEST_KB);
    assert.ok(keys.includes("backend-dev"), `Expected retriever fallback to find backend: ${keys}`);
  });

  it("structured JSON takes priority over DOMAIN: header", async () => {
    // If the message is valid JSON, tier 1 (JSON) should win over tier 2 (DOMAIN:)
    const jsonMsg = makeJsonMsg("frontend", "Element not found");
    const keys = await triageFailure("poll-ci", jsonMsg, NO_NA, FAULT_ROUTING, WORKFLOW_NODES);
    assert.ok(keys.includes("frontend-dev"));
    assert.ok(!keys.includes("backend-dev"));
  });

  it("DOMAIN: header respects N/A filtering", async () => {
    const msg = "DOMAIN: backend\nlogs";
    const naItems = new Set(["backend-unit-test"]);
    const keys = await triageFailure("poll-ci", msg, naItems, FAULT_ROUTING, WORKFLOW_NODES);
    assert.ok(keys.includes("backend-dev"));
    assert.ok(!keys.includes("backend-unit-test"), `backend-unit-test should be filtered (N/A)`);
  });

  it("DOMAIN: infra routes to infra-architect", async () => {
    const msg = "DOMAIN: infra\n── Run 123 ──\nterraform plan failed";
    const keys = await triageFailure("poll-infra-plan", msg, NO_NA, FAULT_ROUTING, WORKFLOW_NODES);
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
    assert.equal(isUnfixableError("Error: Insufficient privileges to perform operation", UNFIXABLE_SIGNALS), "insufficient privileges");
  });

  it("detects Authorization_RequestDenied", () => {
    assert.equal(isUnfixableError("Authorization_RequestDenied: Caller does not have permission", UNFIXABLE_SIGNALS), "authorization_requestdenied");
  });

  it("detects AADSTS700016", () => {
    assert.equal(isUnfixableError("AADSTS700016: Application not found in tenant", UNFIXABLE_SIGNALS), "aadsts700016");
  });

  it("detects AADSTS7000215", () => {
    assert.equal(isUnfixableError("AADSTS7000215: Invalid client secret provided", UNFIXABLE_SIGNALS), "aadsts7000215");
  });

  it("detects 'does not have authorization'", () => {
    assert.equal(isUnfixableError("Principal does not have authorization to perform action", UNFIXABLE_SIGNALS), "does not have authorization");
  });

  it("detects 'subscription not found'", () => {
    assert.equal(isUnfixableError("The subscription '...' could not be found — subscription not found", UNFIXABLE_SIGNALS), "subscription not found");
  });

  it("detects 'resource group not found'", () => {
    assert.equal(isUnfixableError("Resource group not found: rg-sample-dev", UNFIXABLE_SIGNALS), "resource group not found");
  });

  it("returns null for fixable errors", () => {
    assert.equal(isUnfixableError("error TS2591: Cannot find name 'crypto'", UNFIXABLE_SIGNALS), null);
  });

  it("returns null for empty message", () => {
    assert.equal(isUnfixableError("", UNFIXABLE_SIGNALS), null);
  });

  it("returns null for CORS 403 (fixable — not IAM)", () => {
    assert.equal(isUnfixableError("CORS error: 403 Forbidden on OPTIONS /api/endpoint", UNFIXABLE_SIGNALS), null);
  });

  it("is case-insensitive", () => {
    assert.equal(isUnfixableError("AUTHORIZATION_REQUESTDENIED: no permission", UNFIXABLE_SIGNALS), "authorization_requestdenied");
  });

  it("detects 'cannot apply incomplete plan' (Terraform)", () => {
    assert.equal(isUnfixableError("Error: cannot apply incomplete plan", UNFIXABLE_SIGNALS), "cannot apply incomplete plan");
  });

  it("detects 'error acquiring the state lock' (Terraform)", () => {
    assert.equal(isUnfixableError("Error: error acquiring the state lock", UNFIXABLE_SIGNALS), "error acquiring the state lock");
  });

  it("detects 'resource already exists' (Terraform)", () => {
    assert.equal(isUnfixableError("A resource with the ID already exists - resource already exists", UNFIXABLE_SIGNALS), "resource already exists");
  });

  it("detects 'state blob is already locked' (Terraform)", () => {
    assert.equal(isUnfixableError("Error locking state: state blob is already locked", UNFIXABLE_SIGNALS), "state blob is already locked");
  });
});

describe("triageFailure with unfixable errors (Tier 0)", () => {
  it("returns empty array for Authorization_RequestDenied (blocked)", async () => {
    const msg = "Authorization_RequestDenied: cannot access resource";
    const keys = await triageFailure("poll-ci", msg, NO_NA, FAULT_ROUTING, WORKFLOW_NODES, undefined, undefined, undefined, undefined, UNFIXABLE_SIGNALS);
    assert.deepStrictEqual(keys, []);
  });

  it("returns empty array for Authorization_RequestDenied even with backend keywords", async () => {
    // The error mentions "backend" and "API", but unfixable takes priority
    const msg = "Authorization_RequestDenied: Backend API principal does not have permission";
    const keys = await triageFailure("integration-test", msg, NO_NA, FAULT_ROUTING, WORKFLOW_NODES, undefined, undefined, undefined, undefined, UNFIXABLE_SIGNALS);
    assert.deepStrictEqual(keys, []);
  });

  it("returns empty array for subscription not found", async () => {
    const msg = "Error: subscription not found — check Azure portal configuration";
    const keys = await triageFailure("live-ui", msg, NO_NA, FAULT_ROUTING, WORKFLOW_NODES, undefined, undefined, undefined, undefined, UNFIXABLE_SIGNALS);
    assert.deepStrictEqual(keys, []);
  });

  it("structured JSON 'blocked' domain returns empty array", async () => {
    const msg = makeJsonMsg("blocked", "IAM error — platform team must fix");
    const keys = await triageFailure("poll-ci", msg, NO_NA, FAULT_ROUTING, WORKFLOW_NODES);
    assert.deepStrictEqual(keys, []);
  });

  it("CORS 403 is NOT unfixable (routes normally via retriever)", async () => {
    const msg = "CORS error: 403 Forbidden on OPTIONS /api/endpoint";
    const keys = await triageFailure("poll-ci", msg, NO_NA, FAULT_ROUTING, WORKFLOW_NODES, TEST_KB, undefined, undefined, undefined, UNFIXABLE_SIGNALS);
    assert.ok(keys.length > 0, `Expected non-empty reset keys: ${keys}`);
    // CORS routes via KB "403 forbidden" → infra (correct per safety rules)
    assert.ok(keys.includes("infra-architect"), `Expected infra-architect in: ${keys}`);
  });

  it("fixable errors still route normally (not blocked)", async () => {
    const msg = "error TS2591: Cannot find name 'crypto' in /backend/src/functions/fn-demo.ts";
    const keys = await triageFailure("poll-ci", msg, NO_NA, FAULT_ROUTING, WORKFLOW_NODES, TEST_KB, undefined, undefined, undefined, UNFIXABLE_SIGNALS);
    assert.ok(keys.length > 0, `Expected non-empty reset keys: ${keys}`);
    assert.ok(keys.includes("backend-dev"));
  });
});

// ---------------------------------------------------------------------------
// triageFailure — deployment-stale fault domain (Phase 2.1)
// ---------------------------------------------------------------------------

describe("triageFailure (deployment-stale)", () => {
  it("structured JSON deployment-stale → resets push-app + poll-app-ci only (no dev items, no $SELF)", async () => {
    const msg = makeJsonMsg("deployment-stale", "SWA deployment stale — HealthBadge code not in deployed build");
    const keys = await triageFailure("live-ui", msg, NO_NA, FAULT_ROUTING, WORKFLOW_NODES);
    assert.deepStrictEqual(keys, ["push-app", "poll-app-ci"]);
    // MUST NOT include any dev items — code is correct
    assert.ok(!keys.includes("frontend-dev"), "deployment-stale should NOT reset frontend-dev");
    assert.ok(!keys.includes("backend-dev"), "deployment-stale should NOT reset backend-dev");
    // MUST NOT include itemKey — WYSIWYG, no hidden $SELF
    assert.ok(!keys.includes("live-ui"), "deployment-stale should NOT include itemKey (no $SELF)");
  });

  it("structured JSON deployment-stale from integration-test", async () => {
    const msg = makeJsonMsg("deployment-stale", "fn-health not deployed to Azure — 404 from function app");
    const keys = await triageFailure("integration-test", msg, NO_NA, FAULT_ROUTING, WORKFLOW_NODES);
    assert.deepStrictEqual(keys, ["push-app", "poll-app-ci"]);
    assert.ok(!keys.includes("backend-dev"));
  });

  it("deployment-stale filters N/A items", async () => {
    const msg = makeJsonMsg("deployment-stale", "stale deployment");
    const naItems = new Set(["poll-app-ci"]);
    const keys = await triageFailure("live-ui", msg, naItems, FAULT_ROUTING, WORKFLOW_NODES);
    assert.deepStrictEqual(keys, ["push-app"]);
  });

  it("KB match 'deployment stale' → deployment-stale route (no dev reset)", async () => {
    const msg = "SWA deployment stale — feature code NOT in deployed build. All 46 JS chunks searched.";
    const keys = await triageFailure("live-ui", msg, NO_NA, FAULT_ROUTING, WORKFLOW_NODES, TEST_KB);
    assert.ok(keys.includes("push-app"), `Expected push-app in: ${keys}`);
    assert.ok(keys.includes("poll-app-ci"), `Expected poll-app-ci in: ${keys}`);
    // No $SELF in deployment-stale reset_nodes — code is correct, just needs redeployment
    assert.ok(!keys.includes("frontend-dev"), "Stale deployment KB match should NOT reset frontend-dev");
  });

  it("KB match 'not in deployed build' → deployment-stale route", async () => {
    const msg = "HealthBadge code NOT in deployed build — commits after 3b96258 are [skip ci]";
    const keys = await triageFailure("live-ui", msg, NO_NA, FAULT_ROUTING, WORKFLOW_NODES, TEST_KB);
    assert.ok(keys.includes("push-app"), `Expected push-app in: ${keys}`);
    assert.ok(!keys.includes("frontend-dev"), "Should NOT reset frontend-dev for stale deployment");
  });

  it("KB match 'not deployed' → deployment-stale route", async () => {
    const msg = "fn-health function not deployed to Azure, code builds locally";
    const keys = await triageFailure("integration-test", msg, NO_NA, FAULT_ROUTING, WORKFLOW_NODES, TEST_KB);
    assert.ok(keys.includes("push-app"), `Expected push-app in: ${keys}`);
    assert.ok(!keys.includes("backend-dev"), "Should NOT reset backend-dev for stale deployment");
  });

  it("KB match 'never re-triggered' → deployment-stale route", async () => {
    const msg = "All commits after 3b96258 are [skip ci] — deploy-frontend.yml never re-triggered";
    const keys = await triageFailure("live-ui", msg, NO_NA, FAULT_ROUTING, WORKFLOW_NODES, TEST_KB);
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
      undefined,
      TEST_KB,
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
      undefined,
      TEST_KB,
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
      undefined,
      TEST_KB,
    );
    assert.equal(result.domain, "frontend");
    assert.equal(result.augmentWithDeploy, true);
  });
});

// ---------------------------------------------------------------------------
// triageFailure integration — cicd augmentation end-to-end (Fix A routing)
// ---------------------------------------------------------------------------

describe("triageFailure with cicd augmentation", () => {
  it("backend+infra with .github/workflows root cause → resets infra-architect + backend-dev AND push-app", async () => {
    // The exact Groundhog-Day scenario: agent classifies as backend+infra,
    // but the root cause is a .github/workflows/ file. The dev agent must
    // run to fix the workflow AND push-app must be reset to deploy it.
    const msg = makeJsonMsg(
      "backend+infra",
      "deploy-backend.yml sets type: pkg.type but .github/workflows/deploy-backend.yml never committed the fix",
    );
    const keys = await triageFailure("integration-test", msg, NO_NA, FAULT_ROUTING, WORKFLOW_NODES, TEST_KB);
    // Infra-architect included (Correction 2)
    assert.ok(keys.includes("infra-architect"), `Expected infra-architect in: ${keys}`);
    // Dev agent runs (can edit .github/ files with Fix C dual-commit instructions)
    assert.ok(keys.includes("backend-dev"), `Expected backend-dev in: ${keys}`);
    // Deploy items augmented so the cicd-scope commit gets pushed
    assert.ok(keys.includes("push-app"), `Expected push-app in: ${keys}`);
    assert.ok(keys.includes("poll-app-ci"), `Expected poll-app-ci in: ${keys}`);
    // Failing item itself ($SELF)
    assert.ok(keys.includes("integration-test"), `Expected integration-test in: ${keys}`);
  });

  it("backend without cicd root cause → does NOT get deploy augmentation", async () => {
    const msg = makeJsonMsg("backend", "API endpoint /api/hello returns 500");
    const keys = await triageFailure("integration-test", msg, NO_NA, FAULT_ROUTING, WORKFLOW_NODES);
    assert.ok(keys.includes("backend-dev"), `Expected backend-dev in: ${keys}`);
    assert.ok(!keys.includes("push-app"), `Unexpected push-app in: ${keys}`);
  });

  it("cicd domain → routes to push-app without augmentation (already correct)", async () => {
    const msg = makeJsonMsg("cicd", ".github/workflows/deploy-backend.yml artifact step mismatch");
    const keys = await triageFailure("poll-app-ci", msg, NO_NA, FAULT_ROUTING, WORKFLOW_NODES);
    assert.ok(keys.includes("push-app"), `Expected push-app in: ${keys}`);
    assert.ok(keys.includes("poll-app-ci"), `Expected poll-app-ci in: ${keys}`);
    // cicd domain does NOT reset dev agents
    assert.ok(!keys.includes("backend-dev"), `Unexpected backend-dev in: ${keys}`);
  });
});

// ---------------------------------------------------------------------------
// retrieveTopMatches — local RAG triage (Tier 3)
// ---------------------------------------------------------------------------

describe("retrieveTopMatches (via triageFailure Tier 3)", () => {
  const TRIAGE_KB: TriageSignature[] = [
    { error_snippet: "FUNCTIONS_WORKER_RUNTIME", fault_domain: "infra", reason: "Azure Functions runtime env var missing" },
    { error_snippet: "Cannot find module", fault_domain: "backend", reason: "Node module import failure" },
    { error_snippet: "terraform plan failed", fault_domain: "infra", reason: "Terraform plan error" },
  ];

  it("matches a known error snippet and routes deterministically", async () => {
    const keys = await triageFailure(
      "integration-test", "Error: Cannot find module '@branded/schemas'",
      NO_NA, FAULT_ROUTING, WORKFLOW_NODES, TRIAGE_KB,
    );
    assert.ok(keys.includes("backend-dev"), `Expected backend-dev in: ${keys}`);
    assert.ok(keys.includes("backend-unit-test"), `Expected backend-unit-test in: ${keys}`);
  });

  it("falls through to retry-only when no KB matches and no LLM", async () => {
    const keys = await triageFailure(
      "live-ui", "completely novel error nobody has seen before",
      NO_NA, FAULT_ROUTING, WORKFLOW_NODES, TRIAGE_KB,
    );
    // No KB match, no LLM client → retry the failing item only
    assert.deepStrictEqual(keys, ["live-ui"]);
  });

  it("routes infra error via KB match", async () => {
    const keys = await triageFailure(
      "poll-infra-plan", "FUNCTIONS_WORKER_RUNTIME not configured in app settings",
      NO_NA, FAULT_ROUTING, WORKFLOW_NODES, TRIAGE_KB,
    );
    assert.ok(keys.includes("infra-architect"), `Expected infra-architect in: ${keys}`);
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
  it("deployment-stale-backend → resets push-app + poll-app-ci (no $SELF)", async () => {
    const msg = makeJsonMsg("deployment-stale-backend", "fn-webhooks not in deployed artifact list");
    const keys = await triageFailure("integration-test", msg, NO_NA, FAULT_ROUTING, WORKFLOW_NODES);
    assert.deepStrictEqual(keys, ["push-app", "poll-app-ci"]);
  });

  it("deployment-stale-frontend → resets push-app + poll-app-ci (no $SELF)", async () => {
    const msg = makeJsonMsg("deployment-stale-frontend", "SWA serving stale build — /webhooks returns 404");
    const keys = await triageFailure("live-ui", msg, NO_NA, FAULT_ROUTING, WORKFLOW_NODES);
    assert.deepStrictEqual(keys, ["push-app", "poll-app-ci"]);
  });

  it("deployment-stale-backend does NOT reset frontend items", async () => {
    const msg = makeJsonMsg("deployment-stale-backend", "Backend artifact stale");
    const keys = await triageFailure("integration-test", msg, NO_NA, FAULT_ROUTING, WORKFLOW_NODES);
    assert.ok(!keys.includes("frontend-dev"));
    assert.ok(!keys.includes("frontend-unit-test"));
    assert.ok(!keys.includes("live-ui"));
  });

  it("deployment-stale-frontend does NOT reset backend items", async () => {
    const msg = makeJsonMsg("deployment-stale-frontend", "Frontend build stale");
    const keys = await triageFailure("live-ui", msg, NO_NA, FAULT_ROUTING, WORKFLOW_NODES);
    assert.ok(!keys.includes("backend-dev"));
    assert.ok(!keys.includes("backend-unit-test"));
    assert.ok(!keys.includes("integration-test"));
  });

  it("deployment-stale-backend filters out N/A items", async () => {
    const msg = makeJsonMsg("deployment-stale-backend", "Backend stale");
    const na = new Set(["poll-app-ci"]);
    const keys = await triageFailure("integration-test", msg, na, FAULT_ROUTING, WORKFLOW_NODES);
    assert.deepStrictEqual(keys, ["push-app"]);
  });

  it("generic deployment-stale still works as fallback", async () => {
    const msg = makeJsonMsg("deployment-stale", "Generic stale deployment");
    const keys = await triageFailure("live-ui", msg, NO_NA, FAULT_ROUTING, WORKFLOW_NODES);
    assert.deepStrictEqual(keys, ["push-app", "poll-app-ci"]);
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

// ===========================================================================
// Commerce Storefront (PWA Kit) — SFCC-specific triage fixtures
// ===========================================================================
//
// The triage engine is app-agnostic. These tests prove the commerce-storefront
// fault_routing table (from apps/commerce-storefront/.apm/workflows.yml) routes
// correctly through the same kernel used by sample-app.
// ===========================================================================

/**
 * Commerce-storefront fault_routing fixture — mirrors
 * apps/commerce-storefront/.apm/workflows.yml fault_routing section.
 */
const SFCC_FAULT_ROUTING: Record<string, ApmFaultRoute> = {
  frontend:         { reset_nodes: ["storefront-dev", "storefront-unit-test", "$SELF"] },
  schemas:          { reset_nodes: ["schema-dev", "storefront-dev", "storefront-unit-test", "$SELF"] },
  cicd:             { reset_nodes: ["push-app", "poll-app-ci"] },
  "deployment-stale": { reset_nodes: ["push-app", "poll-app-ci"] },
  "test-code":      { reset_nodes: ["$SELF"] },
  environment:      { reset_nodes: ["$SELF"] },
  blocked:          { reset_nodes: [] },
};

/** Commerce-storefront unfixable signals — from workflows.yml. */
const SFCC_UNFIXABLE_SIGNALS = [
  "unauthorized_client",
  "invalid_client",
  "account_suspended",
  "organization not found",
  "slas client not found",
];

/** Commerce-storefront workflow nodes — matches the 11-node DAG. */
const SFCC_WORKFLOW_NODES: Record<string, { script_type?: string }> = {
  "schema-dev":            {},
  "storefront-dev":        {},
  "storefront-unit-test":  {},
  "create-draft-pr":       {},
  "live-ui":               {},
  "code-cleanup":          {},
  "docs-archived":         {},
  "doc-architect":         {},
  "push-app":              { script_type: "push" },
  "poll-app-ci":           { script_type: "poll" },
  "publish-pr":            { script_type: "publish" },
};

/** Commerce-storefront triage KB for retriever tests. */
const SFCC_KB: TriageSignature[] = [
  { error_snippet: "chakra", fault_domain: "frontend", reason: "Chakra UI component error" },
  { error_snippet: "commerce-sdk-react", fault_domain: "frontend", reason: "SCAPI hook error" },
  { error_snippet: "useProduct", fault_domain: "frontend", reason: "commerce-sdk-react hook error" },
  { error_snippet: "useBasket", fault_domain: "frontend", reason: "commerce-sdk-react hook error" },
  { error_snippet: "render failure", fault_domain: "frontend", reason: "React render error" },
  { error_snippet: "hydration", fault_domain: "frontend", reason: "SSR hydration mismatch" },
  { error_snippet: "overrides/app", fault_domain: "frontend", reason: "PWA Kit override path" },
  { error_snippet: "/config/", fault_domain: "schemas", reason: "Commerce config error" },
  { error_snippet: "slas", fault_domain: "environment", reason: "SLAS auth error" },
  { error_snippet: "deployment stale", fault_domain: "deployment-stale", reason: "Stale Managed Runtime deployment" },
  { error_snippet: ".github/workflows", fault_domain: "cicd", reason: "CI/CD workflow error" },
];

// ---------------------------------------------------------------------------
// Commerce Storefront — structured JSON triage (Tier 1)
// ---------------------------------------------------------------------------

describe("commerce-storefront: triageFailure (structured JSON)", () => {
  it("frontend fault_domain → resets storefront-dev + storefront-unit-test + $SELF", async () => {
    const msg = makeJsonMsg("frontend", "Chakra Button not rendering after hydration");
    const keys = await triageFailure("live-ui", msg, NO_NA, SFCC_FAULT_ROUTING, SFCC_WORKFLOW_NODES);
    assert.deepStrictEqual(keys, ["storefront-dev", "storefront-unit-test", "live-ui"]);
  });

  it("schemas fault_domain → resets schema-dev + storefront-dev + storefront-unit-test + $SELF", async () => {
    const msg = makeJsonMsg("schemas", "Config schema mismatch in default.js");
    const keys = await triageFailure("live-ui", msg, NO_NA, SFCC_FAULT_ROUTING, SFCC_WORKFLOW_NODES);
    assert.deepStrictEqual(keys, ["schema-dev", "storefront-dev", "storefront-unit-test", "live-ui"]);
  });

  it("cicd fault_domain → resets push-app + poll-app-ci only (no dev items)", async () => {
    const msg = makeJsonMsg("cicd", "deploy-storefront.yml missing npm run build step");
    const keys = await triageFailure("poll-app-ci", msg, NO_NA, SFCC_FAULT_ROUTING, SFCC_WORKFLOW_NODES);
    assert.deepStrictEqual(keys, ["push-app", "poll-app-ci"]);
    assert.ok(!keys.includes("storefront-dev"));
  });

  it("deployment-stale → resets push-app + poll-app-ci (no dev, no $SELF)", async () => {
    const msg = makeJsonMsg("deployment-stale", "Managed Runtime serving stale bundle");
    const keys = await triageFailure("live-ui", msg, NO_NA, SFCC_FAULT_ROUTING, SFCC_WORKFLOW_NODES);
    assert.deepStrictEqual(keys, ["push-app", "poll-app-ci"]);
    assert.ok(!keys.includes("storefront-dev"));
    assert.ok(!keys.includes("live-ui"));
  });

  it("test-code fault_domain → resets only $SELF (bad Playwright locator)", async () => {
    const msg = makeJsonMsg("test-code", "Playwright timeout on data-testid=pdp-add-to-cart — locator wrong");
    const keys = await triageFailure("live-ui", msg, NO_NA, SFCC_FAULT_ROUTING, SFCC_WORKFLOW_NODES);
    assert.deepStrictEqual(keys, ["live-ui"]);
  });

  it("environment fault_domain → resets only $SELF (SLAS token failure)", async () => {
    const msg = makeJsonMsg("environment", "SLAS refresh token expired — transient auth failure");
    const keys = await triageFailure("live-ui", msg, NO_NA, SFCC_FAULT_ROUTING, SFCC_WORKFLOW_NODES);
    assert.deepStrictEqual(keys, ["live-ui"]);
  });

  it("blocked fault_domain → returns [] (halt for human)", async () => {
    const msg = makeJsonMsg("blocked", "SFCC sandbox access revoked — contact admin");
    const keys = await triageFailure("live-ui", msg, NO_NA, SFCC_FAULT_ROUTING, SFCC_WORKFLOW_NODES);
    assert.deepStrictEqual(keys, []);
  });

  it("filters N/A items from frontend domain", async () => {
    const msg = makeJsonMsg("frontend", "Component render error");
    const naItems = new Set(["storefront-unit-test"]);
    const keys = await triageFailure("live-ui", msg, naItems, SFCC_FAULT_ROUTING, SFCC_WORKFLOW_NODES);
    assert.deepStrictEqual(keys, ["storefront-dev", "live-ui"]);
  });
});

// ---------------------------------------------------------------------------
// Commerce Storefront — unfixable signals (Tier 0)
// ---------------------------------------------------------------------------

describe("commerce-storefront: isUnfixableError (SFCC signals)", () => {
  it("detects unauthorized_client", () => {
    assert.equal(isUnfixableError("Error: unauthorized_client — SLAS client ID not recognized", SFCC_UNFIXABLE_SIGNALS), "unauthorized_client");
  });

  it("detects invalid_client", () => {
    assert.equal(isUnfixableError("OAuth error: invalid_client — client secret mismatch", SFCC_UNFIXABLE_SIGNALS), "invalid_client");
  });

  it("detects account_suspended", () => {
    assert.equal(isUnfixableError("SFCC sandbox account_suspended — contact Salesforce support", SFCC_UNFIXABLE_SIGNALS), "account_suspended");
  });

  it("detects 'organization not found'", () => {
    assert.equal(isUnfixableError("SCAPI error: organization not found for org ID f_ecom_zzrf_001", SFCC_UNFIXABLE_SIGNALS), "organization not found");
  });

  it("detects 'slas client not found'", () => {
    assert.equal(isUnfixableError("Error during auth: slas client not found — verify client ID in config/default.js", SFCC_UNFIXABLE_SIGNALS), "slas client not found");
  });

  it("returns null for fixable SFCC errors (Chakra render failure)", () => {
    assert.equal(isUnfixableError("ChakraProvider: theme is missing required tokens", SFCC_UNFIXABLE_SIGNALS), null);
  });

  it("returns null for SCAPI 404 (fixable endpoint misconfiguration)", () => {
    assert.equal(isUnfixableError("SCAPI 404: /search/shopper-search/v1/organizations/undefined/product-search", SFCC_UNFIXABLE_SIGNALS), null);
  });
});

describe("commerce-storefront: triageFailure with unfixable signals (Tier 0)", () => {
  it("unauthorized_client halts pipeline (returns [])", async () => {
    const msg = "OAuth error: unauthorized_client — check SLAS client configuration";
    const keys = await triageFailure("live-ui", msg, NO_NA, SFCC_FAULT_ROUTING, SFCC_WORKFLOW_NODES, undefined, undefined, undefined, undefined, SFCC_UNFIXABLE_SIGNALS);
    assert.deepStrictEqual(keys, []);
  });

  it("slas client not found halts pipeline even with frontend keywords", async () => {
    const msg = "slas client not found when rendering storefront homepage — commerce-sdk-react useProduct failed";
    const keys = await triageFailure("live-ui", msg, NO_NA, SFCC_FAULT_ROUTING, SFCC_WORKFLOW_NODES, SFCC_KB, undefined, undefined, undefined, SFCC_UNFIXABLE_SIGNALS);
    assert.deepStrictEqual(keys, []);
  });

  it("fixable SCAPI error routes normally (not blocked)", async () => {
    const msg = "commerce-sdk-react useProduct hook returned 400 — invalid product ID";
    const keys = await triageFailure("live-ui", msg, NO_NA, SFCC_FAULT_ROUTING, SFCC_WORKFLOW_NODES, SFCC_KB, undefined, undefined, undefined, SFCC_UNFIXABLE_SIGNALS);
    assert.ok(keys.length > 0, "Expected non-empty reset keys for fixable error");
    assert.ok(keys.includes("storefront-dev"));
  });
});

// ---------------------------------------------------------------------------
// Commerce Storefront — RAG retriever (Tier 3)
// ---------------------------------------------------------------------------

describe("commerce-storefront: triageFailure (RAG retriever)", () => {
  it("Chakra UI error → routes to storefront-dev", async () => {
    const keys = await triageFailure("live-ui", "ChakraProvider error: chakra theme token missing for Button", NO_NA, SFCC_FAULT_ROUTING, SFCC_WORKFLOW_NODES, SFCC_KB);
    assert.ok(keys.includes("storefront-dev"), `Expected storefront-dev in: ${keys}`);
    assert.ok(keys.includes("storefront-unit-test"), `Expected storefront-unit-test in: ${keys}`);
  });

  it("commerce-sdk-react hook error → routes to storefront-dev", async () => {
    const keys = await triageFailure("live-ui", "Error in commerce-sdk-react useBasket: cannot read property 'basketId'", NO_NA, SFCC_FAULT_ROUTING, SFCC_WORKFLOW_NODES, SFCC_KB);
    assert.ok(keys.includes("storefront-dev"), `Expected storefront-dev in: ${keys}`);
  });

  it("SSR hydration mismatch → routes to frontend (storefront-dev)", async () => {
    const keys = await triageFailure("live-ui", "Warning: Text content did not match during hydration. Server: 'Home' Client: ''", NO_NA, SFCC_FAULT_ROUTING, SFCC_WORKFLOW_NODES, SFCC_KB);
    assert.ok(keys.includes("storefront-dev"), `Expected storefront-dev in: ${keys}`);
  });

  it("overrides/app path → routes to frontend (storefront-dev)", async () => {
    const keys = await triageFailure("storefront-unit-test", "FAIL overrides/app/pages/home/index.test.jsx — component snapshot mismatch", NO_NA, SFCC_FAULT_ROUTING, SFCC_WORKFLOW_NODES, SFCC_KB);
    assert.ok(keys.includes("storefront-dev"), `Expected storefront-dev in: ${keys}`);
  });

  it("config/ path → routes to schemas (schema-dev)", async () => {
    const keys = await triageFailure("live-ui", "Error reading /config/default.js — missing siteId property", NO_NA, SFCC_FAULT_ROUTING, SFCC_WORKFLOW_NODES, SFCC_KB);
    assert.ok(keys.includes("schema-dev"), `Expected schema-dev in: ${keys}`);
    assert.ok(keys.includes("storefront-dev"), `Expected storefront-dev in schemas cascade: ${keys}`);
  });

  it("no KB match → retries only the failing item", async () => {
    const keys = await triageFailure("live-ui", "completely unknown PWA Kit error", NO_NA, SFCC_FAULT_ROUTING, SFCC_WORKFLOW_NODES, SFCC_KB);
    assert.deepStrictEqual(keys, ["live-ui"]);
  });
});

// ---------------------------------------------------------------------------
// Commerce Storefront — DOMAIN: header (Tier 2)
// ---------------------------------------------------------------------------

describe("commerce-storefront: triageFailure with DOMAIN: header (Tier 2)", () => {
  it("DOMAIN: frontend routes to storefront-dev + storefront-unit-test", async () => {
    const msg = "DOMAIN: frontend\nPlaywright error: page.click failed for #add-to-cart";
    const keys = await triageFailure("poll-app-ci", msg, NO_NA, SFCC_FAULT_ROUTING, SFCC_WORKFLOW_NODES);
    assert.ok(keys.includes("storefront-dev"));
    assert.ok(keys.includes("storefront-unit-test"));
    assert.ok(keys.includes("poll-app-ci"));
  });

  it("DOMAIN: schemas cascades through all storefront nodes", async () => {
    const msg = "DOMAIN: schemas\nconfig validation failed";
    const keys = await triageFailure("poll-app-ci", msg, NO_NA, SFCC_FAULT_ROUTING, SFCC_WORKFLOW_NODES);
    assert.ok(keys.includes("schema-dev"));
    assert.ok(keys.includes("storefront-dev"));
    assert.ok(keys.includes("storefront-unit-test"));
  });

  it("DOMAIN: unknown falls through to retriever", async () => {
    const msg = "DOMAIN: unknown\ncommerce-sdk-react useProduct failed";
    const keys = await triageFailure("poll-app-ci", msg, NO_NA, SFCC_FAULT_ROUTING, SFCC_WORKFLOW_NODES, SFCC_KB);
    assert.ok(keys.includes("storefront-dev"), `Expected retriever to route: ${keys}`);
  });
});

// ---------------------------------------------------------------------------
// Commerce Storefront — cross-check: no sample-app node leakage
// ---------------------------------------------------------------------------

describe("commerce-storefront: no sample-app node leakage", () => {
  it("frontend domain never resets backend-dev or infra-architect", async () => {
    const msg = makeJsonMsg("frontend", "Chakra UI render failure on PDP");
    const keys = await triageFailure("live-ui", msg, NO_NA, SFCC_FAULT_ROUTING, SFCC_WORKFLOW_NODES);
    assert.ok(!keys.includes("backend-dev"), `Unexpected backend-dev in SFCC: ${keys}`);
    assert.ok(!keys.includes("frontend-dev"), `Unexpected frontend-dev in SFCC: ${keys}`);
    assert.ok(!keys.includes("infra-architect"), `Unexpected infra-architect in SFCC: ${keys}`);
    assert.ok(!keys.includes("frontend-unit-test"), `Unexpected frontend-unit-test in SFCC: ${keys}`);
    // Only SFCC nodes
    assert.ok(keys.includes("storefront-dev"));
    assert.ok(keys.includes("storefront-unit-test"));
  });

  it("schemas domain resets storefront nodes, not sample-app nodes", async () => {
    const msg = makeJsonMsg("schemas", "Config type mismatch");
    const keys = await triageFailure("live-ui", msg, NO_NA, SFCC_FAULT_ROUTING, SFCC_WORKFLOW_NODES);
    assert.ok(!keys.includes("backend-dev"));
    assert.ok(!keys.includes("frontend-dev"));
    assert.ok(!keys.includes("infra-architect"));
    assert.ok(keys.includes("schema-dev"));
    assert.ok(keys.includes("storefront-dev"));
  });
});

// ---------------------------------------------------------------------------
// isOrchestratorTimeout — SDK session timeout detection (Tier -1)
// ---------------------------------------------------------------------------

describe("isOrchestratorTimeout", () => {
  it("matches SDK session timeout (full message)", () => {
    assert.equal(isOrchestratorTimeout("Timeout after 1200000ms waiting for session.idle"), true);
  });
  it("matches shorter SDK timeout", () => {
    assert.equal(isOrchestratorTimeout("Timeout after 900000ms waiting for session.idle"), true);
  });
  it("does NOT match Playwright timeout (no session.idle)", () => {
    assert.equal(isOrchestratorTimeout("Playwright timeout on data-testid=modal"), false);
  });
  it("does NOT match generic TypeError", () => {
    assert.equal(isOrchestratorTimeout("TypeError: Cannot read properties of undefined"), false);
  });
  it("does NOT match poll timeout (no session.idle)", () => {
    assert.equal(isOrchestratorTimeout("⏳ Exiting poll to prevent Copilot timeout."), false);
  });
  it("does NOT match partial match — only 'timeout after' without 'session.idle'", () => {
    assert.equal(isOrchestratorTimeout("Timeout after 600000ms waiting for build"), false);
  });
});

// ---------------------------------------------------------------------------
// triageFailure — SDK timeout bypass (Tier -1 integration)
// ---------------------------------------------------------------------------

describe("triageFailure (SDK timeout bypass — Tier -1)", () => {
  it("SDK timeout → graceful degradation (empty array), not retry", async () => {
    const keys = await triageFailure(
      "live-ui",
      "Timeout after 1200000ms waiting for session.idle",
      NO_NA, SFCC_FAULT_ROUTING, SFCC_WORKFLOW_NODES,
    );
    // Empty array triggers salvageForDraft in triage-dispatcher
    // (NOT [itemKey] which would burn redevelopment cycles then hard-halt)
    assert.deepEqual(keys, []);
  });
  it("SDK timeout on N/A item → also empty (same graceful degradation path)", async () => {
    const naSet = new Set(["live-ui"]);
    const keys = await triageFailure(
      "live-ui",
      "Timeout after 1200000ms waiting for session.idle",
      naSet, SFCC_FAULT_ROUTING, SFCC_WORKFLOW_NODES,
    );
    assert.deepEqual(keys, []);
  });
  it("Playwright timeout is NOT intercepted — falls through to structured triage", async () => {
    const msg = '{"fault_domain":"test-code","diagnostic_trace":"Playwright timeout on data-testid=modal — locator is incorrect"}';
    const keys = await triageFailure(
      "live-ui", msg, NO_NA, SFCC_FAULT_ROUTING, SFCC_WORKFLOW_NODES,
    );
    // test-code domain resets $SELF → ["live-ui"]
    assert.deepEqual(keys, ["live-ui"]);
  });
});

