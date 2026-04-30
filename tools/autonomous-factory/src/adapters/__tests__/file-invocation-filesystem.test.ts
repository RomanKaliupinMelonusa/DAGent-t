/**
 * file-invocation-filesystem.test.ts — Phase 1 adapter tests.
 *
 * Covers directory creation idempotence, meta round-trip, seal probe, and
 * shared-bus delegation.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { LocalFilesystem } from "../local-filesystem.js";
import { FileInvocationFilesystem } from "../file-invocation-filesystem.js";
import { FileArtifactBus } from "../file-artifact-bus.js";
import { newInvocationId } from "../../domain/invocation-id.js";
import type { InvocationRecord } from "../../types.js";

function makeRecord(overrides: Partial<InvocationRecord> = {}): InvocationRecord {
  return {
    invocationId: overrides.invocationId ?? newInvocationId(),
    nodeKey: overrides.nodeKey ?? "spec-compiler",
    cycleIndex: overrides.cycleIndex ?? 1,
    trigger: overrides.trigger ?? "initial",
    startedAt: overrides.startedAt ?? new Date().toISOString(),
    inputs: overrides.inputs ?? [],
    outputs: overrides.outputs ?? [],
    ...overrides,
  };
}

describe("FileInvocationFilesystem", () => {
  it("ensureInvocationDir creates inputs/outputs/logs and is idempotent", async () => {
    const appRoot = mkdtempSync(join(tmpdir(), "ifs-create-"));
    const fs = new LocalFilesystem();
    const ifs = new FileInvocationFilesystem(appRoot, fs);
    const slug = "feat";
    const nodeKey = "spec-compiler";
    const inv = newInvocationId();

    const handles = await ifs.ensureInvocationDir(slug, nodeKey, inv);
    assert.ok(existsSync(handles.invocationDir), "invocation dir created");
    assert.ok(statSync(handles.inputsDir).isDirectory(), "inputs/ created");
    assert.ok(statSync(handles.outputsDir).isDirectory(), "outputs/ created");
    assert.ok(statSync(handles.logsDir).isDirectory(), "logs/ created");

    // Second call must not throw.
    const handles2 = await ifs.ensureInvocationDir(slug, nodeKey, inv);
    assert.equal(handles2.invocationDir, handles.invocationDir);
  });

  it("pathsFor returns deterministic absolute paths under <appRoot>/.dagent/<slug>/<nodeKey>/<inv>", () => {
    const appRoot = "/tmp/app";
    const ifs = new FileInvocationFilesystem(appRoot, new LocalFilesystem());
    const inv = newInvocationId();
    const handles = ifs.pathsFor("feat", "backend-dev", inv);
    assert.equal(
      handles.invocationDir,
      `/tmp/app/.dagent/feat/backend-dev/${inv}`,
    );
    assert.equal(handles.inputsDir, `${handles.invocationDir}/inputs`);
    assert.equal(handles.outputsDir, `${handles.invocationDir}/outputs`);
    assert.equal(handles.logsDir, `${handles.invocationDir}/logs`);
  });

  it("pathsFor rejects bad identifiers", () => {
    const ifs = new FileInvocationFilesystem("/tmp/app", new LocalFilesystem());
    assert.throws(() => ifs.pathsFor("../escape", "k", newInvocationId()));
    assert.throws(() => ifs.pathsFor("feat", "node/key", newInvocationId()));
    assert.throws(() => ifs.pathsFor("feat", "k", "not-an-inv-id"));
  });

  it("writeMeta + readMeta round-trip the InvocationRecord", async () => {
    const appRoot = mkdtempSync(join(tmpdir(), "ifs-meta-"));
    const ifs = new FileInvocationFilesystem(appRoot, new LocalFilesystem());
    const slug = "feat";
    const nodeKey = "backend-dev";
    const inv = newInvocationId();
    await ifs.ensureInvocationDir(slug, nodeKey, inv);
    const rec = makeRecord({ invocationId: inv, nodeKey, trigger: "triage-reroute" });
    await ifs.writeMeta(slug, nodeKey, inv, rec);
    const back = await ifs.readMeta(slug, nodeKey, inv);
    assert.deepEqual(back, rec);
  });

  it("readMeta returns null when meta is absent", async () => {
    const appRoot = mkdtempSync(join(tmpdir(), "ifs-noMeta-"));
    const ifs = new FileInvocationFilesystem(appRoot, new LocalFilesystem());
    const back = await ifs.readMeta("feat", "k", newInvocationId());
    assert.equal(back, null);
  });

  it("seal delegates to the shared ArtifactBus when supplied", async () => {
    const appRoot = mkdtempSync(join(tmpdir(), "ifs-sealBus-"));
    const fs = new LocalFilesystem();
    const bus = new FileArtifactBus(appRoot, fs);
    const ifs = new FileInvocationFilesystem(appRoot, fs, bus);
    const slug = "feat";
    const nodeKey = "k";
    const inv = newInvocationId();

    assert.equal(ifs.isSealed(slug, nodeKey, inv), false);
    assert.equal(bus.isSealed(slug, nodeKey, inv), false);
    await ifs.sealInvocation(slug, nodeKey, inv);
    assert.equal(ifs.isSealed(slug, nodeKey, inv), true);
    assert.equal(bus.isSealed(slug, nodeKey, inv), true, "shared cache");
  });

  it("seal works in standalone mode (no bus)", async () => {
    const appRoot = mkdtempSync(join(tmpdir(), "ifs-sealStand-"));
    const ifs = new FileInvocationFilesystem(appRoot, new LocalFilesystem());
    const slug = "feat";
    const nodeKey = "k";
    const inv = newInvocationId();
    assert.equal(ifs.isSealed(slug, nodeKey, inv), false);
    await ifs.sealInvocation(slug, nodeKey, inv);
    assert.equal(ifs.isSealed(slug, nodeKey, inv), true);
  });
});
