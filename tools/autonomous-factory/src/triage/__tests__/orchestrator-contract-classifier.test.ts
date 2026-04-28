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

  it("does NOT classify missing_required_output:<kind> — that is a producer-side fault routed via schema-violation", () => {
    // Producer-side faults must NOT short-circuit through this guard;
    // they are routed via L0 schema-violation patterns in
    // `triage/builtin-patterns.ts` to the producer node's
    // `on_failure.routes[schema-violation]` (typically `$SELF`).
    assert.equal(
      classifyOrchestratorContractError("missing_required_output:triage-handoff"),
      null,
    );
    assert.equal(
      classifyOrchestratorContractError("missing_required_output:debug-notes"),
      null,
    );
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
