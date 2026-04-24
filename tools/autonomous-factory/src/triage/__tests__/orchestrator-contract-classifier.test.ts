/**
 * triage/__tests__/orchestrator-contract-classifier.test.ts
 *
 * Deterministic L0 classifier for orchestrator-origin contract signatures
 * emitted by the dispatch middleware. Routing these through RAG / LLM is
 * actively harmful — the LLM mis-blames producers when the actual fault
 * is in the kernel↔state-store ledger sync or a workflow's declared
 * produces/consumes wiring.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyOrchestratorContractError } from "../index.js";

describe("classifyOrchestratorContractError", () => {
  it("classifies missing_required_input:<kind> as missing-input", () => {
    const v = classifyOrchestratorContractError("missing_required_input:acceptance");
    assert.ok(v, "should match");
    assert.equal(v!.kind, "missing-input");
    assert.equal(v!.artifact, "acceptance");
  });

  it("classifies missing_required_output:<kind> as missing-output", () => {
    const v = classifyOrchestratorContractError("missing_required_output:triage-handoff");
    assert.ok(v, "should match");
    assert.equal(v!.kind, "missing-output");
    assert.equal(v!.artifact, "triage-handoff");
  });

  it("captures complex artifact names with dots and dashes", () => {
    const v = classifyOrchestratorContractError("missing_required_input:baseline.profile-v2");
    assert.equal(v!.artifact, "baseline.profile-v2");
  });

  it("returns null for unrelated signatures", () => {
    assert.equal(classifyOrchestratorContractError("invalid_envelope_input:acceptance"), null);
    assert.equal(classifyOrchestratorContractError("timeout_after_30000ms"), null);
    assert.equal(classifyOrchestratorContractError("some.generic.error"), null);
  });

  it("returns null for empty / nullish input", () => {
    assert.equal(classifyOrchestratorContractError(undefined), null);
    assert.equal(classifyOrchestratorContractError(null), null);
    assert.equal(classifyOrchestratorContractError(""), null);
  });

  it("does NOT match a substring occurrence", () => {
    // Anchor at start — a partial containing the token should not classify.
    assert.equal(
      classifyOrchestratorContractError("prefix_missing_required_input:x"),
      null,
    );
  });
});
