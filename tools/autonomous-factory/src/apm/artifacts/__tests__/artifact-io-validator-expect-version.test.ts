/**
 * artifact-io-validator-expect-version.test.ts — Session A (Items 7/8).
 *
 * Covers the compile-time `expectSchemaVersion` pin on
 * `consumes_artifacts` edges:
 *   - matching producer catalog version compiles cleanly
 *   - mismatched version is rejected
 *   - pinning a kind with no catalog schemaVersion is rejected
 *   - omitting the pin is still legal (opt-in)
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { ApmWorkflowSchema, type ApmWorkflow } from "../../manifest/types.js";
import { validateArtifactIO } from "../artifact-io-validator.js";
import { getArtifactSchemaVersion } from "../artifact-catalog.js";

function node(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { category: "dev", agent: "x", depends_on: [], ...overrides };
}

function buildWorkflow(nodes: Record<string, Record<string, unknown>>): ApmWorkflow {
  const parsed = ApmWorkflowSchema.safeParse({ nodes });
  if (!parsed.success) {
    throw new Error(
      `test fixture failed to parse: ${parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join(", ")}`,
    );
  }
  return parsed.data;
}

describe("validateArtifactIO — expectSchemaVersion pin", () => {
  it("accepts a pin that matches the producer's catalog schemaVersion", () => {
    const v = getArtifactSchemaVersion("qa-report");
    assert.equal(v, 1, "qa-report must have a catalog schemaVersion for this test");

    const wf = buildWorkflow({
      "qa": node({ produces_artifacts: ["qa-report"] }),
      "dev": node({
        depends_on: ["qa"],
        consumes_artifacts: [
          { from: "qa", kind: "qa-report", expectSchemaVersion: 1 },
        ],
      }),
    });
    const { warnings } = validateArtifactIO("demo", wf);
    assert.deepEqual(warnings, []);
  });

  it("omitting the pin remains legal (opt-in)", () => {
    const wf = buildWorkflow({
      "qa": node({ produces_artifacts: ["qa-report"] }),
      "dev": node({
        depends_on: ["qa"],
        consumes_artifacts: [{ from: "qa", kind: "qa-report" }],
      }),
    });
    assert.doesNotThrow(() => validateArtifactIO("demo", wf));
  });

  it("rejects a pin whose value diverges from the producer's catalog version", () => {
    const wf = buildWorkflow({
      "qa": node({ produces_artifacts: ["qa-report"] }),
      "dev": node({
        depends_on: ["qa"],
        consumes_artifacts: [
          { from: "qa", kind: "qa-report", expectSchemaVersion: 2 },
        ],
      }),
    });
    assert.throws(
      () => validateArtifactIO("demo", wf),
      /expects schemaVersion=2.*advertises schemaVersion=1/s,
    );
  });

  it("rejects pinning a kind that has no catalog-level schemaVersion", () => {
    // `halt` intentionally has no schemaVersion (schema-free inline kind).
    assert.equal(getArtifactSchemaVersion("halt"), undefined);

    const wf = buildWorkflow({
      "producer": node({ produces_artifacts: ["halt"] }),
      "consumer": node({
        depends_on: ["producer"],
        consumes_artifacts: [
          { from: "producer", kind: "halt", expectSchemaVersion: 1 },
        ],
      }),
    });
    assert.throws(
      () => validateArtifactIO("demo", wf),
      /no catalog-level schemaVersion/,
    );
  });
});
