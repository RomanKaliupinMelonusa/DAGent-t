/**
 * artifact-schema-validation.test.ts — Track B1 coverage.
 *
 * Exercises strict Zod enforcement at the artifact boundary for the two
 * high-value kinds that opted in:
 *   - `triage-handoff` — classification payload written by triage nodes
 *   - `acceptance`     — machine-readable contract written by spec-compiler
 *
 * Producer-side (`FileArtifactBus.write`) and consumer-side
 * (`materializeInputs → copyIntoInputs`) must both throw
 * `ArtifactValidationError` on schema violations.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  ArtifactValidationError,
  HandlerOutputArtifactSchema,
  TriageHandoffArtifactSchema,
  getArtifactKind,
  validateArtifactPayload,
} from "../artifact-catalog.js";
import { AcceptanceContractSchema } from "../acceptance-schema.js";

import { LocalFilesystem } from "../../adapters/local-filesystem.js";
import { FileArtifactBus } from "../../adapters/file-artifact-bus.js";
import { FileInvocationFilesystem } from "../../adapters/file-invocation-filesystem.js";
import { newInvocationId } from "../../kernel/invocation-id.js";
import { materializeInputs } from "../../loop/dispatch/invocation-builder.js";
import type { NodeIOContract } from "../../contracts/node-io-contract.js";
import type { PipelineState } from "../../types.js";

// ---------------------------------------------------------------------------
// Registry wiring
// ---------------------------------------------------------------------------

describe("Artifact registry — schema attachments (Track B1)", () => {
  it("`triage-handoff` carries the expected Zod schema", () => {
    const def = getArtifactKind("triage-handoff");
    assert.equal(def.schema, TriageHandoffArtifactSchema);
  });

  it("`acceptance` carries the AcceptanceContractSchema", () => {
    const def = getArtifactKind("acceptance");
    assert.equal(def.schema, AcceptanceContractSchema);
  });

  it("`handler-output` carries the HandlerOutputArtifactSchema", () => {
    const def = getArtifactKind("handler-output");
    assert.equal(def.schema, HandlerOutputArtifactSchema);
    assert.equal(def.policy, "envelope-only");
    assert.equal(def.envelope, "inline");
    assert.equal(def.ext, "json");
    assert.deepEqual([...def.scopes], ["node"]);
  });

  it("prose kinds remain schema-free (AK-47 scope: opt-in only)", () => {
    assert.equal(getArtifactKind("spec").schema, undefined);
    assert.equal(getArtifactKind("params").schema, undefined);
  });
});

// ---------------------------------------------------------------------------
// validateArtifactPayload — pure function
// ---------------------------------------------------------------------------

const VALID_TRIAGE_HANDOFF = {
  failingItem: "backend-dev",
  errorExcerpt: "TypeError: cannot read property foo of undefined\n  at handler.ts:42",
  errorSignature: "sig_abc123",
  triageDomain: "backend",
  triageReason: "Import error in handler",
  priorAttemptCount: 1,
};

const VALID_ACCEPTANCE_YAML = [
  "feature: sample-feature",
  "summary: A small demo feature.",
  "required_dom:",
  "  - testid: submit",
  "    description: Submit button",
  "required_flows: []",
  "",
].join("\n");

describe("validateArtifactPayload (Track B1)", () => {
  it("accepts a conforming triage-handoff payload", () => {
    assert.doesNotThrow(() =>
      validateArtifactPayload("triage-handoff", JSON.stringify(VALID_TRIAGE_HANDOFF)),
    );
  });

  it("rejects a triage-handoff missing required fields", () => {
    const bad = { failing_item: "x" }; // missing everything else
    assert.throws(
      () => validateArtifactPayload("triage-handoff", JSON.stringify(bad)),
      (err: unknown) => err instanceof ArtifactValidationError && err.kind === "triage-handoff",
    );
  });

  it("rejects a triage-handoff with wrong field type", () => {
    const bad = { ...VALID_TRIAGE_HANDOFF, priorAttemptCount: -1 };
    assert.throws(
      () => validateArtifactPayload("triage-handoff", JSON.stringify(bad)),
      (err: unknown) =>
        err instanceof ArtifactValidationError && /priorAttemptCount/.test(err.message),
    );
  });

  it("rejects a triage-handoff with unparseable JSON", () => {
    assert.throws(
      () => validateArtifactPayload("triage-handoff", "{not-json"),
      (err: unknown) => err instanceof ArtifactValidationError && /parse error/.test(err.message),
    );
  });

  it("accepts a conforming acceptance YAML payload", () => {
    assert.doesNotThrow(() => validateArtifactPayload("acceptance", VALID_ACCEPTANCE_YAML));
  });

  it("rejects an acceptance payload missing `feature`", () => {
    const bad = "summary: hi\n"; // no feature
    assert.throws(
      () => validateArtifactPayload("acceptance", bad),
      (err: unknown) =>
        err instanceof ArtifactValidationError && /feature/.test(err.message),
    );
  });

  it("is a no-op for kinds without a schema", () => {
    assert.doesNotThrow(() => validateArtifactPayload("params", "{\"anything\":true}"));
  });

  it("attaches the path to the error when supplied", () => {
    try {
      validateArtifactPayload("triage-handoff", "{}", { path: "/tmp/x.json" });
      assert.fail("should have thrown");
    } catch (err) {
      assert.ok(err instanceof ArtifactValidationError);
      assert.match(err.message, /\/tmp\/x\.json/);
    }
  });

  it("accepts a conforming handler-output envelope", () => {
    const body = JSON.stringify({
      schemaVersion: 1,
      producedBy: "my-script",
      producedAt: new Date().toISOString(),
      output: { foo: "bar", count: 3 },
    });
    assert.doesNotThrow(() => validateArtifactPayload("handler-output", body));
  });

  it("rejects a handler-output missing the envelope", () => {
    const body = JSON.stringify({ output: { foo: "bar" } });
    assert.throws(
      () => validateArtifactPayload("handler-output", body),
      (err: unknown) => err instanceof ArtifactValidationError && err.kind === "handler-output",
    );
  });

  it("rejects a handler-output whose `output` is not an object", () => {
    const body = JSON.stringify({
      schemaVersion: 1,
      producedBy: "my-script",
      producedAt: new Date().toISOString(),
      output: "not-an-object",
    });
    assert.throws(
      () => validateArtifactPayload("handler-output", body),
      (err: unknown) => err instanceof ArtifactValidationError && /output/.test(err.message),
    );
  });
});

// ---------------------------------------------------------------------------
// Producer-side enforcement — FileArtifactBus.write
// ---------------------------------------------------------------------------

describe("FileArtifactBus.write schema enforcement (Track B1)", () => {
  function makeBus(): FileArtifactBus {
    const appRoot = mkdtempSync(join(tmpdir(), "b1-prod-"));
    return new FileArtifactBus(appRoot, new LocalFilesystem());
  }

  it("rejects malformed triage-handoff writes with ArtifactValidationError", async () => {
    const bus = makeBus();
    const inv = newInvocationId();
    const ref = bus.ref("demo", "triage-handoff", {
      nodeKey: "triage-backend",
      invocationId: inv,
    });
    await assert.rejects(
      () => bus.write(ref, JSON.stringify({ failing_item: "x" })),
      (err: unknown) => err instanceof ArtifactValidationError,
    );
  });

  it("accepts well-formed triage-handoff writes", async () => {
    const bus = makeBus();
    const inv = newInvocationId();
    const ref = bus.ref("demo", "triage-handoff", {
      nodeKey: "triage-backend",
      invocationId: inv,
    });
    await bus.write(ref, JSON.stringify(VALID_TRIAGE_HANDOFF));
    assert.equal(await bus.exists(ref), true);
  });

  it("rejects malformed acceptance writes with ArtifactValidationError", async () => {
    const bus = makeBus();
    const inv = newInvocationId();
    const ref = bus.ref("demo", "acceptance", {
      nodeKey: "spec-compiler",
      invocationId: inv,
    });
    await assert.rejects(
      () => bus.write(ref, "not-valid-yaml-for-this-schema: true\n"),
      (err: unknown) => err instanceof ArtifactValidationError && err.kind === "acceptance",
    );
  });
});

// ---------------------------------------------------------------------------
// Consumer-side enforcement — materializeInputs → copyIntoInputs
// ---------------------------------------------------------------------------

function emptyState(): PipelineState {
  return {
    feature: "demo",
    workflowName: "test-workflow",
    started: new Date().toISOString(),
    deployedUrl: null,
    implementationNotes: null,
    items: [],
    errorLog: [],
    dependencies: {},
    nodeTypes: {},
    nodeCategories: {},
    jsonGated: {},
    naByType: [],
    salvageSurvivors: [],
    artifacts: {},
  };
}

function makeContract(kind: "acceptance" | "triage-handoff"): NodeIOContract {
  if (kind === "acceptance") {
    return {
      nodeKey: "backend-dev",
      consumes: {
        kickoff: [],
        upstream: [
          { from: "spec-compiler", kind: "acceptance", required: true, pick: "latest" },
        ],
        reroute: [],
      },
      produces: [],
    };
  }
  return {
    nodeKey: "backend-dev",
    consumes: {
      kickoff: [],
      upstream: [],
      reroute: [{ kind: "triage-handoff", required: true }],
    },
    produces: [],
  };
}

describe("materializeInputs schema enforcement (Track B1)", () => {
  it("rejects a corrupt upstream acceptance artifact at consumer boundary", async () => {
    const appRoot = mkdtempSync(join(tmpdir(), "b1-cons-"));
    const fs = new LocalFilesystem();
    const bus = new FileArtifactBus(appRoot, fs);
    const ifs = new FileInvocationFilesystem(appRoot, fs, bus);
    const slug = "demo";
    const upstreamNode = "spec-compiler";
    const downstreamNode = "backend-dev";
    const upstreamInv = newInvocationId();
    const downstreamInv = newInvocationId();

    // Bypass the bus write validator by writing directly to disk — this is
    // the agent-authored scenario (the spec-compiler agent uses its own
    // write_file tool, not FileArtifactBus).
    const ref = bus.ref(slug, "acceptance", {
      nodeKey: upstreamNode,
      invocationId: upstreamInv,
    });
    await fs.writeFile(ref.path, "summary: only-summary\n"); // missing `feature`

    const state = emptyState();
    state.artifacts![upstreamInv] = {
      invocationId: upstreamInv,
      nodeKey: upstreamNode,
      cycleIndex: 1,
      trigger: "initial",
      startedAt: "2024-01-01T00:00:00Z",
      finishedAt: "2024-01-01T00:01:00Z",
      outcome: "completed",
      sealed: true,
      inputs: [],
      outputs: [
        {
          kind: "acceptance",
          scope: "node",
          slug,
          path: ref.path,
          nodeKey: upstreamNode,
          invocationId: upstreamInv,
        },
      ],
    };

    await assert.rejects(
      () =>
        materializeInputs({
          contract: makeContract("acceptance"),
          slug,
          nodeKey: downstreamNode,
          invocationId: downstreamInv,
          trigger: "initial",
          state,
          bus,
          invocation: ifs,
          fs,
        }),
      (err: unknown) =>
        err instanceof ArtifactValidationError && err.kind === "acceptance",
    );
  });

  it("accepts a well-formed upstream acceptance artifact", async () => {
    const appRoot = mkdtempSync(join(tmpdir(), "b1-cons-ok-"));
    const fs = new LocalFilesystem();
    const bus = new FileArtifactBus(appRoot, fs);
    const ifs = new FileInvocationFilesystem(appRoot, fs, bus);
    const slug = "demo";
    const upstreamNode = "spec-compiler";
    const downstreamNode = "backend-dev";
    const upstreamInv = newInvocationId();
    const downstreamInv = newInvocationId();

    const ref = bus.ref(slug, "acceptance", {
      nodeKey: upstreamNode,
      invocationId: upstreamInv,
    });
    await bus.write(ref, VALID_ACCEPTANCE_YAML);

    const state = emptyState();
    state.artifacts![upstreamInv] = {
      invocationId: upstreamInv,
      nodeKey: upstreamNode,
      cycleIndex: 1,
      trigger: "initial",
      startedAt: "2024-01-01T00:00:00Z",
      finishedAt: "2024-01-01T00:01:00Z",
      outcome: "completed",
      sealed: true,
      inputs: [],
      outputs: [
        {
          kind: "acceptance",
          scope: "node",
          slug,
          path: ref.path,
          nodeKey: upstreamNode,
          invocationId: upstreamInv,
        },
      ],
    };

    const result = await materializeInputs({
      contract: makeContract("acceptance"),
      slug,
      nodeKey: downstreamNode,
      invocationId: downstreamInv,
      trigger: "initial",
      state,
      bus,
      invocation: ifs,
      fs,
    });
    assert.equal(result.inputs.length, 1);
    assert.equal(result.inputs[0].kind, "acceptance");
  });
});
