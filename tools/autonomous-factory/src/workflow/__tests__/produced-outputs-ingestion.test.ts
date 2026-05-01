/**
 * produced-outputs-ingestion.test.ts — P5 of halt-discipline hardening.
 *
 * Asserts `ingestProducedOutputs` registers agent-produced artifacts that
 * land under `<inv>/outputs/` into both the returned ref list and the
 * persisted `meta.json#outputs`.
 *
 * Spec-compiler is the canonical scenario — the agent drops
 * `acceptance.yml` directly via `agent-write-file` and we want the bus
 * index + meta mirror to reflect it without the agent having to call
 * `report_outcome.handoffArtifact`.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ingestProducedOutputs } from "../../activities/support/produced-outputs-ingestion.js";
import { LocalFilesystem } from "../../adapters/local-filesystem.js";
import { FileInvocationFilesystem } from "../../adapters/file-invocation-filesystem.js";
import { newInvocationId } from "../../activities/support/invocation-id.js";
import type { NodeContext } from "../../contracts/node-context.js";
import type { PipelineLogger, EventKind } from "../../telemetry/events.js";
import type { InvocationRecord } from "../../types.js";

interface LoggedEvent { kind: EventKind; data: Record<string, unknown> }

function makeLogger(events: LoggedEvent[]): PipelineLogger {
  return {
    event(kind: EventKind, _itemKey: string | null, data?: Record<string, unknown>) {
      events.push({ kind, data: data ?? {} });
    },
  } as unknown as PipelineLogger;
}

function makeCtx(appRoot: string, itemKey = "spec-compiler"): {
  ctx: NodeContext;
  events: LoggedEvent[];
  outputsDir: string;
} {
  const events: LoggedEvent[] = [];
  const slug = "demo";
  const executionId = newInvocationId();
  const fs = new LocalFilesystem();
  const invocation = new FileInvocationFilesystem(appRoot, fs);
  const outputsDir = path.join(appRoot, ".dagent", slug, itemKey, executionId, "outputs");
  const ctx = {
    slug,
    itemKey,
    executionId,
    appRoot,
    attempt: 1,
    filesystem: fs,
    invocation,
    logger: makeLogger(events),
  } as unknown as NodeContext;
  return { ctx, events, outputsDir };
}

const VALID_ACCEPTANCE_YAML = "feature: quick-view\nsummary: Open a quick-view modal from PLP.\n";

describe("ingestProducedOutputs (P5)", () => {
  let appRoot: string;
  beforeEach(() => { appRoot = mkdtempSync(path.join(tmpdir(), "dagent-p5-")); });
  afterEach(() => { rmSync(appRoot, { recursive: true, force: true }); });

  it("returns [] when no outputs/ dir exists", async () => {
    const { ctx, events } = makeCtx(appRoot);
    const refs = await ingestProducedOutputs(ctx);
    expect(refs).toEqual([]);
    expect(events.find((e) => e.kind === "produced-outputs.ingested")).toBeUndefined();
  });

  it("registers a valid acceptance.yml and writes meta.json#outputs", async () => {
    const { ctx, events, outputsDir } = makeCtx(appRoot);
    mkdirSync(outputsDir, { recursive: true });
    writeFileSync(path.join(outputsDir, "acceptance.yml"), VALID_ACCEPTANCE_YAML);

    const refs = await ingestProducedOutputs(ctx);

    expect(refs).toHaveLength(1);
    expect(refs[0].kind).toBe("acceptance");
    expect(refs[0].scope).toBe("node");
    expect(refs[0].path).toBe(path.join(outputsDir, "acceptance.yml"));

    // meta.json reflects the ref.
    const metaPath = path.join(appRoot, ".dagent", ctx.slug, ctx.itemKey, ctx.executionId, "meta.json");
    const meta = JSON.parse(readFileSync(metaPath, "utf-8")) as InvocationRecord;
    expect(meta.outputs).toHaveLength(1);
    expect(meta.outputs?.[0].kind).toBe("acceptance");

    // Telemetry stamped success.
    expect(events.find((e) => e.kind === "produced-outputs.ingested")?.data.count).toBe(1);
  });

  it("ignores .gitkeep, sidecar files, and the handler-output envelope", async () => {
    const { ctx, outputsDir } = makeCtx(appRoot);
    mkdirSync(outputsDir, { recursive: true });
    writeFileSync(path.join(outputsDir, ".gitkeep"), "");
    writeFileSync(path.join(outputsDir, "handler-output.json"), "{}");
    writeFileSync(path.join(outputsDir, "acceptance.yml.meta.json"), "{}");
    writeFileSync(path.join(outputsDir, "acceptance.yml"), VALID_ACCEPTANCE_YAML);

    const refs = await ingestProducedOutputs(ctx);
    expect(refs.map((r) => r.kind)).toEqual(["acceptance"]);
  });

  it("drops files whose basename does not map to any catalog kind (with telemetry)", async () => {
    const { ctx, events, outputsDir } = makeCtx(appRoot);
    mkdirSync(outputsDir, { recursive: true });
    writeFileSync(path.join(outputsDir, "weird.txt"), "hello");

    const refs = await ingestProducedOutputs(ctx);
    expect(refs).toEqual([]);
    expect(events.find((e) => e.kind === "produced-outputs.unknown_filename")).toBeDefined();
  });

  it("drops files that fail schema validation (with telemetry)", async () => {
    const { ctx, events, outputsDir } = makeCtx(appRoot);
    mkdirSync(outputsDir, { recursive: true });
    // Missing required `feature` / `summary` fields.
    writeFileSync(path.join(outputsDir, "acceptance.yml"), "broken: yes\n");

    const refs = await ingestProducedOutputs(ctx);
    expect(refs).toEqual([]);
    expect(events.find((e) => e.kind === "produced-outputs.invalid")).toBeDefined();
  });

  it("is idempotent — calling twice does not duplicate refs in meta.json", async () => {
    const { ctx, outputsDir } = makeCtx(appRoot);
    mkdirSync(outputsDir, { recursive: true });
    writeFileSync(path.join(outputsDir, "acceptance.yml"), VALID_ACCEPTANCE_YAML);

    await ingestProducedOutputs(ctx);
    await ingestProducedOutputs(ctx);

    const metaPath = path.join(appRoot, ".dagent", ctx.slug, ctx.itemKey, ctx.executionId, "meta.json");
    const meta = JSON.parse(readFileSync(metaPath, "utf-8")) as InvocationRecord;
    expect(meta.outputs).toHaveLength(1);
  });
});
