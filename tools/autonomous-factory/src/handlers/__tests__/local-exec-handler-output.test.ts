/**
 * local-exec-handler-output.test.ts — script→handlerOutput ingestion.
 *
 * Exercises `ingestHandlerOutputEnvelope`, the helper behind the
 * `handler-output-ingestion` middleware that gives scripts symmetry with
 * the agent `report_outcome.handoffArtifact` path by ingesting
 * `$OUTPUTS_DIR/handler-output.json` into `NodeResult.handlerOutput`.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ingestHandlerOutputEnvelope } from "../middlewares/handler-output-ingestion.js";
import { LocalFilesystem } from "../../adapters/local-filesystem.js";
import { FileArtifactBus } from "../../adapters/file-artifact-bus.js";
import { newInvocationId } from "../../domain/invocation-id.js";
import type { NodeContext } from "../types.js";
import type { PipelineLogger, EventKind } from "../../telemetry/events.js";

interface LoggedEvent {
  kind: EventKind;
  itemKey: string | null;
  data: Record<string, unknown>;
}

function makeLogger(events: LoggedEvent[]): PipelineLogger {
  return {
    event(kind: EventKind, itemKey: string | null, data?: Record<string, unknown>) {
      events.push({ kind, itemKey, data: data ?? {} });
    },
    // The rest of the logger surface is unused by the helper.
  } as unknown as PipelineLogger;
}

function makeCtx(appRoot: string): { ctx: NodeContext; events: LoggedEvent[]; outputsDir: string } {
  const events: LoggedEvent[] = [];
  const slug = "demo";
  const itemKey = "my-script";
  const executionId = newInvocationId();
  const outputsDir = join(appRoot, ".dagent", slug, itemKey, executionId, "outputs");
  const ctx = {
    slug,
    itemKey,
    executionId,
    appRoot,
    filesystem: new LocalFilesystem(),
    logger: makeLogger(events),
  } as unknown as NodeContext;
  return { ctx, events, outputsDir };
}

function mkTmp(): string {
  return mkdtempSync(join(tmpdir(), "lx-handler-output-"));
}

describe("ingestHandlerOutputEnvelope", () => {
  it("returns empty output when no envelope file exists", async () => {
    const appRoot = mkTmp();
    const { ctx, events } = makeCtx(appRoot);

    const result = await ingestHandlerOutputEnvelope(ctx);

    assert.deepEqual(result.output, {});
    assert.equal(result.artifact, undefined);
    assert.equal(events.length, 0);
  });

  it("merges valid envelope output and surfaces artifact ref + telemetry", async () => {
    const appRoot = mkTmp();
    const { ctx, events, outputsDir } = makeCtx(appRoot);
    mkdirSync(outputsDir, { recursive: true });
    writeFileSync(
      join(outputsDir, "handler-output.json"),
      JSON.stringify({
        schemaVersion: 1,
        producedBy: "my-script",
        producedAt: new Date().toISOString(),
        output: { deployedSha: "abc123", count: 7 },
      }),
    );

    const result = await ingestHandlerOutputEnvelope(ctx);

    assert.deepEqual(result.output, { deployedSha: "abc123", count: 7 });
    assert.ok(result.artifact);
    assert.equal(result.artifact?.kind, "handler-output");
    assert.equal(result.artifact?.scope, "node");
    // Canonical path matches the Artifact Bus layout.
    const bus = new FileArtifactBus(appRoot, new LocalFilesystem());
    const ref = bus.ref(ctx.slug, "handler-output", {
      nodeKey: ctx.itemKey,
      invocationId: ctx.executionId,
    });
    assert.equal(result.artifact?.path, ref.path);
    assert.equal(events.some((e) => e.kind === "node.handler_output"), true);
  });

  it("drops reserved keys and emits handler-output.reserved_key", async () => {
    const appRoot = mkTmp();
    const { ctx, events, outputsDir } = makeCtx(appRoot);
    mkdirSync(outputsDir, { recursive: true });
    writeFileSync(
      join(outputsDir, "handler-output.json"),
      JSON.stringify({
        schemaVersion: 1,
        producedBy: "my-script",
        producedAt: new Date().toISOString(),
        output: {
          scriptOutput: "HIJACKED",
          exitCode: 999,
          timedOut: true,
          // `structuredFailure` is NOT reserved — scripts legitimately
          // surface Playwright JSON parse output through this key via the
          // `emit-playwright-handler-output.mjs` hook.
          structuredFailure: { kind: "playwright-json", total: 0, passed: 0, failed: 1, skipped: 0, failedTests: [], uncaughtErrors: [], consoleErrors: [], failedRequests: [] },
          legitimate: "ok",
        },
      }),
    );

    const result = await ingestHandlerOutputEnvelope(ctx);

    assert.deepEqual(
      Object.keys(result.output).sort(),
      ["legitimate", "structuredFailure"],
    );
    const warn = events.find((e) => e.kind === "handler-output.reserved_key");
    assert.ok(warn);
    assert.deepEqual(
      (warn?.data.keys as string[]).sort(),
      ["exitCode", "scriptOutput", "timedOut"],
    );
  });

  it("returns empty on malformed JSON with a schema_invalid telemetry warning", async () => {
    const appRoot = mkTmp();
    const { ctx, events, outputsDir } = makeCtx(appRoot);
    mkdirSync(outputsDir, { recursive: true });
    writeFileSync(join(outputsDir, "handler-output.json"), "{not-json");

    const result = await ingestHandlerOutputEnvelope(ctx);

    assert.deepEqual(result.output, {});
    assert.equal(result.artifact, undefined);
    const warn = events.find((e) => e.kind === "handler-output.invalid");
    assert.ok(warn);
    assert.equal(warn?.data.reason, "schema_invalid");
  });

  it("returns empty when the envelope is missing required fields", async () => {
    const appRoot = mkTmp();
    const { ctx, events, outputsDir } = makeCtx(appRoot);
    mkdirSync(outputsDir, { recursive: true });
    writeFileSync(
      join(outputsDir, "handler-output.json"),
      JSON.stringify({ output: { foo: "bar" } }), // missing envelope triplet
    );

    const result = await ingestHandlerOutputEnvelope(ctx);

    assert.deepEqual(result.output, {});
    assert.equal(result.artifact, undefined);
    assert.ok(events.some((e) => e.kind === "handler-output.invalid"));
  });

  it("returns empty when `output` is not an object", async () => {
    const appRoot = mkTmp();
    const { ctx, events, outputsDir } = makeCtx(appRoot);
    mkdirSync(outputsDir, { recursive: true });
    writeFileSync(
      join(outputsDir, "handler-output.json"),
      JSON.stringify({
        schemaVersion: 1,
        producedBy: "my-script",
        producedAt: new Date().toISOString(),
        output: "not-an-object",
      }),
    );

    const result = await ingestHandlerOutputEnvelope(ctx);

    assert.deepEqual(result.output, {});
    assert.ok(events.some((e) => e.kind === "handler-output.invalid"));
  });
});
