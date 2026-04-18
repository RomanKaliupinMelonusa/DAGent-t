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
});
