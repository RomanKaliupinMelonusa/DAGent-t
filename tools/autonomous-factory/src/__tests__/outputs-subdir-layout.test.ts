/**
 * outputs-subdir-layout.test.ts — Phase 2 end-to-end shape assertion.
 *
 * Exercises the full dispatch → seal flow with the FileArtifactBus +
 * FileInvocationFilesystem and asserts the on-disk layout matches the
 * canonical `<inv>/{outputs,inputs,logs,meta.json}` shape.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, statSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { LocalFilesystem } from "../adapters/local-filesystem.js";
import { FileArtifactBus } from "../adapters/file-artifact-bus.js";
import { FileInvocationFilesystem } from "../adapters/file-invocation-filesystem.js";
import { newInvocationId } from "../kernel/invocation-id.js";
import type { InvocationRecord } from "../types.js";

describe("Phase 2 — outputs land in <inv>/outputs/", () => {
  it("FileArtifactBus.write places node-scope artifacts under outputs/", async () => {
    const appRoot = mkdtempSync(join(tmpdir(), "outsub-"));
    const fs = new LocalFilesystem();
    const bus = new FileArtifactBus(appRoot, fs);
    const slug = "feat";
    const nodeKey = "spec-compiler";
    const inv = newInvocationId();
    const ref = bus.ref(slug, "acceptance", { nodeKey, invocationId: inv });
    await bus.write(ref, "feature: f\nsummary: s\n");

    const expected = join(
      appRoot, "in-progress", slug, nodeKey, inv, "outputs", "acceptance.yml",
    );
    assert.equal(ref.path, expected);
    assert.ok(existsSync(expected), "artifact written under outputs/");
  });

  it("InvocationFilesystem creates inputs/outputs/logs and writes meta.json at <inv>/", async () => {
    const appRoot = mkdtempSync(join(tmpdir(), "outsub-meta-"));
    const fs = new LocalFilesystem();
    const bus = new FileArtifactBus(appRoot, fs);
    const ifs = new FileInvocationFilesystem(appRoot, fs, bus);
    const slug = "feat";
    const nodeKey = "backend-dev";
    const inv = newInvocationId();

    const handles = await ifs.ensureInvocationDir(slug, nodeKey, inv);
    const rec: InvocationRecord = {
      invocationId: inv,
      nodeKey,
      cycleIndex: 1,
      trigger: "initial",
      startedAt: new Date().toISOString(),
      inputs: [],
      outputs: [],
    };
    await ifs.writeMeta(slug, nodeKey, inv, rec);

    // Directory shape
    assert.ok(statSync(handles.inputsDir).isDirectory());
    assert.ok(statSync(handles.outputsDir).isDirectory());
    assert.ok(statSync(handles.logsDir).isDirectory());

    // Meta file lives at <inv>/meta.json (NOT under outputs/), to keep the
    // mirror outside the agent-writable surface.
    const metaPath = join(handles.invocationDir, "meta.json");
    assert.ok(existsSync(metaPath));
    const back = JSON.parse(readFileSync(metaPath, "utf8")) as InvocationRecord;
    assert.equal(back.invocationId, inv);
    assert.equal(back.trigger, "initial");

    // Artifact written by the bus lands under outputs/, not a sibling of meta.
    const ref = bus.ref(slug, "summary", { nodeKey, invocationId: inv });
    await bus.write(
      ref,
      "---\nschemaVersion: 1\nproducedBy: backend-dev\nproducedAt: 2026-04-23T00:00:00Z\n---\n# summary\n",
    );
    assert.equal(ref.path, join(handles.outputsDir, "summary.md"));
  });
});
