/**
 * src/temporal/telemetry/otel-pipeline-logger.ts — OTel-emitting
 * `PipelineLogger` adapter (Session 5 P5).
 *
 * Bridges DAGent's structured `PipelineLogger` event surface to
 * OpenTelemetry. Each `event(...)` call lands as a span event on the
 * currently-active span — which inside a Temporal activity is the
 * span the `OpenTelemetryPlugin` (Session 4 / D-S4-1) creates per
 * activity execution. Net effect: every existing `ctx.logger.event`
 * call site automatically emits to Tempo without any caller change.
 *
 * Design notes
 * ────────────
 * 1. **No buffering.** OTel's BatchSpanProcessor already buffers and
 *    flushes; this adapter is a thin pass-through. We do NOT keep an
 *    in-memory event ring (the legacy `JsonlPipelineLogger` does for
 *    `query()` / `materializeItemSummary()`). Those query methods are
 *    not used inside Temporal activities — the workflow body owns
 *    state via `DagState`, not by querying the logger. So they can
 *    safely return empty.
 *
 * 2. **`blob(...)` becomes a span attribute** truncated at 8 KB to
 *    stay under typical OTLP payload caps. Larger blobs should be
 *    persisted to the artifact bus, not the trace.
 *
 * 3. **Activity-scope only.** This adapter calls
 *    `trace.getActiveSpan()` which returns the span attached to the
 *    current Node `AsyncLocalStorage` context. Workflow-body code can
 *    NOT use this — workflows are sandboxed and forbid `node:*`
 *    imports (the lint rule fires). That's fine: workflow telemetry
 *    is owned by the Temporal SDK + interceptor plugin already.
 *
 * 4. **`emitRunEnd` is a no-op.** Run lifecycle is owned by the
 *    Temporal workflow, not by an activity-scoped logger; the workflow
 *    completion span carries the equivalent attribute.
 */

import { trace, type Span, type Tracer } from "@opentelemetry/api";
import type { ItemSummary } from "../../types.js";
import type {
  EventKind,
  EventFilter,
  PipelineEvent,
  PipelineLogger,
  NodeTrace,
  RunEndReason,
} from "../../telemetry/events.js";

/** Hard cap on blob attribute length to stay under typical OTLP/grpc
 *  payload limits. Large content belongs in the artifact bus. */
const MAX_BLOB_ATTRIBUTE_BYTES = 8 * 1024;

export interface OtelPipelineLoggerOptions {
  /**
   * Tracer name. Defaults to "dagent-pipeline" — appears as the
   * `instrumentation_scope.name` on every emitted span event.
   */
  readonly tracerName?: string;
  /**
   * Optional pre-built tracer override (tests inject a fake; production
   * leaves this undefined and we resolve via `trace.getTracer`).
   */
  readonly tracer?: Tracer;
  /**
   * Optional override for `trace.getActiveSpan` lookup. Tests use this
   * to install a deterministic span without rewiring AsyncLocalStorage.
   */
  readonly getActiveSpan?: () => Span | undefined;
}

/**
 * `PipelineLogger` that emits each event as an OTel span event on the
 * currently-active span. See file header for the design contract.
 */
export class OtelPipelineLogger implements PipelineLogger {
  readonly runId: string;
  private readonly tracer: Tracer;
  private readonly getActive: () => Span | undefined;
  /** Map of event id → owning span, so `blob()` can attach to the
   *  same span the `event()` call wrote to. We keep last-256 entries
   *  bounded to avoid unbounded growth in long-running workers. */
  private readonly eventToSpan = new Map<string, WeakRef<Span>>();
  /** Per-itemKey attempt counter (mirrors JsonlPipelineLogger). */
  private readonly attempts = new Map<string, number>();

  constructor(runId: string, options: OtelPipelineLoggerOptions = {}) {
    this.runId = runId;
    this.tracer = options.tracer ?? trace.getTracer(options.tracerName ?? "dagent-pipeline");
    this.getActive = options.getActiveSpan ?? (() => trace.getActiveSpan());
  }

  event(kind: EventKind, itemKey: string | null, data: Record<string, unknown>): string {
    const eventId = makeEventId();
    const span = this.getActive();
    if (!span) {
      // No active span — we're outside any activity context. Drop
      // silently; the worker bootstrap log line tells operators OTel
      // is on, and the legacy noop behaviour was also a drop.
      return eventId;
    }
    const attempt = itemKey ? this.attempts.get(itemKey) : undefined;
    const attrs: Record<string, string | number | boolean> = {
      "dagent.run_id": this.runId,
      "dagent.event.id": eventId,
      "dagent.event.kind": kind,
    };
    if (itemKey) attrs["dagent.item.key"] = itemKey;
    if (attempt !== undefined) attrs["dagent.item.attempt"] = attempt;
    for (const [k, v] of Object.entries(data)) {
      const flat = flattenAttribute(v);
      if (flat !== undefined) attrs[`dagent.data.${k}`] = flat;
    }
    span.addEvent(kind, attrs);
    this.rememberSpan(eventId, span);
    return eventId;
  }

  blob(eventId: string, label: string, content: string): void {
    const span = this.eventToSpan.get(eventId)?.deref() ?? this.getActive();
    if (!span) return;
    const truncated =
      content.length > MAX_BLOB_ATTRIBUTE_BYTES
        ? content.slice(0, MAX_BLOB_ATTRIBUTE_BYTES) + "…[truncated]"
        : content;
    span.addEvent(`blob:${label}`, {
      "dagent.blob.event_id": eventId,
      "dagent.blob.label": label,
      "dagent.blob.size": content.length,
      "dagent.blob.content": truncated,
    });
  }

  query(_filter: EventFilter): PipelineEvent[] {
    // OTel adapter does not retain events — backends own them. The
    // workflow body holds canonical state via DagState; activity code
    // never calls `query()` on its own logger.
    return [];
  }

  setAttempt(itemKey: string, attempt: number): void {
    this.attempts.set(itemKey, attempt);
  }

  emitRunEnd(_reason: RunEndReason, _extra?: Record<string, unknown>): void {
    // No-op. Run-level events are emitted by the Temporal workflow,
    // not by activity-scoped loggers.
  }

  materializeItemSummary(_itemKey: string, _attempt?: number): ItemSummary | null {
    return null;
  }

  queryNodeTrace(itemKey: string): NodeTrace {
    return { itemKey, totalAttempts: 0, attempts: [], upstreamNodes: [], downstreamNodes: [] };
  }

  private rememberSpan(eventId: string, span: Span): void {
    if (this.eventToSpan.size > 256) {
      // Drop oldest entry — Map iteration order is insertion order.
      const oldest = this.eventToSpan.keys().next().value;
      if (oldest !== undefined) this.eventToSpan.delete(oldest);
    }
    this.eventToSpan.set(eventId, new WeakRef(span));
  }
}

/**
 * Flatten a `data` value into a primitive that OTel attributes accept.
 * Arrays of primitives pass through; objects are JSON-stringified up
 * to a 4 KB cap to bound payload size.
 */
function flattenAttribute(v: unknown): string | number | boolean | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  try {
    const json = JSON.stringify(v);
    return json.length > 4096 ? json.slice(0, 4096) + "…[truncated]" : json;
  } catch {
    return undefined;
  }
}

/**
 * Generate a deterministic-shape event id. Random suffix is fine here
 * — OtelPipelineLogger is activity-scope (full Node), not workflow
 * sandbox, so `Math.random()` is permitted.
 */
function makeEventId(): string {
  return `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
