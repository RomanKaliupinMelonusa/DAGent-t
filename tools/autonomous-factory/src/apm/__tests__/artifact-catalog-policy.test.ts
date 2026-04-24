/**
 * artifact-catalog-policy.test.ts — Session R8 body-schema coverage audit.
 *
 * Locks in the 6/11/5 policy classification of the 22 built-in artifact
 * kinds:
 *   - 6 STRICT kinds (typed contract, schema required)
 *   - 11 ENVELOPE-ONLY kinds (envelope enforced, body free-form)
 *   - 5 INTERNAL kinds (handler/kernel-private, no cross-node contract)
 *
 * Plus the two derived lint invariants:
 *   1. Every STRICT kind must declare a `schema` (catalog-level lint).
 *   2. Declaring an INTERNAL kind on a workflow edge emits a warning
 *      (per-node lint).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";

import {
  ArtifactCatalogPolicyError,
  getArtifactPolicy,
  listArtifactKinds,
  validateArtifactCatalogPolicy,
  type ArtifactKind,
  type ArtifactKindDef,
} from "../artifact-catalog.js";
import { ApmWorkflowSchema, type ApmWorkflow } from "../types.js";
import { validateArtifactIO } from "../artifact-io-validator.js";

// ---------------------------------------------------------------------------
// Classification snapshot
// ---------------------------------------------------------------------------

const EXPECTED_POLICY: Record<ArtifactKind, "strict" | "envelope-only" | "internal"> = {
  // STRICT (6) — typed contracts, each already carries a schema.
  acceptance: "strict",
  validation: "strict",
  "qa-report": "strict",
  "triage-handoff": "strict",
  "deployment-url": "strict",
  "implementation-status": "strict",

  // ENVELOPE-ONLY (10) — envelope enforced, body free-form or externally owned.
  spec: "envelope-only",
  baseline: "envelope-only",
  "debug-notes": "envelope-only",
  "playwright-report": "envelope-only",
  "playwright-log": "envelope-only",
  "change-manifest": "envelope-only",
  halt: "envelope-only",
  summary: "envelope-only",
  "terminal-log": "envelope-only",
  "novel-triage": "envelope-only",
  "handler-output": "envelope-only",

  // INTERNAL (5) — handler/kernel-private, never on declared edges.
  "summary-data": "internal",
  "flight-data": "internal",
  params: "internal",
  meta: "internal",
  "node-report": "internal",
};

describe("artifact-catalog policy classification", () => {
  it("every registered kind has a policy and matches the classification snapshot", () => {
    const defs = listArtifactKinds();
    for (const def of defs) {
      const expected = EXPECTED_POLICY[def.id as ArtifactKind];
      assert.ok(
        expected !== undefined,
        `kind "${def.id}" is not accounted for in EXPECTED_POLICY — add it to the snapshot after deciding its bucket`,
      );
      assert.equal(
        def.policy,
        expected,
        `kind "${def.id}": expected policy "${expected}", got "${def.policy}"`,
      );
    }
  });

  it("classification counts are 6 strict / 11 envelope-only / 5 internal = 22 total", () => {
    const defs = listArtifactKinds();
    const counts = defs.reduce<Record<string, number>>((acc, d) => {
      acc[d.policy] = (acc[d.policy] ?? 0) + 1;
      return acc;
    }, {});
    assert.equal(counts.strict, 6);
    assert.equal(counts["envelope-only"], 11);
    assert.equal(counts.internal, 5);
    assert.equal(defs.length, 22);
  });

  it("every STRICT kind declares a schema", () => {
    for (const def of listArtifactKinds()) {
      if (def.policy !== "strict") continue;
      assert.ok(
        def.schema,
        `STRICT kind "${def.id}" must declare a schema — reclassify or author it`,
      );
    }
  });

  it("getArtifactPolicy resolves the declared policy for every kind", () => {
    for (const def of listArtifactKinds()) {
      assert.equal(getArtifactPolicy(def.id as ArtifactKind), def.policy);
    }
  });
});

// ---------------------------------------------------------------------------
// Catalog-level lint — STRICT without schema
// ---------------------------------------------------------------------------

describe("validateArtifactCatalogPolicy", () => {
  it("passes on the live registry", () => {
    assert.doesNotThrow(() => validateArtifactCatalogPolicy());
  });

  it("throws when a STRICT kind lacks a schema", () => {
    const synthetic: ArtifactKindDef[] = [
      {
        id: "bogus-strict",
        ext: "json",
        scopes: ["node"],
        description: "synthetic test fixture",
        policy: "strict",
        envelope: "inline",
        // schema intentionally omitted
      },
    ];
    assert.throws(
      () => validateArtifactCatalogPolicy(synthetic),
      (err: unknown) => {
        assert.ok(err instanceof ArtifactCatalogPolicyError);
        assert.match((err as Error).message, /bogus-strict/);
        assert.match((err as Error).message, /strict/);
        return true;
      },
    );
  });

  it("passes when a STRICT kind carries a schema", () => {
    const synthetic: ArtifactKindDef[] = [
      {
        id: "ok-strict",
        ext: "json",
        scopes: ["node"],
        description: "synthetic test fixture",
        policy: "strict",
        envelope: "inline",
        schema: z.object({ ok: z.literal(true) }),
      },
    ];
    assert.doesNotThrow(() => validateArtifactCatalogPolicy(synthetic));
  });

  it("passes for ENVELOPE-ONLY / INTERNAL kinds without a schema", () => {
    const synthetic: ArtifactKindDef[] = [
      {
        id: "ok-envelope",
        ext: "md",
        scopes: ["node"],
        description: "synthetic",
        policy: "envelope-only",
        envelope: "inline",
      },
      {
        id: "ok-internal",
        ext: "json",
        scopes: ["node"],
        description: "synthetic",
        policy: "internal",
      },
    ];
    assert.doesNotThrow(() => validateArtifactCatalogPolicy(synthetic));
  });
});

// ---------------------------------------------------------------------------
// Per-node lint — INTERNAL crossing declared edges
// ---------------------------------------------------------------------------

function buildWorkflow(nodes: Record<string, Record<string, unknown>>): ApmWorkflow {
  const parsed = ApmWorkflowSchema.safeParse({ nodes });
  if (!parsed.success) {
    throw new Error(
      `test fixture failed to parse: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`,
    );
  }
  return parsed.data;
}

function makeNode(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { category: "dev", agent: "x", depends_on: [], ...overrides };
}

describe("validateArtifactIO — INTERNAL-on-edge warning (Session R8)", () => {
  it("warns when an INTERNAL kind appears in produces_artifacts", () => {
    const wf = buildWorkflow({
      "some-node": makeNode({ produces_artifacts: ["params"] }),
    });
    const { warnings } = validateArtifactIO("demo", wf);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0]!.node, "some-node");
    assert.match(warnings[0]!.message, /produces_artifacts/);
    assert.match(warnings[0]!.message, /"params"/);
    assert.match(warnings[0]!.message, /internal/);
  });

  it("warns when an INTERNAL kind appears in consumes_artifacts", () => {
    const wf = buildWorkflow({
      upstream: makeNode({ produces_artifacts: ["params"] }),
      downstream: makeNode({
        depends_on: ["upstream"],
        consumes_artifacts: [
          { from: "upstream", kind: "params", required: false },
        ],
      }),
    });
    const { warnings } = validateArtifactIO("demo", wf);
    // One warning for the producer side, one for the consumer side.
    assert.equal(warnings.length, 2);
    const consumerWarn = warnings.find((w) => w.node === "downstream");
    assert.ok(consumerWarn, "expected a warning on the consumer node");
    assert.match(consumerWarn!.message, /consumes_artifacts/);
    assert.match(consumerWarn!.message, /internal/);
  });

  it("does not warn on STRICT or ENVELOPE-ONLY kinds", () => {
    const wf = buildWorkflow({
      producer: makeNode({
        consumes_kickoff: ["spec"],
        produces_artifacts: ["triage-handoff", "baseline"],
      }),
      consumer: makeNode({
        depends_on: ["producer"],
        consumes_artifacts: [
          { from: "producer", kind: "triage-handoff" },
          { from: "producer", kind: "baseline", required: false },
        ],
      }),
    });
    const { warnings } = validateArtifactIO("demo", wf);
    // No INTERNAL-policy warnings. (Other warning classes should also be
    // absent on this happy-path fixture.)
    for (const w of warnings) {
      assert.doesNotMatch(w.message, /internal/);
    }
  });
});
