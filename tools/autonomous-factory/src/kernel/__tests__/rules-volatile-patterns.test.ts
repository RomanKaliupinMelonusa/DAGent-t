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

  it("publish-pr rotating commit-ahead counters collapse to one signature", () => {
    // Regression for the product-quick-view-plp post-mortem: `publish-pr`
    // failed 6 times with 6 distinct `errorSignature` values because the
    // raw error message embedded a rotating "N commit(s) ahead of …"
    // counter and a "branch '…' set up to track '…'" line that drifts
    // between cycles even when the root cause is identical.
    //
    // Mirrors `apps/commerce-storefront/.apm/apm.yml` →
    // config.error_signature.volatile_patterns. With these patterns
    // active, the four rotating-counter samples below must hash to one
    // signature so `halt_on_identical` fires on iteration 3 instead of
    // looping past the cap.
    const workflowPatterns = compileVolatilePatterns([
      { pattern: "\\d+\\s+commit\\(s\\)\\s+ahead\\s+of\\s+\\S+", replacement: "<COMMITS_AHEAD>" },
      { pattern: "branch\\s+'[^']+'\\s+set up to track\\s+'[^']+'", replacement: "<BRANCH_TRACKING>" },
      { pattern: "✔\\s+Pushed\\s+\\S+\\s+to\\s+origin", replacement: "<PUSH_OK>" },
    ]);
    const rules = new DefaultKernelRules({ workflowPatterns });

    // Verbatim from the real run's errorLog (cycles 1, 2, 3, 6).
    const samples = [
      "ℹ️  No changes to commit.\nbranch 'feature/product-quick-view-plp' set up to track 'origin/feature/product-quick-view-plp'.\n✔ Pushed feature/product-quick-view-plp to origin (3 commit(s) ahead of update/pipeline-communication-standartisation)\n  ✖ No existing Draft PR found",
      "ℹ️  No changes to commit.\nbranch 'feature/product-quick-view-plp' set up to track 'origin/feature/product-quick-view-plp'.\n✔ Pushed feature/product-quick-view-plp to origin (4 commit(s) ahead of update/pipeline-communication-standartisation)\n  ✖ No existing Draft PR found",
      "ℹ️  No changes to commit.\nbranch 'feature/product-quick-view-plp' set up to track 'origin/feature/product-quick-view-plp'.\n✔ Pushed feature/product-quick-view-plp to origin (5 commit(s) ahead of update/pipeline-communication-standartisation)\n  ✖ No existing Draft PR found",
      "ℹ️  No changes to commit.\nbranch 'feature/product-quick-view-plp' set up to track 'origin/feature/product-quick-view-plp'.\n✔ Pushed feature/product-quick-view-plp to origin (8 commit(s) ahead of update/pipeline-communication-standartisation)\n  ✖ No existing Draft PR found",
    ];

    const sigs = samples.map((s) => rules.computeErrorSignature(s));
    const unique = new Set(sigs);
    assert.equal(
      unique.size,
      1,
      `expected a single stable signature across rotating counters, got ${unique.size}: ${[...unique].join(", ")}`,
    );

    // A genuinely different root cause (envelope validation) must NOT
    // collapse into the same bucket — distinct failures keep distinct
    // signatures.
    const distinct =
      "Upstream artifact 'change-manifest' failed consumer-side validation: " +
      "Artifact 'change-manifest' at /repo/x.json failed schema validation: " +
      "envelope.schemaVersion: Invalid input: expected number, received undefined";
    assert.notEqual(rules.computeErrorSignature(distinct), sigs[0]);
  });
});

describe("DefaultKernelRules — onUserPatternFired telemetry hook", () => {
  it("fires once per workflow-scope pattern, deduped across calls", () => {
    const events: Array<{ scope: string; patternIndex: number; itemKey: string | null }> = [];
    const workflowPatterns = compileVolatilePatterns([
      { pattern: "fixture-\\w+", replacement: "<FX>" },
      { pattern: "trace-\\d+", replacement: "<TR>" },
    ]);
    const rules = new DefaultKernelRules({
      workflowPatterns,
      onUserPatternFired: (e) => events.push({
        scope: e.scope, patternIndex: e.patternIndex, itemKey: e.itemKey,
      }),
    });

    rules.fail(makeState("t1"), "t1", "fixture-alpha trace-12");
    rules.fail(makeState("t1"), "t1", "fixture-omega trace-99");
    rules.fail(makeState("t1"), "t1", "fixture-foo trace-7");

    assert.equal(events.length, 2, "expected one event per pattern, deduped across calls");
    const indices = events.map((e) => e.patternIndex).sort();
    assert.deepEqual(indices, [0, 1]);
    assert.ok(events.every((e) => e.scope === "workflow"));
  });

  it("does not fire for patterns that never match", () => {
    const events: unknown[] = [];
    const workflowPatterns = compileVolatilePatterns([
      { pattern: "never-matches-anything", replacement: "<X>" },
    ]);
    const rules = new DefaultKernelRules({
      workflowPatterns,
      onUserPatternFired: (e) => events.push(e),
    });
    rules.fail(makeState("t1"), "t1", "totally unrelated message");
    assert.equal(events.length, 0);
  });

  it("distinguishes workflow vs node scope and applies node dedupe per item", () => {
    const events: Array<{ scope: string; patternIndex: number; itemKey: string | null }> = [];
    const workflowPatterns = compileVolatilePatterns([
      { pattern: "wf-\\w+", replacement: "<WF>" },
    ]);
    const perNodePatterns = new Map([
      ["t1", compileVolatilePatterns([{ pattern: "n-\\w+", replacement: "<N>" }])],
    ]);
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
    const rules = new DefaultKernelRules({
      workflowPatterns,
      perNodePatterns,
      onUserPatternFired: (e) => events.push({
        scope: e.scope, patternIndex: e.patternIndex, itemKey: e.itemKey,
      }),
    });

    rules.fail(base, "t1", "wf-foo n-bar");
    rules.fail(base, "t2", "wf-baz");
    rules.fail(base, "t2", "n-leak");
    // Expected: workflow fired once (t1's first call); node fired once for t1.
    // t2 has no node patterns, and "n-leak" must not produce a node event for t2.
    assert.equal(events.length, 2);
    assert.ok(events.some((e) => e.scope === "workflow" && e.itemKey === "t1"));
    assert.ok(events.some((e) => e.scope === "node" && e.itemKey === "t1"));
    assert.ok(!events.some((e) => e.scope === "node" && e.itemKey === "t2"));
  });
});

