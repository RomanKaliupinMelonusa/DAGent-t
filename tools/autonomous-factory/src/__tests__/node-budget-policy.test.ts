/**
 * node-budget-policy.test.ts — Validates NodeBudgetPolicy resolution logic.
 *
 * Covers:
 *   - Code-level defaults (no config, no per-node overrides)
 *   - Config-level overrides (cycle_limits, max_same_error_cycles)
 *   - Per-node circuit_breaker overrides (max_item_failures)
 *   - Backward compat: NodeBudgetPolicy is a valid ResolvedCircuitBreaker
 *
 * Run: npx tsx --test src/__tests__/node-budget-policy.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveNodeBudgetPolicy, resolveCircuitBreaker } from "../session/dag-utils.js";
import type { ResolvedCircuitBreaker, NodeBudgetPolicy } from "../app-types.js";
import type { ApmCompiledOutput, ApmWorkflowNode } from "../apm/index.js";

// ---------------------------------------------------------------------------
// Helpers — minimal APM context fixtures
// ---------------------------------------------------------------------------

/** Minimal valid ApmCompiledOutput with no config. */
function bareContext(): ApmCompiledOutput {
  return {
    version: "1.0.0",
    compiledAt: new Date().toISOString(),
    tokenBudget: 8000,
    agents: {},
    workflows: {},
    triage_profiles: {},
  } as ApmCompiledOutput;
}

/** ApmCompiledOutput with config-level overrides. */
function contextWithConfig(overrides: Record<string, unknown>): ApmCompiledOutput {
  return {
    ...bareContext(),
    config: {
      directories: { src: "src", tests: "tests" },
      ...overrides,
    },
  } as unknown as ApmCompiledOutput;
}

/** Minimal workflow node with optional circuit_breaker overrides. */
function nodeWith(cb: Record<string, unknown> = {}): ApmWorkflowNode {
  return {
    type: "agent",
    depends_on: [],
    circuit_breaker: cb,
  } as unknown as ApmWorkflowNode;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("resolveNodeBudgetPolicy", () => {
  it("returns code-level defaults when no node and no config", () => {
    const policy = resolveNodeBudgetPolicy(undefined, bareContext());

    // Circuit breaker defaults
    assert.equal(policy.minAttemptsBeforeSkip, 3);
    assert.equal(policy.allowsRevertBypass, false);
    assert.equal(policy.allowsTimeoutSalvage, false);
    assert.equal(policy.haltOnIdentical, false);
    assert.equal(policy.revertWarningAt, 3);

    // Budget policy defaults
    assert.equal(policy.maxItemFailures, 10);
    assert.equal(policy.maxSameError, 3);
    assert.equal(policy.maxRerouteCycles, 5);
    assert.equal(policy.maxScriptCycles, 10);
  });

  it("reads maxSameError from config.max_same_error_cycles", () => {
    const ctx = contextWithConfig({ max_same_error_cycles: 7 });
    const policy = resolveNodeBudgetPolicy(undefined, ctx);
    assert.equal(policy.maxSameError, 7);
  });

  it("reads maxRerouteCycles from config.cycle_limits.reroute", () => {
    const ctx = contextWithConfig({ cycle_limits: { reroute: 12, scripts: 20 } });
    const policy = resolveNodeBudgetPolicy(undefined, ctx);
    assert.equal(policy.maxRerouteCycles, 12);
    assert.equal(policy.maxScriptCycles, 20);
  });

  it("reads maxItemFailures from per-node circuit_breaker.max_item_failures", () => {
    const node = nodeWith({ max_item_failures: 25 });
    const policy = resolveNodeBudgetPolicy(node, bareContext());
    assert.equal(policy.maxItemFailures, 25);
  });

  it("per-node circuit_breaker fields override code defaults", () => {
    const node = nodeWith({
      min_attempts_before_skip: 5,
      allows_revert_bypass: true,
      allows_timeout_salvage: true,
      halt_on_identical: true,
      revert_warning_at: 7,
    });
    const policy = resolveNodeBudgetPolicy(node, bareContext());
    assert.equal(policy.minAttemptsBeforeSkip, 5);
    assert.equal(policy.allowsRevertBypass, true);
    assert.equal(policy.allowsTimeoutSalvage, true);
    assert.equal(policy.haltOnIdentical, true);
    assert.equal(policy.revertWarningAt, 7);
  });

  it("is structurally compatible with ResolvedCircuitBreaker", () => {
    const policy = resolveNodeBudgetPolicy(undefined, bareContext());
    // Should be assignable to ResolvedCircuitBreaker (TypeScript compile-time check;
    // at runtime we verify the deprecated function returns the same shape).
    const cb: ResolvedCircuitBreaker = policy;
    assert.equal(cb.minAttemptsBeforeSkip, policy.minAttemptsBeforeSkip);
    assert.equal(cb.allowsRevertBypass, policy.allowsRevertBypass);
    assert.equal(cb.revertWarningAt, policy.revertWarningAt);
  });

  it("matches resolveCircuitBreaker output for shared fields", () => {
    const node = nodeWith({
      min_attempts_before_skip: 4,
      allows_revert_bypass: true,
      revert_warning_at: 6,
    });
    const policy = resolveNodeBudgetPolicy(node, bareContext());
    const legacy = resolveCircuitBreaker(node);

    assert.equal(policy.minAttemptsBeforeSkip, legacy.minAttemptsBeforeSkip);
    assert.equal(policy.allowsRevertBypass, legacy.allowsRevertBypass);
    assert.equal(policy.allowsTimeoutSalvage, legacy.allowsTimeoutSalvage);
    assert.equal(policy.haltOnIdentical, legacy.haltOnIdentical);
    assert.equal(policy.revertWarningAt, legacy.revertWarningAt);
  });

  it("falls back to code defaults when config has no cycle_limits", () => {
    const ctx = contextWithConfig({ max_same_error_cycles: 5 }); // no cycle_limits
    const policy = resolveNodeBudgetPolicy(undefined, ctx);
    assert.equal(policy.maxRerouteCycles, 5);  // code default
    assert.equal(policy.maxScriptCycles, 10);  // code default
    assert.equal(policy.maxSameError, 5);       // from config
  });
});
