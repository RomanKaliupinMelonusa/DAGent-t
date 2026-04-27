/**
 * node-contract-gate.test.ts — Unit tests for the runner-internal node
 * contract validator + recovery-prompt builder.
 *
 * Run: npx tsx --test src/handlers/support/__tests__/node-contract-gate.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  validateNodeContract,
  summarizeMissing,
  type ContractGateFs,
  type ContractGatePathResolver,
} from "../node-contract-gate.js";
import { buildContractRecoveryPrompt } from "../node-contract-prompt.js";
import type { ArtifactRef } from "../../../ports/artifact-bus.js";
import type { ReportedOutcome } from "../../../harness/outcome-tool.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBus(
  paths: Record<string, string>,
): ContractGatePathResolver {
  return {
    ref(slug, kind, opts) {
      const path = paths[kind] ?? `/tmp/${slug}/${opts.nodeKey}/${opts.invocationId}/outputs/${kind}`;
      return {
        kind: kind as ArtifactRef["kind"],
        scope: "node",
        slug,
        nodeKey: opts.nodeKey,
        invocationId: opts.invocationId,
        path,
      } as ArtifactRef;
    },
  };
}

function makeFs(files: Record<string, string>): ContractGateFs {
  return {
    async exists(path) {
      return Object.prototype.hasOwnProperty.call(files, path);
    },
    async readFile(path) {
      if (!Object.prototype.hasOwnProperty.call(files, path)) {
        throw new Error(`ENOENT: ${path}`);
      }
      return files[path];
    },
    async writeFile(path, body) {
      files[path] = body;
    },
  };
}

const baseInput = {
  slug: "feature-x",
  nodeKey: "spec-compiler",
  invocationId: "inv_01H000000000000000000000",
  strictEnvelope: false,
  autoSkipped: false,
};

const completedOutcome: ReportedOutcome = { status: "completed" };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("validateNodeContract", () => {
  it("happy path: outcome reported and all artifacts present", async () => {
    const accPath = "/.dagent/feature-x/spec-compiler/inv/outputs/acceptance.yml";
    const result = await validateNodeContract({
      ...baseInput,
      producesArtifacts: ["acceptance"],
      reportedOutcome: completedOutcome,
      bus: makeBus({ acceptance: accPath }),
      fs: makeFs({ [accPath]: "schemaVersion: 1\n" }),
    });
    assert.equal(result.ok, true);
  });

  it("missing report_outcome only", async () => {
    const result = await validateNodeContract({
      ...baseInput,
      producesArtifacts: [],
      reportedOutcome: undefined,
      bus: makeBus({}),
      fs: makeFs({}),
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.missing.length, 1);
    assert.equal(result.missing[0].kind, "report_outcome");
  });

  it("missing one artifact", async () => {
    const accPath = "/path/acceptance.yml";
    const result = await validateNodeContract({
      ...baseInput,
      producesArtifacts: ["acceptance"],
      reportedOutcome: completedOutcome,
      bus: makeBus({ acceptance: accPath }),
      fs: makeFs({}),
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.missing.length, 1);
    assert.equal(result.missing[0].kind, "artifact-missing");
    if (result.missing[0].kind !== "artifact-missing") return;
    assert.equal(result.missing[0].declaredKind, "acceptance");
    assert.equal(result.missing[0].expectedPath, accPath);
  });

  it("missing both outcome and artifact", async () => {
    const accPath = "/path/acceptance.yml";
    const result = await validateNodeContract({
      ...baseInput,
      producesArtifacts: ["acceptance"],
      reportedOutcome: undefined,
      bus: makeBus({ acceptance: accPath }),
      fs: makeFs({}),
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.missing.length, 2);
    const kinds = result.missing.map((m) => m.kind).sort();
    assert.deepEqual(kinds, ["artifact-missing", "report_outcome"]);
  });

  it("status='failed' is exempt — gate skipped", async () => {
    const result = await validateNodeContract({
      ...baseInput,
      producesArtifacts: ["acceptance"],
      reportedOutcome: { status: "failed", message: "give up" },
      bus: makeBus({ acceptance: "/p" }),
      fs: makeFs({}), // file missing — should not matter
    });
    assert.equal(result.ok, true);
  });

  it("auto-skipped invocation is exempt", async () => {
    const result = await validateNodeContract({
      ...baseInput,
      autoSkipped: true,
      producesArtifacts: ["acceptance"],
      reportedOutcome: undefined,
      bus: makeBus({ acceptance: "/p" }),
      fs: makeFs({}),
    });
    assert.equal(result.ok, true);
  });

  it("empty produces_artifacts + outcome present → ok", async () => {
    const result = await validateNodeContract({
      ...baseInput,
      producesArtifacts: [],
      reportedOutcome: completedOutcome,
      bus: makeBus({}),
      fs: makeFs({}),
    });
    assert.equal(result.ok, true);
  });

  it("runtime kinds bypass the canonical-path probe", async () => {
    const result = await validateNodeContract({
      ...baseInput,
      producesArtifacts: ["acceptance"],
      reportedOutcome: completedOutcome,
      runtimeKinds: new Set(["acceptance"]),
      bus: makeBus({ acceptance: "/path/acceptance.yml" }),
      fs: makeFs({}), // file absent on disk
    });
    assert.equal(result.ok, true);
  });

  it("unknown artifact kind is silently skipped", async () => {
    const result = await validateNodeContract({
      ...baseInput,
      producesArtifacts: ["totally-not-a-kind"],
      reportedOutcome: completedOutcome,
      bus: makeBus({}),
      fs: makeFs({}),
    });
    assert.equal(result.ok, true);
  });

  it("strict envelope: auto-stamps missing sidecar for envelope-only kinds", async () => {
    // `acceptance` is `policy: "envelope-only"` + `envelope: "sidecar"`.
    // With strict on, a missing .meta.json should be auto-stamped in-place
    // by the gate (mirroring the dispatch-layer auto-stamp) and the
    // validation should pass.
    const accPath = "/path/acceptance.yml";
    const sidecar = `${accPath}.meta.json`;
    const files: Record<string, string> = { [accPath]: "schemaVersion: 1\n" };
    const result = await validateNodeContract({
      ...baseInput,
      strictEnvelope: true,
      producesArtifacts: ["acceptance"],
      reportedOutcome: completedOutcome,
      bus: makeBus({ acceptance: accPath }),
      fs: makeFs(files),
    });
    assert.equal(result.ok, true);
    assert.ok(
      Object.prototype.hasOwnProperty.call(files, sidecar),
      "sidecar file should have been auto-stamped on disk",
    );
    const env = JSON.parse(files[sidecar]) as {
      schemaVersion: number;
      producedBy: string;
      producedAt: string;
    };
    assert.equal(typeof env.schemaVersion, "number");
    assert.equal(env.producedBy, baseInput.nodeKey);
    assert.match(env.producedAt, /^\d{4}-\d{2}-\d{2}T/);
  });

  it("non-strict mode does NOT enforce envelopes", async () => {
    const accPath = "/path/acceptance.yml";
    const result = await validateNodeContract({
      ...baseInput,
      strictEnvelope: false,
      producesArtifacts: ["acceptance"],
      reportedOutcome: completedOutcome,
      bus: makeBus({ acceptance: accPath }),
      fs: makeFs({ [accPath]: "schemaVersion: 1\n" }), // sidecar absent
    });
    assert.equal(result.ok, true);
  });
});

describe("buildContractRecoveryPrompt", () => {
  it("includes every expected canonical path", () => {
    const prompt = buildContractRecoveryPrompt(
      "spec-compiler",
      [
        { kind: "report_outcome" },
        {
          kind: "artifact-missing",
          declaredKind: "acceptance",
          expectedPath: "/abs/path/acceptance.yml",
        },
      ],
      1,
    );
    assert.match(prompt, /spec-compiler/);
    assert.match(prompt, /report_outcome/);
    assert.match(prompt, /\/abs\/path\/acceptance\.yml/);
    assert.match(prompt, /attempt 1 of 3/);
    assert.match(prompt, /write_file/);
  });

  it("formats malformed entries with the validator reason", () => {
    const prompt = buildContractRecoveryPrompt(
      "spec-compiler",
      [
        {
          kind: "artifact-malformed",
          declaredKind: "acceptance",
          expectedPath: "/p/acceptance.yml",
          reason: "sidecar not found at /p/acceptance.yml.meta.json",
        },
      ],
      2,
    );
    assert.match(prompt, /attempt 2 of 3/);
    assert.match(prompt, /sidecar not found/);
  });
});

describe("summarizeMissing", () => {
  it("renders a single-line summary across all gap types", () => {
    const out = summarizeMissing([
      { kind: "report_outcome" },
      {
        kind: "artifact-missing",
        declaredKind: "acceptance",
        expectedPath: "/p/a.yml",
      },
    ]);
    assert.match(out, /report_outcome not called/);
    assert.match(out, /missing artifact `acceptance`/);
  });

  it("returns empty string for empty input", () => {
    assert.equal(summarizeMissing([]), "");
  });
});
