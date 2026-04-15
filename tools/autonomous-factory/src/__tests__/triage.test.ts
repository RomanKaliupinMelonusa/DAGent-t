/**
 * triage.test.ts — Unit tests for triage utilities.
 *
 * Uses Node.js built-in test runner (node:test) — zero dependencies.
 * Run: npx tsx src/__tests__/triage.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isUnfixableError, isOrchestratorTimeout } from "../triage.js";
import { normalizeDiagnosticTrace } from "../session-runner.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * The canonical unfixable_signals fixture — mirrors apps/sample-app/.apm/workflows.yml.
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

// ---------------------------------------------------------------------------
// isUnfixableError — Fatal fast-fail circuit breaker
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

// ---------------------------------------------------------------------------
// normalizeDiagnosticTrace — Trace normalization for dedup
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
// isOrchestratorTimeout — SDK session timeout detection
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
