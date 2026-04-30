/**
 * otel-pipeline-logger.test.ts — Unit tests for the OTel-emitting
 * `PipelineLogger` adapter (Session 5 P5).
 *
 * Uses an injected fake span / fake `getActiveSpan` to assert the
 * adapter forwards each `event(...)` / `blob(...)` to OTel without
 * needing a real exporter. A separate smoke test runs against an
 * actual OTLP collector in CI under `temporal-it.yml`.
 */

import { describe, it, expect, beforeEach } from "vitest";
import type { Span, Tracer } from "@opentelemetry/api";
import { OtelPipelineLogger } from "../otel-pipeline-logger.js";

interface RecordedEvent {
  readonly name: string;
  readonly attrs: Record<string, unknown>;
}

class FakeSpan {
  readonly events: RecordedEvent[] = [];
  addEvent(name: string, attrs?: Record<string, unknown>): this {
    this.events.push({ name, attrs: attrs ?? {} });
    return this;
  }
  // Stub out the rest of Span's surface — never called by the adapter.
  spanContext() { return { traceId: "0", spanId: "0", traceFlags: 0 }; }
  setAttribute() { return this; }
  setAttributes() { return this; }
  addLink() { return this; }
  addLinks() { return this; }
  setStatus() { return this; }
  updateName() { return this; }
  end() {}
  isRecording() { return true; }
  recordException() {}
}

const stubTracer: Tracer = {
  startSpan: () => { throw new Error("not used"); },
  startActiveSpan: () => { throw new Error("not used"); },
} as unknown as Tracer;

describe("OtelPipelineLogger", () => {
  let span: FakeSpan;
  let logger: OtelPipelineLogger;

  beforeEach(() => {
    span = new FakeSpan();
    logger = new OtelPipelineLogger("run-test", {
      tracer: stubTracer,
      getActiveSpan: () => span as unknown as Span,
    });
  });

  it("emits each PipelineLogger event as a span event", () => {
    logger.event("item.start", "build:web", { phase: "queued" });
    expect(span.events).toHaveLength(1);
    const ev = span.events[0]!;
    expect(ev.name).toBe("item.start");
    expect(ev.attrs["dagent.event.kind"]).toBe("item.start");
    expect(ev.attrs["dagent.run_id"]).toBe("run-test");
    expect(ev.attrs["dagent.item.key"]).toBe("build:web");
    expect(ev.attrs["dagent.data.phase"]).toBe("queued");
  });

  it("includes the per-itemKey attempt when set", () => {
    logger.setAttempt("dev:web", 2);
    logger.event("item.start", "dev:web", {});
    expect(span.events[0]?.attrs["dagent.item.attempt"]).toBe(2);
  });

  it("returns a non-empty event id for each call", () => {
    const a = logger.event("agent.intent", null, { intent: "draft" });
    const b = logger.event("agent.intent", null, { intent: "draft" });
    expect(a).toMatch(/^evt_/);
    expect(b).toMatch(/^evt_/);
    expect(a).not.toBe(b);
  });

  it("flattens object data values to JSON-string attributes", () => {
    logger.event("agent.usage", "x", { usage: { prompt: 10, completion: 20 } });
    const attr = span.events[0]?.attrs["dagent.data.usage"];
    expect(typeof attr).toBe("string");
    expect(JSON.parse(attr as string)).toEqual({ prompt: 10, completion: 20 });
  });

  it("drops null/undefined data fields silently", () => {
    logger.event("item.start", "x", { phase: null, ok: undefined });
    const attrs = span.events[0]!.attrs;
    expect(attrs).not.toHaveProperty("dagent.data.phase");
    expect(attrs).not.toHaveProperty("dagent.data.ok");
  });

  it("blob() emits a `blob:<label>` span event with content + size", () => {
    const id = logger.event("agent.message", "x", {});
    logger.blob(id, "stderr_tail", "boom\nstack...");
    expect(span.events).toHaveLength(2);
    const blobEvent = span.events[1]!;
    expect(blobEvent.name).toBe("blob:stderr_tail");
    expect(blobEvent.attrs["dagent.blob.label"]).toBe("stderr_tail");
    expect(blobEvent.attrs["dagent.blob.size"]).toBe("boom\nstack...".length);
    expect(blobEvent.attrs["dagent.blob.content"]).toBe("boom\nstack...");
    expect(blobEvent.attrs["dagent.blob.event_id"]).toBe(id);
  });

  it("blob() truncates oversize content", () => {
    const big = "x".repeat(20 * 1024); // 20 KB
    const id = logger.event("agent.message", "x", {});
    logger.blob(id, "huge", big);
    const content = span.events[1]!.attrs["dagent.blob.content"] as string;
    expect(content.length).toBeLessThan(big.length);
    expect(content.endsWith("…[truncated]")).toBe(true);
    // Original byte size still reported.
    expect(span.events[1]!.attrs["dagent.blob.size"]).toBe(big.length);
  });

  it("event() returns id silently when no active span", () => {
    const noSpanLogger = new OtelPipelineLogger("run-x", {
      tracer: stubTracer,
      getActiveSpan: () => undefined,
    });
    const id = noSpanLogger.event("item.start", "x", {});
    expect(id).toMatch(/^evt_/);
    // Nothing observable to assert — the call is a documented drop.
  });

  it("query() returns empty (events live in OTel backend)", () => {
    logger.event("item.start", "x", {});
    expect(logger.query({})).toEqual([]);
  });

  it("emitRunEnd() is a no-op", () => {
    logger.emitRunEnd("complete");
    expect(span.events).toHaveLength(0);
  });

  it("queryNodeTrace returns an empty trace shell", () => {
    const trace = logger.queryNodeTrace("foo");
    expect(trace).toEqual({
      itemKey: "foo",
      totalAttempts: 0,
      attempts: [],
      upstreamNodes: [],
      downstreamNodes: [],
    });
  });

  it("exposes runId verbatim", () => {
    expect(logger.runId).toBe("run-test");
  });
});
