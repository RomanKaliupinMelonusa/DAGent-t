/**
 * file-artifact-bus-markdown-envelope.test.ts — Phase 1.1.
 *
 * End-to-end write → read round-trip of a `summary` artifact through the
 * FileArtifactBus, asserting the YAML front-matter envelope survives
 * the producer-side validateArtifactPayload gate.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { FileArtifactBus } from "../file-artifact-bus.js";
import { LocalFilesystem } from "../local-filesystem.js";
import { ArtifactValidationError } from "../../apm/artifact-catalog.js";
import { newInvocationId } from "../../kernel/invocation-id.js";

const VALID_ENVELOPE = [
  "---",
  "schemaVersion: 1",
  "producedBy: backend-dev",
  "producedAt: 2026-04-23T12:34:56Z",
  "---",
  "",
  "Added SSE streaming to /generate endpoint.",
  "",
].join("\n");

describe("FileArtifactBus — markdown envelope round-trip", () => {
  it("writes and reads back a summary artifact preserving the envelope", async () => {
    const appRoot = mkdtempSync(join(tmpdir(), "md-envelope-"));
    const bus = new FileArtifactBus(appRoot, new LocalFilesystem());
    const inv = newInvocationId();
    const ref = bus.ref("feat", "summary", { nodeKey: "backend-dev", invocationId: inv });
    await bus.write(ref, VALID_ENVELOPE);
    const back = await bus.read(ref);
    assert.equal(back, VALID_ENVELOPE);
    assert.match(back, /^---\nschemaVersion: 1\n/);
  });

  it("write rejects a summary artifact without a front-matter envelope", async () => {
    const appRoot = mkdtempSync(join(tmpdir(), "md-envelope-bad-"));
    const bus = new FileArtifactBus(appRoot, new LocalFilesystem());
    const inv = newInvocationId();
    const ref = bus.ref("feat", "summary", { nodeKey: "backend-dev", invocationId: inv });
    await assert.rejects(
      () => bus.write(ref, "plain body no fence"),
      (err: unknown) =>
        err instanceof ArtifactValidationError &&
        /front-matter envelope/.test(err.message),
    );
  });

  it("write rejects a debug-notes artifact with wrong schemaVersion", async () => {
    const appRoot = mkdtempSync(join(tmpdir(), "md-envelope-dbg-"));
    const bus = new FileArtifactBus(appRoot, new LocalFilesystem());
    const inv = newInvocationId();
    const ref = bus.ref("feat", "debug-notes", { nodeKey: "debug", invocationId: inv });
    const bad = [
      "---",
      "schemaVersion: 99",
      "producedBy: debug",
      "producedAt: 2026-04-23T12:34:56Z",
      "---",
      "body",
    ].join("\n");
    await assert.rejects(
      () => bus.write(ref, bad),
      (err: unknown) =>
        err instanceof ArtifactValidationError &&
        /schemaVersion/.test(err.message),
    );
  });
});
