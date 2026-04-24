/**
 * invocation-builder.test.ts — Phase 3 input materialization unit tests.
 *
 * Covers kickoff resolution, upstream-latest resolution, reroute (only
 * when trigger === "triage-reroute"), and the required-but-missing
 * failure path (`MissingRequiredInputError` carrying a stable signature).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { LocalFilesystem } from "../../../adapters/local-filesystem.js";
import { FileArtifactBus } from "../../../adapters/file-artifact-bus.js";
import { FileInvocationFilesystem } from "../../../adapters/file-invocation-filesystem.js";
import { newInvocationId } from "../../../kernel/invocation-id.js";
import {
  materializeInputs,
  MissingRequiredInputError,
} from "../invocation-builder.js";
import { makeNodeIOContract } from "../../../contracts/node-io-contract.js";
import type { PipelineState, InvocationRecord } from "../../../types.js";

function emptyState(): PipelineState {
  return {
    feature: "feat",
    workflowName: "default",
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

describe("materializeInputs", () => {
  it("copies a kickoff artifact into <inv>/inputs/ and writes params.in.json", async () => {
    const appRoot = mkdtempSync(join(tmpdir(), "matin-kick-"));
    const fs = new LocalFilesystem();
    const bus = new FileArtifactBus(appRoot, fs);
    const ifs = new FileInvocationFilesystem(appRoot, fs, bus);
    const slug = "feat";
    const nodeKey = "spec-compiler";
    const inv = newInvocationId();

    // Lay down the kickoff `spec` artifact.
    const specRef = bus.ref(slug, "spec");
    await bus.write(specRef, "# Feature spec\n");

    const contract = makeNodeIOContract({
      nodeKey,
      consumes: {
        kickoff: [{ kind: "spec", required: true }],
        upstream: [],
        reroute: [],
      },
      produces: [{ kind: "acceptance", required: true }],
    });

    const result = await materializeInputs({
      contract, slug, nodeKey, invocationId: inv,
      trigger: "initial",
      state: emptyState(),
      bus, invocation: ifs, fs,
    });

    assert.equal(result.inputs.length, 1);
    assert.equal(result.inputs[0].kind, "spec");

    const handles = await ifs.ensureInvocationDir(slug, nodeKey, inv);
    const copiedPath = join(handles.inputsDir, "spec.md");
    assert.ok(existsSync(copiedPath));
    assert.equal(readFileSync(copiedPath, "utf8"), "# Feature spec\n");

    const paramsPath = join(handles.inputsDir, "params.in.json");
    const params = JSON.parse(readFileSync(paramsPath, "utf8"));
    assert.equal(params.nodeKey, nodeKey);
    assert.equal(params.trigger, "initial");
    assert.equal(params.artifacts.length, 1);
    assert.equal(params.artifacts[0].source, "kickoff");
    assert.equal(params.artifacts[0].inputPath, copiedPath);
  });

  it("resolves the latest completed upstream invocation by default", async () => {
    const appRoot = mkdtempSync(join(tmpdir(), "matin-up-"));
    const fs = new LocalFilesystem();
    const bus = new FileArtifactBus(appRoot, fs);
    const ifs = new FileInvocationFilesystem(appRoot, fs, bus);
    const slug = "feat";
    const upstreamNode = "spec-compiler";
    const downstreamNode = "backend-dev";
    const oldInv = newInvocationId();
    // ensure newer id
    await new Promise((r) => setTimeout(r, 2));
    const newInv = newInvocationId();

    // Two completed upstream invocations — newer wins.
    const oldRef = bus.ref(slug, "acceptance", { nodeKey: upstreamNode, invocationId: oldInv });
    await bus.write(oldRef, "feature: old\nsummary: old\n");
    const newRef = bus.ref(slug, "acceptance", { nodeKey: upstreamNode, invocationId: newInv });
    await bus.write(newRef, "feature: new\nsummary: new\n");

    const state = emptyState();
    state.artifacts![oldInv] = {
      invocationId: oldInv,
      nodeKey: upstreamNode,
      cycleIndex: 1,
      trigger: "initial",
      startedAt: "2024-01-01T00:00:00Z",
      finishedAt: "2024-01-01T00:01:00Z",
      outcome: "completed",
      sealed: true,
      inputs: [],
      outputs: [{
        kind: "acceptance", scope: "node", slug, path: oldRef.path,
        nodeKey: upstreamNode, invocationId: oldInv,
      }],
    };
    state.artifacts![newInv] = {
      invocationId: newInv,
      nodeKey: upstreamNode,
      cycleIndex: 2,
      trigger: "redevelopment-cycle",
      startedAt: "2024-01-02T00:00:00Z",
      finishedAt: "2024-01-02T00:01:00Z",
      outcome: "completed",
      sealed: true,
      inputs: [],
      outputs: [{
        kind: "acceptance", scope: "node", slug, path: newRef.path,
        nodeKey: upstreamNode, invocationId: newInv,
      }],
    };

    const contract = makeNodeIOContract({
      nodeKey: downstreamNode,
      consumes: {
        kickoff: [],
        upstream: [{ from: upstreamNode, kind: "acceptance", required: true, pick: "latest" }],
        reroute: [],
      },
      produces: [],
    });

    const downstreamInv = newInvocationId();
    const result = await materializeInputs({
      contract, slug, nodeKey: downstreamNode, invocationId: downstreamInv,
      trigger: "initial", state, bus, invocation: ifs, fs,
    });

    assert.equal(result.inputs.length, 1);
    const handles = await ifs.ensureInvocationDir(slug, downstreamNode, downstreamInv);
    const copied = readFileSync(join(handles.inputsDir, "acceptance.yml"), "utf8");
    assert.equal(copied, "feature: new\nsummary: new\n", "should pick the newer invocation's artifact");
  });

  it("ignores reroute consumes when trigger is not 'triage-reroute'", async () => {
    const appRoot = mkdtempSync(join(tmpdir(), "matin-rt-skip-"));
    const fs = new LocalFilesystem();
    const bus = new FileArtifactBus(appRoot, fs);
    const ifs = new FileInvocationFilesystem(appRoot, fs, bus);
    const slug = "feat";
    const nodeKey = "backend-dev";
    const inv = newInvocationId();

    const contract = makeNodeIOContract({
      nodeKey,
      consumes: {
        kickoff: [],
        upstream: [],
        reroute: [{ kind: "triage-handoff", required: true }],
      },
      produces: [],
    });

    // Required reroute input is missing — but trigger is "initial",
    // so materializeInputs should NOT throw.
    const result = await materializeInputs({
      contract, slug, nodeKey, invocationId: inv,
      trigger: "initial", state: emptyState(),
      bus, invocation: ifs, fs,
    });
    assert.equal(result.inputs.length, 0);
  });

  it("throws MissingRequiredInputError for a required-but-missing kickoff", async () => {
    const appRoot = mkdtempSync(join(tmpdir(), "matin-miss-"));
    const fs = new LocalFilesystem();
    const bus = new FileArtifactBus(appRoot, fs);
    const ifs = new FileInvocationFilesystem(appRoot, fs, bus);
    const slug = "feat";
    const nodeKey = "spec-compiler";
    const inv = newInvocationId();

    const contract = makeNodeIOContract({
      nodeKey,
      consumes: {
        kickoff: [{ kind: "spec", required: true }],
        upstream: [], reroute: [],
      },
      produces: [],
    });

    await assert.rejects(
      () => materializeInputs({
        contract, slug, nodeKey, invocationId: inv,
        trigger: "initial", state: emptyState(),
        bus, invocation: ifs, fs,
      }),
      (err: unknown) => {
        assert.ok(err instanceof MissingRequiredInputError);
        assert.equal((err as MissingRequiredInputError).signature(), "missing_required_input:spec");
        return true;
      },
    );
  });

  it("strict envelope gate — rejects consumer-side when upstream body lacks envelope", async () => {
    // Session A (Item 8): when strictArtifacts is on, copyIntoInputs must
    // refuse to materialize an upstream artifact whose body lacks the
    // {schemaVersion, producedBy, producedAt} triplet. Uses the kickoff
    // branch for simplicity — the strict flag threads through all three
    // resolution paths identically.
    const appRoot = mkdtempSync(join(tmpdir(), "matin-strict-"));
    const fs = new LocalFilesystem();
    const bus = new FileArtifactBus(appRoot, fs); // strict OFF on producer side
    const ifs = new FileInvocationFilesystem(appRoot, fs, bus);
    const slug = "feat";
    const nodeKey = "spec-compiler";
    const inv = newInvocationId();

    // Write a kickoff `spec` WITHOUT the sidecar (`spec.md.meta.json`).
    // Using the raw filesystem bypasses the producer-side auto-stamp.
    const kickoffDir = join(appRoot, "in-progress", slug, "_kickoff");
    mkdirSync(kickoffDir, { recursive: true });
    writeFileSync(join(kickoffDir, "spec.md"), "# Feature spec\n");

    const contract = makeNodeIOContract({
      nodeKey,
      consumes: {
        kickoff: [{ kind: "spec", required: true }],
        upstream: [], reroute: [],
      },
      produces: [],
    });

    await assert.rejects(
      () => materializeInputs({
        contract, slug, nodeKey, invocationId: inv,
        trigger: "initial", state: emptyState(),
        bus, invocation: ifs, fs,
        strictArtifacts: true,
      }),
      (err: unknown) => /sidecar missing/i.test((err as Error).message) ||
        /envelope/i.test((err as Error).message),
    );
  });

  it("strict envelope gate — passes when upstream sidecar is present", async () => {
    const appRoot = mkdtempSync(join(tmpdir(), "matin-strict-ok-"));
    const fs = new LocalFilesystem();
    const bus = new FileArtifactBus(appRoot, fs);
    const ifs = new FileInvocationFilesystem(appRoot, fs, bus);
    const slug = "feat";
    const nodeKey = "spec-compiler";
    const inv = newInvocationId();

    // Use the bus to write — it auto-stamps the sidecar envelope.
    const specRef = bus.ref(slug, "spec");
    await bus.write(specRef, "# Feature spec\n");

    const contract = makeNodeIOContract({
      nodeKey,
      consumes: {
        kickoff: [{ kind: "spec", required: true }],
        upstream: [], reroute: [],
      },
      produces: [],
    });

    const result = await materializeInputs({
      contract, slug, nodeKey, invocationId: inv,
      trigger: "initial", state: emptyState(),
      bus, invocation: ifs, fs,
      strictArtifacts: true,
    });
    assert.equal(result.inputs.length, 1);
    assert.equal(result.inputs[0].kind, "spec");
  });
});
