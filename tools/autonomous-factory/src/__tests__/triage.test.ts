/**
 * triage.test.ts — Unit tests for triage utilities.
 *
 * Uses Node.js built-in test runner (node:test) — zero dependencies.
 * Run: npx tsx src/__tests__/triage.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isUnfixableError, isOrchestratorTimeout } from "../triage/index.js";

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
