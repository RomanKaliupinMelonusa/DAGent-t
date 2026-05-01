/**
 * node-report.test.ts — Track B2 coverage for the kernel-synthesized
 * per-invocation report.
 *
 * Exercises:
 *   - `synthesizeNodeReport` — pure synthesis from a (partial) summary.
 *   - Tokens rendered as `null` for non-LLM handlers and as counters for
 *     LLM handlers.
 *   - Counters derived from summary arrays.
 *   - Registry wiring (schema attached).
 *   - `writeNodeReport` round-trip via FileArtifactBus with schema
 *     validation at the boundary.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  getArtifactKind,
  NodeReportArtifactSchema,
  validateArtifactPayload,
} from "../../apm/artifacts/artifact-catalog.js";
import { LocalFilesystem } from "../../adapters/local-filesystem.js";
import { FileArtifactBus } from "../../adapters/file-artifact-bus.js";
import { newInvocationId } from "../../activities/support/invocation-id.js";
import { synthesizeNodeReport, writeNodeReport } from "../node-report.js";
import type { ItemSummary } from "../../types.js";
import type { NodeContext } from "../../contracts/node-context.js";

const START = "2025-01-01T00:00:00.000Z";
const FINISH = "2025-01-01T00:00:05.000Z";

function baseArgs(overrides: Partial<Parameters<typeof synthesizeNodeReport>[0]> = {}) {
  return {
    nodeKey: "backend-dev",
    invocationId: "inv_01JXYZ0000000000000000000",
    handler: "copilot-agent",
    trigger: "initial" as const,
    attempt: 1,
    startedAt: START,
    finishedAt: FINISH,
    outcome: "completed" as const,
    ...overrides,
  };
}

describe("Artifact registry — node-report wiring (Track B2)", () => {
  it("`node-report` carries the NodeReportArtifactSchema", () => {
    assert.equal(getArtifactKind("node-report").schema, NodeReportArtifactSchema);
  });

  it("`node-report` is valid in the node scope only", () => {
    const def = getArtifactKind("node-report");
    assert.deepEqual([...def.scopes], ["node"]);
    assert.equal(def.ext, "json");
  });
});

describe("synthesizeNodeReport (Track B2)", () => {
  it("produces a schema-valid report from a minimal agent summary", () => {
    const report = synthesizeNodeReport(
      baseArgs({
        summary: {
          filesRead: ["a.ts", "b.ts"],
          filesChanged: ["a.ts"],
          intents: ["Implementing"],
          messages: ["Done."],
          shellCommands: [
            { command: "npm test", timestamp: START, isPipelineOp: false },
          ],
          toolCounts: { write_file: 2, read_file: 5 },
          inputTokens: 100,
          outputTokens: 50,
          cacheReadTokens: 10,
          cacheWriteTokens: 5,
        } as Partial<ItemSummary>,
      }),
    );
    // schema passes
    NodeReportArtifactSchema.parse(report);
    assert.equal(report.counters.shellCommands, 1);
    assert.equal(report.counters.toolCalls, 7);
    assert.equal(report.counters.filesRead, 2);
    assert.equal(report.counters.filesChanged, 1);
    assert.deepEqual(report.tokens, {
      input: 100,
      output: 50,
      cacheRead: 10,
      cacheWrite: 5,
    });
    assert.equal(report.durationMs, 5000);
  });

  it("renders `tokens: null` for non-LLM handlers (no token counters)", () => {
    const report = synthesizeNodeReport(
      baseArgs({
        handler: "local-exec",
        summary: { intents: ["Native script execution"] } as Partial<ItemSummary>,
      }),
    );
    NodeReportArtifactSchema.parse(report);
    assert.equal(report.tokens, null);
    assert.equal(report.counters.toolCalls, 0);
    assert.equal(report.counters.shellCommands, 0);
  });

  it("synthesizes a report for a crashed invocation with no summary", () => {
    const report = synthesizeNodeReport(
      baseArgs({ outcome: "error", summary: undefined }),
    );
    NodeReportArtifactSchema.parse(report);
    assert.equal(report.outcome, "error");
    assert.equal(report.filesRead.length, 0);
    assert.equal(report.filesChanged.length, 0);
    assert.equal(report.errorMessage, null);
    assert.equal(report.errorSignature, null);
    assert.equal(report.tokens, null);
  });

  it("carries error message + signature when the handler reports them", () => {
    const report = synthesizeNodeReport(
      baseArgs({
        outcome: "failed",
        summary: {
          errorMessage: "TypeError: cannot read property of undefined",
          errorSignature: "abc123",
        } as unknown as Partial<ItemSummary>,
      }),
    );
    NodeReportArtifactSchema.parse(report);
    assert.equal(report.errorMessage, "TypeError: cannot read property of undefined");
    assert.equal(report.errorSignature, "abc123");
  });

  it("preserves the trigger label from classifier output", () => {
    const report = synthesizeNodeReport(baseArgs({ trigger: "triage-reroute" }));
    assert.equal(report.trigger, "triage-reroute");
  });

  it("falls back to summary.durationMs when the timestamps disagree", () => {
    const report = synthesizeNodeReport(
      baseArgs({
        finishedAt: "not-a-date",
        summary: { durationMs: 1234 } as Partial<ItemSummary>,
      }),
    );
    assert.equal(report.durationMs, 1234);
  });
});

describe("writeNodeReport (Track B2)", () => {
  function makeCtx(appRoot: string): {
    ctx: NodeContext;
    bus: FileArtifactBus;
  } {
    const fs = new LocalFilesystem();
    const bus = new FileArtifactBus(appRoot, fs);
    // Minimal NodeContext — only the fields writeNodeReport reads are real.
    const ctx = {
      slug: "demo",
      itemKey: "backend-dev",
      executionId: newInvocationId(),
      appRoot,
      filesystem: fs,
    } as unknown as NodeContext;
    return { ctx, bus };
  }

  it("writes a valid report via the bus and returns a serialized ref", async () => {
    const appRoot = mkdtempSync(join(tmpdir(), "b2-write-"));
    const { ctx, bus } = makeCtx(appRoot);
    const report = synthesizeNodeReport(
      baseArgs({
        invocationId: ctx.executionId,
        summary: { filesChanged: ["x.ts"] } as Partial<ItemSummary>,
      }),
    );
    const ref = await writeNodeReport(bus, ctx, report);
    assert.equal(ref.kind, "node-report");
    assert.equal(ref.scope, "node");
    assert.match(ref.path, /node-report\.json$/);
    // Round-trip schema validation via the boundary helper. Re-fetch a
    // typed ref from the bus to satisfy `bus.read`'s ArtifactRef signature.
    const rereadRef = bus.ref(ctx.slug, "node-report", {
      nodeKey: ctx.itemKey,
      invocationId: ctx.executionId,
    });
    const body = await bus.read(rereadRef);
    assert.doesNotThrow(() => validateArtifactPayload("node-report", body));
  });

  it("rejects an ad-hoc write with a malformed payload (boundary check)", async () => {
    const appRoot = mkdtempSync(join(tmpdir(), "b2-reject-"));
    const { ctx, bus } = makeCtx(appRoot);
    const ref = bus.ref(ctx.slug, "node-report", {
      nodeKey: ctx.itemKey,
      invocationId: ctx.executionId,
    });
    await assert.rejects(
      () => bus.write(ref, JSON.stringify({ nodeKey: "x" })),
      /failed schema validation/,
    );
  });
});
