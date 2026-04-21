/**
 * kernel/__tests__/rules-volatile-patterns.test.ts — Phase C Stage 2.
 *
 * Verifies that DefaultKernelRules injects workflow-level and per-node
 * volatile-token patterns into failItem/resetNodes signature computation.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DefaultKernelRules } from "../rules.js";
import { compileVolatilePatterns } from "../../domain/index.js";
import type { TransitionState } from "../../domain/index.js";

function makeState(itemKey: string): TransitionState {
  return {
    items: [
      { key: itemKey, label: "T", agent: null, status: "pending", error: null },
    ],
    errorLog: [],
    dependencies: { [itemKey]: [] },
    nodeTypes: { [itemKey]: "script" },
    nodeCategories: { [itemKey]: "test" },
    naByType: [],
    salvageSurvivors: [],
  };
}

describe("DefaultKernelRules — volatile patterns injection", () => {
  it("defaults match computeErrorSignature with no extras", () => {
    const rules = new DefaultKernelRules();
    const s1 = rules.fail(makeState("t1"), "t1", "oops");
    const s2 = rules.fail(makeState("t1"), "t1", "oops");
    assert.equal(
      s1.state.errorLog[0]!.errorSignature,
      s2.state.errorLog[0]!.errorSignature,
    );
    // Sanity: different messages → different signatures
    const s3 = rules.fail(makeState("t1"), "t1", "different");
    assert.notEqual(
      s1.state.errorLog[0]!.errorSignature,
      s3.state.errorLog[0]!.errorSignature,
    );
  });

  it("workflow-level patterns normalize fail() signatures", () => {
    const workflowPatterns = compileVolatilePatterns([
      { pattern: "fixture-\\w+", replacement: "<FIXTURE>" },
    ]);
    const rules = new DefaultKernelRules({ workflowPatterns });
    const a = rules.fail(makeState("t1"), "t1", "failed for fixture-alpha");
    const b = rules.fail(makeState("t1"), "t1", "failed for fixture-omega");
    assert.equal(
      a.state.errorLog[0]!.errorSignature,
      b.state.errorLog[0]!.errorSignature,
    );
  });

  it("per-node patterns apply only to the matching key", () => {
    const perNodePatterns = new Map([
      ["t1", compileVolatilePatterns([
        { pattern: "fixture-\\w+", replacement: "<FIXTURE>" },
      ])],
    ]);
    const rules = new DefaultKernelRules({ perNodePatterns });

    // Build state with t1 AND t2 so we can fail either
    const base: TransitionState = {
      items: [
        { key: "t1", label: "T1", agent: null, status: "pending", error: null },
        { key: "t2", label: "T2", agent: null, status: "pending", error: null },
      ],
      errorLog: [],
      dependencies: { t1: [], t2: [] },
      nodeTypes: { t1: "script", t2: "script" },
      nodeCategories: { t1: "test", t2: "test" },
      naByType: [],
      salvageSurvivors: [],
    };

    const t1a = rules.fail(base, "t1", "failed for fixture-alpha");
    const t1b = rules.fail(base, "t1", "failed for fixture-omega");
    assert.equal(
      t1a.state.errorLog[0]!.errorSignature,
      t1b.state.errorLog[0]!.errorSignature,
      "t1 has per-node pattern → normalized",
    );

    const t2a = rules.fail(base, "t2", "failed for fixture-alpha");
    const t2b = rules.fail(base, "t2", "failed for fixture-omega");
    assert.notEqual(
      t2a.state.errorLog[0]!.errorSignature,
      t2b.state.errorLog[0]!.errorSignature,
      "t2 has NO per-node pattern → distinct signatures",
    );
  });

  it("reset() also uses composed signatureFn", () => {
    const workflowPatterns = compileVolatilePatterns([
      { pattern: "run-\\d+", replacement: "<RUN>" },
    ]);
    const rules = new DefaultKernelRules({ workflowPatterns });
    const a = rules.reset(makeState("t1"), "t1", "redo run-42");
    const b = rules.reset(makeState("t1"), "t1", "redo run-99");
    // Find reset-nodes entries
    const sigA = a.state.errorLog.find((e) => e.itemKey === "reset-nodes")!.errorSignature;
    const sigB = b.state.errorLog.find((e) => e.itemKey === "reset-nodes")!.errorSignature;
    assert.equal(sigA, sigB);
  });

  it("computeErrorSignature() method uses workflow patterns only", () => {
    const workflowPatterns = compileVolatilePatterns([
      { pattern: "tok-\\w+", replacement: "<TOK>" },
    ]);
    const rules = new DefaultKernelRules({ workflowPatterns });
    assert.equal(
      rules.computeErrorSignature("saw tok-abc"),
      rules.computeErrorSignature("saw tok-xyz"),
    );
  });

  it("app-declared Playwright volatile patterns collapse rotating e2e output", () => {
    // Mirrors the patterns a Playwright-based app would declare in
    // `.apm/workflows.yml` under error_signature.volatile_patterns.
    // Two real-shape Playwright failure blobs that differ only in volatile
    // tokens should produce IDENTICAL signatures so `halt_on_identical` fires.
    const workflowPatterns = compileVolatilePatterns([
      { pattern: "\\d+ passed(?:, \\d+ failed)?(?:, \\d+ total)?", replacement: "<PW_TOTALS>" },
      { pattern: "Running \\d+ tests? using \\d+ workers?", replacement: "<PW_RUN>" },
      { pattern: "\\[\\d+/\\d+\\]", replacement: "<PW_PROGRESS>" },
      { pattern: "\\(\\d+(?:\\.\\d+)?\\s*(?:ms|m|s)\\)", replacement: "<DUR>" },
      { pattern: "Timeout \\d+ms exceeded", replacement: "Timeout <MS>ms exceeded" },
      { pattern: "test-results/[^\\s)\"'`]+", replacement: "<TEST_RESULT>" },
      { pattern: "attachment #\\d+", replacement: "attachment #<N>" },
      { pattern: "\\d+ did not run", replacement: "<PW_NOTRUN>" },
    ]);
    const rules = new DefaultKernelRules({ workflowPatterns });

    const cycle1 = [
      "Running 14 tests using 4 workers",
      "  [1/14] widget-feature.spec.ts:12",
      "  [4/14] widget-feature.spec.ts:33",
      "  1) widget-feature.spec.ts:12 › widget opens (59.6s)",
      "     Error: getServerSnapshot should be cached to avoid infinite loop",
      "     Timeout 20000ms exceeded.",
      "     attachment #1: screenshot",
      "     test-results/widget-feature-Widget-e5210-opens/trace.zip",
      "  3 passed, 3 failed, 6 total",
      "  8 did not run",
    ].join("\n");

    const cycle2 = [
      "Running 14 tests using 2 workers",
      "  [3/14] widget-feature.spec.ts:12",
      "  [9/14] widget-feature.spec.ts:33",
      "  1) widget-feature.spec.ts:12 › widget opens (1.6m)",
      "     Error: getServerSnapshot should be cached to avoid infinite loop",
      "     Timeout 20000ms exceeded.",
      "     attachment #4: screenshot",
      "     test-results/widget-feature-Widget-a9931-opens/trace.zip",
      "  2 passed, 4 failed, 6 total",
      "  6 did not run",
    ].join("\n");

    assert.equal(
      rules.computeErrorSignature(cycle1),
      rules.computeErrorSignature(cycle2),
      "Playwright volatile tokens must collapse to one signature",
    );
  });
});
