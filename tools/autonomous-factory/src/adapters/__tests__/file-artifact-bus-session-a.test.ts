/**
 * file-artifact-bus-session-a.test.ts — Session A (Items 7/8).
 *
 * Covers envelope behavior that isn't exercised by the pre-existing
 * markdown-envelope test:
 *   - sidecar kinds: primary body is written verbatim + `.meta.json`
 *     carries the envelope.
 *   - inline JSON kinds: auto-stamped when strict mode is OFF.
 *   - inline JSON kinds: rejected when strict mode is ON and the producer
 *     omitted the envelope.
 *   - inline JSON kinds: accepted when strict mode is ON and the producer
 *     supplied the envelope.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { FileArtifactBus } from "../file-artifact-bus.js";
import { LocalFilesystem } from "../local-filesystem.js";
import {
  ArtifactValidationError,
  sidecarPath,
} from "../../apm/artifacts/artifact-catalog.js";
import { newInvocationId } from "../../domain/invocation-id.js";

function mkBus(prefix: string, opts: { strict?: boolean } = {}) {
  const appRoot = mkdtempSync(join(tmpdir(), `${prefix}-`));
  return {
    appRoot,
    bus: new FileArtifactBus(appRoot, new LocalFilesystem(), undefined, opts),
  };
}

describe("FileArtifactBus — sidecar envelope (Item 7)", () => {
  it("writes a `.meta.json` sidecar alongside a `terminal-log` primary", async () => {
    const { bus } = mkBus("sa-sidecar");
    const inv = newInvocationId();
    const ref = bus.ref("feat", "terminal-log", {
      nodeKey: "deploy",
      invocationId: inv,
    });

    const primaryBody = "line 1\nline 2 with === delimiters ===\n";
    await bus.write(ref, primaryBody);

    assert.equal(readFileSync(ref.path, "utf8"), primaryBody,
      "sidecar writes must not rewrite the primary body");

    const metaPath = sidecarPath(ref.path);
    assert.ok(existsSync(metaPath), `sidecar file must exist at ${metaPath}`);
    const envelope = JSON.parse(readFileSync(metaPath, "utf8"));
    assert.equal(envelope.schemaVersion, 1);
    assert.equal(envelope.producedBy, "deploy");
    assert.match(envelope.producedAt, /^\d{4}-\d{2}-\d{2}T/);
  });

  it("a kickoff-scope sidecar write stamps producedBy='kickoff'", async () => {
    const { bus } = mkBus("sa-kickoff");
    const ref = bus.ref("feat", "spec"); // no nodeKey/invocationId → kickoff scope
    await bus.write(ref, "# spec body\n");

    const envelope = JSON.parse(readFileSync(sidecarPath(ref.path), "utf8"));
    assert.equal(envelope.producedBy, "kickoff");
    assert.equal(envelope.schemaVersion, 1);
  });
});

describe("FileArtifactBus — inline JSON envelope auto-stamp (strict OFF)", () => {
  it("stamps envelope fields onto a qa-report body missing them", async () => {
    const { bus } = mkBus("sa-json-lax");
    const inv = newInvocationId();
    const ref = bus.ref("feat", "qa-report", {
      nodeKey: "qa-adversary",
      invocationId: inv,
    });
    const body = JSON.stringify({
      outcome: "pass",
      feature: "feat",
      probes_run: 3,
      violations: [],
    });
    await bus.write(ref, body);

    const written = JSON.parse(readFileSync(ref.path, "utf8"));
    assert.equal(written.schemaVersion, 1);
    assert.equal(written.producedBy, "qa-adversary");
    assert.match(written.producedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(written.outcome, "pass");
  });
});

describe("FileArtifactBus — strict mode (Item 8)", () => {
  it("rejects an inline JSON body that is missing envelope fields", async () => {
    const { bus } = mkBus("sa-strict-bad", { strict: true });
    const inv = newInvocationId();
    const ref = bus.ref("feat", "qa-report", {
      nodeKey: "qa-adversary",
      invocationId: inv,
    });
    const body = JSON.stringify({
      outcome: "pass",
      feature: "feat",
      probes_run: 0,
      violations: [],
    });
    await assert.rejects(
      () => bus.write(ref, body),
      (err: unknown) =>
        err instanceof ArtifactValidationError &&
        /envelope\./.test(err.message),
    );
  });

  it("accepts an inline JSON body that supplies the envelope fields", async () => {
    const { bus } = mkBus("sa-strict-ok", { strict: true });
    const inv = newInvocationId();
    const ref = bus.ref("feat", "qa-report", {
      nodeKey: "qa-adversary",
      invocationId: inv,
    });
    const body = JSON.stringify({
      schemaVersion: 1,
      producedBy: "qa-adversary",
      producedAt: "2026-04-23T12:00:00.000Z",
      outcome: "pass",
      feature: "feat",
      probes_run: 0,
      violations: [],
    });
    await bus.write(ref, body);
    const back = JSON.parse(readFileSync(ref.path, "utf8"));
    assert.equal(back.producedBy, "qa-adversary");
    assert.equal(back.producedAt, "2026-04-23T12:00:00.000Z");
  });

  it("strict mode still co-writes sidecar envelopes for sidecar kinds", async () => {
    const { bus } = mkBus("sa-strict-sidecar", { strict: true });
    const inv = newInvocationId();
    const ref = bus.ref("feat", "terminal-log", {
      nodeKey: "deploy",
      invocationId: inv,
    });
    await bus.write(ref, "stdout chatter\n");
    const envelope = JSON.parse(readFileSync(sidecarPath(ref.path), "utf8"));
    assert.equal(envelope.schemaVersion, 1);
    assert.equal(envelope.producedBy, "deploy");
  });
});
