/**
 * entry/__tests__/resolve-volatile-patterns.test.ts —
 *
 * Locks in the resolution path between `apm.yml` config and the kernel's
 * fingerprinter. The bug this guards against: patterns authored under a
 * dead config path that the runtime never reads (originally
 * `workflows[name].error_signature` at the workflow root, which is
 * documented as ignored in the storefront workflows.yml). Every entry
 * here asserts a real config shape end-to-end:
 *
 *     apmContext → resolveVolatilePatternsFromApmContext → DefaultKernelRules
 *                                                        → fail/reset signatures
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveVolatilePatternsFromApmContext } from "../resolve-volatile-patterns.js";
import { DefaultKernelRules } from "../../kernel/rules.js";
import type { ApmCompiledOutput } from "../../apm/types.js";
import type { TransitionState } from "../../domain/index.js";

function makeState(...keys: string[]): TransitionState {
  return {
    items: keys.map((k) => ({
      key: k, label: k.toUpperCase(), agent: null, status: "pending", error: null,
    })),
    errorLog: [],
    dependencies: Object.fromEntries(keys.map((k) => [k, []])),
    nodeTypes: Object.fromEntries(keys.map((k) => [k, "script"])),
    nodeCategories: Object.fromEntries(keys.map((k) => [k, "test"])),
    naByType: [],
    salvageSurvivors: [],
  };
}

/**
 * Minimal ApmCompiledOutput-shaped fixture. The schema is wider but the
 * resolver only touches `config.error_signature.volatile_patterns` and
 * `workflows[name].nodes[*].error_signature.volatile_patterns`.
 */
function makeApmContext(opts: {
  workflowPatterns?: ReadonlyArray<{ pattern: string; replacement: string }>;
  nodePatterns?: Record<string, ReadonlyArray<{ pattern: string; replacement: string }>>;
  /** Anti-trap: patterns at the dead workflow-root path. */
  deadWorkflowRootPatterns?: ReadonlyArray<{ pattern: string; replacement: string }>;
}): ApmCompiledOutput {
  const nodes: Record<string, unknown> = {};
  for (const [k, patterns] of Object.entries(opts.nodePatterns ?? {})) {
    nodes[k] = patterns.length > 0
      ? { error_signature: { volatile_patterns: patterns } }
      : {};
  }
  return {
    config: opts.workflowPatterns
      ? { error_signature: { volatile_patterns: opts.workflowPatterns } }
      : undefined,
    workflows: {
      storefront: {
        nodes,
        // Dead path — must NOT be read by the resolver. The wrapper key
        // `error_signature` at the workflow root has no runtime meaning;
        // see workflows.yml comment in apps/commerce-storefront/.apm/.
        ...(opts.deadWorkflowRootPatterns
          ? { error_signature: { volatile_patterns: opts.deadWorkflowRootPatterns } }
          : {}),
      },
    },
  } as unknown as ApmCompiledOutput;
}

describe("resolveVolatilePatternsFromApmContext", () => {
  it("compiles workflow-scope patterns from config.error_signature.volatile_patterns", () => {
    const apmContext = makeApmContext({
      workflowPatterns: [{ pattern: "fixture-\\w+", replacement: "<FX>" }],
    });
    const { workflowPatterns, perNodePatterns } =
      resolveVolatilePatternsFromApmContext(apmContext, "storefront");

    assert.equal(workflowPatterns.length, 1);
    assert.equal(perNodePatterns.size, 0);

    // End-to-end: workflow patterns reach DefaultKernelRules and collapse
    // signatures across all items.
    const rules = new DefaultKernelRules({ workflowPatterns, perNodePatterns });
    const a = rules.fail(makeState("any-node"), "any-node", "saw fixture-alpha");
    const b = rules.fail(makeState("any-node"), "any-node", "saw fixture-omega");
    assert.equal(
      a.state.errorLog[0]!.errorSignature,
      b.state.errorLog[0]!.errorSignature,
    );
  });

  it("collects per-node patterns and they EXTEND (not replace) workflow scope", () => {
    const apmContext = makeApmContext({
      workflowPatterns: [{ pattern: "fixture-\\w+", replacement: "<FX>" }],
      nodePatterns: {
        "e2e-runner": [{ pattern: "trace-\\d+", replacement: "<TRACE>" }],
        "qa-adversary": [],
      },
    });
    const { workflowPatterns, perNodePatterns } =
      resolveVolatilePatternsFromApmContext(apmContext, "storefront");

    assert.equal(perNodePatterns.size, 1);
    assert.ok(perNodePatterns.has("e2e-runner"));
    assert.equal(perNodePatterns.get("e2e-runner")!.length, 1);

    const rules = new DefaultKernelRules({ workflowPatterns, perNodePatterns });

    // e2e-runner sees both fixture- AND trace- normalized → identical sigs.
    const stA = rules.fail(makeState("e2e-runner"), "e2e-runner", "fixture-alpha trace-12");
    const stB = rules.fail(makeState("e2e-runner"), "e2e-runner", "fixture-omega trace-99");
    assert.equal(
      stA.state.errorLog[0]!.errorSignature,
      stB.state.errorLog[0]!.errorSignature,
      "e2e-runner: workflow + node patterns must compose",
    );

    // qa-adversary sees only fixture- → trace-N drift remains distinct.
    const qaA = rules.fail(makeState("qa-adversary"), "qa-adversary", "trace-12");
    const qaB = rules.fail(makeState("qa-adversary"), "qa-adversary", "trace-99");
    assert.notEqual(
      qaA.state.errorLog[0]!.errorSignature,
      qaB.state.errorLog[0]!.errorSignature,
      "qa-adversary: node-scope must NOT leak from e2e-runner",
    );
  });

  it("ignores legacy workflow-root error_signature blocks (regression — dead config trap)", () => {
    // Authored at the dead path; runtime must NOT read this. Reproduces
    // the original bug where a Playwright pattern set was authored under
    // the workflow root and silently never reached the fingerprinter.
    const apmContext = makeApmContext({
      deadWorkflowRootPatterns: [
        { pattern: "fixture-\\w+", replacement: "<FX>" },
      ],
    });
    const { workflowPatterns, perNodePatterns } =
      resolveVolatilePatternsFromApmContext(apmContext, "storefront");

    assert.equal(
      workflowPatterns.length, 0,
      "workflow-root error_signature must not be picked up by the resolver",
    );
    assert.equal(perNodePatterns.size, 0);
  });

  it("returns empty maps when the workflow does not exist", () => {
    const apmContext = makeApmContext({
      workflowPatterns: [{ pattern: "x", replacement: "<X>" }],
      nodePatterns: { "n": [{ pattern: "y", replacement: "<Y>" }] },
    });
    const { workflowPatterns, perNodePatterns } =
      resolveVolatilePatternsFromApmContext(apmContext, "does-not-exist");

    assert.equal(workflowPatterns.length, 1, "workflow scope is workflow-name agnostic");
    assert.equal(
      perNodePatterns.size, 0,
      "per-node scope is empty for unknown workflow names",
    );
  });

  it("returns fully empty when no error_signature configured anywhere", () => {
    const apmContext = makeApmContext({});
    const { workflowPatterns, perNodePatterns } =
      resolveVolatilePatternsFromApmContext(apmContext, "storefront");
    assert.equal(workflowPatterns.length, 0);
    assert.equal(perNodePatterns.size, 0);
  });
});
