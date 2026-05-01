/**
 * producer-envelope.test.ts — Session A (Item 8) Phase 6 migration.
 *
 * Verifies engine producers emit the envelope natively so the bus's strict
 * mode succeeds without relying on auto-stamp:
 *   - `writeNodeReport` (reporting/node-report.ts) writes a body with
 *     `{schemaVersion, producedBy, producedAt}` under strict mode.
 *   - `attachTriageHandoffArtifact` path (handlers/triage-handler.ts) —
 *     we can't test the full handler easily, but we can assert the same
 *     inline-merge pattern via `buildEnvelope` + `bus.write` in strict
 *     mode, proving the shape the handler emits is strict-compatible.
 *   - `buildEnvelope` returns the same shape as `buildSidecarEnvelope`
 *     and honors the catalog schemaVersion.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { FileArtifactBus } from "../../adapters/file-artifact-bus.js";
import { LocalFilesystem } from "../../adapters/local-filesystem.js";
import {
  buildEnvelope,
  buildSidecarEnvelope,
  getArtifactSchemaVersion,
} from "../../apm/artifacts/artifact-catalog.js";
import { newInvocationId } from "../../domain/invocation-id.js";
import { synthesizeNodeReport, writeNodeReport } from "../node-report.js";
import type { NodeContext } from "../../contracts/node-context.js";

function baseNodeReportArgs(invocationId: string) {
  return {
    nodeKey: "backend-dev",
    invocationId,
    handler: "copilot-agent",
    trigger: "initial" as const,
    attempt: 1,
    startedAt: "2026-04-23T12:00:00.000Z",
    finishedAt: "2026-04-23T12:05:00.000Z",
    outcome: "completed" as const,
  };
}

describe("buildEnvelope", () => {
  it("matches buildSidecarEnvelope shape + values", () => {
    const a = buildEnvelope("node-report", "backend-dev", "T");
    const b = buildSidecarEnvelope("node-report", "backend-dev", "T");
    assert.deepEqual(a, b);
  });

  it("stamps the catalog schemaVersion for kinds that declare one", () => {
    const v = getArtifactSchemaVersion("node-report");
    assert.equal(v, 1);
    const env = buildEnvelope("node-report", "x");
    assert.equal(env.schemaVersion, 1);
  });

  it("defaults schemaVersion to 1 for schema-free kinds", () => {
    const env = buildEnvelope("terminal-log", "runner");
    assert.equal(env.schemaVersion, 1);
  });
});

describe("writeNodeReport — strict mode compatibility", () => {
  it("succeeds under strict mode (emits envelope natively)", async () => {
    const appRoot = mkdtempSync(join(tmpdir(), "nr-strict-"));
    const fs = new LocalFilesystem();
    const bus = new FileArtifactBus(appRoot, fs, undefined, { strict: true });
    const invocationId = newInvocationId();
    const ctx = {
      slug: "demo",
      itemKey: "backend-dev",
      executionId: invocationId,
      appRoot,
      filesystem: fs,
    } as unknown as NodeContext;

    const report = synthesizeNodeReport(baseNodeReportArgs(invocationId));
    const ref = await writeNodeReport(bus, ctx, report);

    const body = JSON.parse(readFileSync(ref.path, "utf8"));
    assert.equal(body.schemaVersion, 1);
    assert.equal(body.producedBy, "backend-dev");
    assert.match(body.producedAt, /^\d{4}-\d{2}-\d{2}T/);
    // And the report payload is preserved verbatim:
    assert.equal(body.handler, "copilot-agent");
    assert.equal(body.outcome, "completed");
  });
});

describe("triage-handoff inline-merge pattern — strict mode compatibility", () => {
  it("a body assembled via buildEnvelope + handoff survives strict bus write", async () => {
    const appRoot = mkdtempSync(join(tmpdir(), "th-strict-"));
    const bus = new FileArtifactBus(appRoot, new LocalFilesystem(), undefined, { strict: true });
    const ref = bus.ref("demo", "triage-handoff", {
      nodeKey: "triage",
      invocationId: newInvocationId(),
    });

    const handoff = {
      failingItem: "storefront-dev",
      errorExcerpt: "SyntaxError: Unexpected token",
      errorSignature: "sig-abc",
      triageDomain: "frontend",
      triageReason: "syntax error in worker bundle",
      priorAttemptCount: 0,
    };
    const envelope = buildEnvelope("triage-handoff", "triage");
    const body = { ...envelope, ...handoff };

    await bus.write(ref, JSON.stringify(body, null, 2) + "\n");

    const written = JSON.parse(readFileSync(ref.path, "utf8"));
    assert.equal(written.producedBy, "triage");
    assert.equal(written.failingItem, "storefront-dev");
  });
});
