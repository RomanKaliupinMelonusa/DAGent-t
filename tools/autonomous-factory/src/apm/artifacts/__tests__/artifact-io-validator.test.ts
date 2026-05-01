/**
 * artifact-io-validator.test.ts — Phase 3 tests for the compile-time
 * validator that enforces declarative artifact I/O on workflow nodes.
 *
 * Exercises:
 *   - unknown kind ids are rejected
 *   - scope mismatch is rejected (kickoff-only kind in produces_artifacts, etc.)
 *   - consumes_artifacts.from must be a topological ancestor
 *   - producer must declare the consumed kind in its produces_artifacts
 *     (required=true → fatal; required=false → warning)
 *   - self-referencing consumes_artifacts requires pick:"previous"
 *   - legacy workflows without any artifact declarations compile as warnings-only
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ApmWorkflowSchema, ApmCompileError, type ApmWorkflow } from "../../manifest/types.js";
import { validateArtifactIO } from "../artifact-io-validator.js";

// Minimal node body fields that the workflow schema requires. Everything
// else falls back to schema defaults.
function node(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    category: "dev",
    agent: "x",
    depends_on: [],
    ...overrides,
  };
}

function buildWorkflow(nodes: Record<string, Record<string, unknown>>): ApmWorkflow {
  const parsed = ApmWorkflowSchema.safeParse({ nodes });
  if (!parsed.success) {
    throw new Error(
      `test fixture failed to parse: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`,
    );
  }
  return parsed.data;
}

describe("validateArtifactIO", () => {
  it("passes for a workflow without any artifact declarations", () => {
    const wf = buildWorkflow({
      "spec-compiler": node(),
      "dev": node({ depends_on: ["spec-compiler"] }),
    });
    const { warnings } = validateArtifactIO("demo", wf);
    assert.deepEqual(warnings, []);
  });

  it("validates a minimal happy path (kickoff → produces → consumes)", () => {
    const wf = buildWorkflow({
      "spec-compiler": node({
        consumes_kickoff: ["spec"],
        produces_artifacts: ["acceptance"],
      }),
      "baseline-analyzer": node({
        depends_on: ["spec-compiler"],
        consumes_artifacts: [{ from: "spec-compiler", kind: "acceptance" }],
        produces_artifacts: ["baseline"],
      }),
      "dev": node({
        depends_on: ["spec-compiler", "baseline-analyzer"],
        consumes_artifacts: [
          { from: "spec-compiler", kind: "acceptance" },
          { from: "baseline-analyzer", kind: "baseline", required: false },
        ],
      }),
    });
    const { warnings } = validateArtifactIO("demo", wf);
    assert.deepEqual(warnings, []);
  });

  it("rejects unknown artifact kinds", () => {
    const wf = buildWorkflow({
      "x": node({ produces_artifacts: ["gibberish"] }),
    });
    assert.throws(
      () => validateArtifactIO("demo", wf),
      /unknown artifact kind "gibberish"/,
    );
  });

  it("rejects produces_artifacts including a kickoff-only kind", () => {
    const wf = buildWorkflow({
      "x": node({ produces_artifacts: ["spec"] }),
    });
    assert.throws(
      () => validateArtifactIO("demo", wf),
      /not valid in the node scope/,
    );
  });

  it("rejects consumes_kickoff including a node-only kind", () => {
    const wf = buildWorkflow({
      "x": node({ consumes_kickoff: ["acceptance"] }),
    });
    assert.throws(
      () => validateArtifactIO("demo", wf),
      /not valid in the kickoff scope/,
    );
  });

  it("rejects consumes_artifacts.from that is not a topological ancestor", () => {
    const wf = buildWorkflow({
      "a": node({ produces_artifacts: ["acceptance"] }),
      "b": node({ depends_on: [], consumes_artifacts: [{ from: "a", kind: "acceptance" }] }),
    });
    assert.throws(
      () => validateArtifactIO("demo", wf),
      /is not a DAG ancestor/,
    );
  });

  it("rejects consumes_artifacts referencing an unknown node", () => {
    const wf = buildWorkflow({
      "a": node({ depends_on: [], consumes_artifacts: [{ from: "ghost", kind: "acceptance" }] }),
    });
    assert.throws(
      () => validateArtifactIO("demo", wf),
      /is not a DAG ancestor|not a known node/,
    );
  });

  it("fails when a required consumer references a kind the producer does not declare", () => {
    const wf = buildWorkflow({
      "a": node({ produces_artifacts: [] }),
      "b": node({
        depends_on: ["a"],
        consumes_artifacts: [{ from: "a", kind: "acceptance" }],
      }),
    });
    assert.throws(
      () => validateArtifactIO("demo", wf),
      /does not declare "acceptance" in produces_artifacts/,
    );
  });

  it("warns instead of throwing when the missing producer edge is optional", () => {
    const wf = buildWorkflow({
      "a": node({ produces_artifacts: [] }),
      "b": node({
        depends_on: ["a"],
        consumes_artifacts: [{ from: "a", kind: "acceptance", required: false }],
      }),
    });
    const { warnings } = validateArtifactIO("demo", wf);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].node, "b");
    assert.match(warnings[0].message, /does not declare "acceptance"/);
  });

  it("rejects self-referencing consumes_artifacts without pick:previous", () => {
    const wf = buildWorkflow({
      "debug": node({
        produces_artifacts: ["debug-notes"],
        consumes_artifacts: [{ from: "debug", kind: "debug-notes" }],
      }),
    });
    assert.throws(
      () => validateArtifactIO("demo", wf),
      /self-referencing consumes_artifacts requires `pick: "previous"`/,
    );
  });

  it("accepts self-referencing consumes_artifacts when pick:previous is set", () => {
    const wf = buildWorkflow({
      "debug": node({
        produces_artifacts: ["debug-notes"],
        consumes_artifacts: [{ from: "debug", kind: "debug-notes", pick: "previous" }],
      }),
    });
    const { warnings } = validateArtifactIO("demo", wf);
    assert.deepEqual(warnings, []);
  });

  it("resolves transitive ancestry via depends_on chain", () => {
    const wf = buildWorkflow({
      "a": node({ produces_artifacts: ["acceptance"] }),
      "b": node({ depends_on: ["a"] }),
      "c": node({
        depends_on: ["b"], // transitively depends on a
        consumes_artifacts: [{ from: "a", kind: "acceptance" }],
      }),
    });
    const { warnings } = validateArtifactIO("demo", wf);
    assert.deepEqual(warnings, []);
  });

  it("uses ApmCompileError (which carries the workflow + node in the message)", () => {
    const wf = buildWorkflow({
      "x": node({ produces_artifacts: ["gibberish"] }),
    });
    try {
      validateArtifactIO("my-workflow", wf);
      assert.fail("expected throw");
    } catch (err) {
      assert.ok(err instanceof ApmCompileError);
      assert.match(String(err), /Workflow "my-workflow"/);
      assert.match(String(err), /node "x"/);
    }
  });
});

describe("validateArtifactIO — strict consumes_artifacts gate (Phase 1.3)", () => {
  it("default mode: agent node without consumes_artifacts is silent", () => {
    const wf = buildWorkflow({
      "root": node(),
      "dev": node({ depends_on: ["root"] }), // type defaults to agent, no consumes_artifacts
    });
    const { warnings } = validateArtifactIO("demo", wf);
    assert.deepEqual(warnings, []);
  });

  it("strict mode: throws when an agent node with depends_on omits consumes_artifacts", () => {
    const wf = buildWorkflow({
      "root": node(),
      "dev": node({ depends_on: ["root"] }),
    });
    assert.throws(
      () => validateArtifactIO("demo", wf, { strictConsumesArtifacts: true }),
      (err: unknown) =>
        err instanceof ApmCompileError &&
        /dev/.test(err.message) &&
        /strict_consumes_artifacts/.test(err.message),
    );
  });

  it("strict mode: rejects explicit empty consumes_artifacts: [] (Zod default indistinguishable from omission)", () => {
    const wf = buildWorkflow({
      "root": node({ produces_artifacts: [] }),
      "dev": node({ depends_on: ["root"], consumes_artifacts: [] }),
    });
    // The Zod schema defaults `consumes_artifacts` to `[]`, so we cannot
    // distinguish explicit-empty from omitted. Strict mode therefore
    // requires a non-empty edge list.
    assert.throws(
      () => validateArtifactIO("demo", wf, { strictConsumesArtifacts: true }),
      (err: unknown) => err instanceof ApmCompileError,
    );
  });

  it("strict mode: accepts a declared upstream edge", () => {
    const wf = buildWorkflow({
      "spec-compiler": node({ produces_artifacts: ["acceptance"] }),
      "dev": node({
        depends_on: ["spec-compiler"],
        consumes_artifacts: [{ from: "spec-compiler", kind: "acceptance" }],
      }),
    });
    assert.doesNotThrow(() =>
      validateArtifactIO("demo", wf, { strictConsumesArtifacts: true }),
    );
  });

  it("strict mode: ignores root agent nodes with no depends_on", () => {
    const wf = buildWorkflow({
      "spec-compiler": node(), // no depends_on → nothing to scope
    });
    assert.doesNotThrow(() =>
      validateArtifactIO("demo", wf, { strictConsumesArtifacts: true }),
    );
  });

  it("strict mode: ignores non-agent nodes (scripts, polls, approvals)", () => {
    const wf = buildWorkflow({
      "dev": node(),
      // Script node with depends_on but no consumes_artifacts — not an agent,
      // so the gate does not apply.
      "push": {
        type: "script",
        category: "deploy",
        script_type: "local-exec",
        command: "echo x",
        depends_on: ["dev"],
      },
    });
    assert.doesNotThrow(() =>
      validateArtifactIO("demo", wf, { strictConsumesArtifacts: true }),
    );
  });
});
