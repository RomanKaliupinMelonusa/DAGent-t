/**
 * telemetry/multiplex-logger.ts — PipelineLogger that fans `event()` writes
 * out to a per-invocation `InvocationLogger` in addition to the global
 * pipeline logger.
 *
 * Why this exists
 * ---------------
 * `PipelineLogger.event(kind, itemKey, data)` is the single logging API
 * used across the orchestrator (handlers, session-events wiring,
 * triage). `InvocationLogger` is the per-invocation file sink that
 * writes to `<inv>/logs/{events,tool-calls,messages}.jsonl`. Without
 * this multiplexer, callers would have to know about both and dual-emit
 * — the per-invocation logs would silently stay empty for `tool.call`
 * and `agent.message` records that flow through `logger.event()`.
 *
 * The multiplexer is wired at the dispatch boundary in
 * `loop/dispatch/context-builder.ts`: `ctx.logger` becomes
 * `new MultiplexLogger(globalLogger, invocationLogger)`, so every
 * `ctx.logger.event(...)` call is automatically tee'd into the
 * per-invocation directory.
 *
 * Mapping rule
 * ------------
 *   event kind            →  InvocationLogger method
 *   ──────────────────────────────────────────────────
 *   "tool.call"           →  toolCall(record)
 *   "agent.message"       →  message(role, text, extra)
 *   anything else         →  event(record)
 *
 * The literal `kind` and `itemKey` arguments always win over any
 * matching field name a caller happens to put in `data` — a buggy
 * `logger.event("foo", "x", { kind: "bar" })` MUST still route through
 * the "foo" sink with `kind: "foo"` on the persisted record.
 *
 * Errors thrown by the invocation logger are swallowed (the global
 * logger already captured the record; the per-invocation tee is
 * best-effort and must never fail the run).
 *
 * All non-`event()` methods (`blob`, `query`, `setAttempt`,
 * `materializeItemSummary`, `queryNodeTrace`, `runId`) delegate
 * straight to the inner logger — those are pipeline-wide concerns the
 * per-invocation sink has no business owning.
 */

import type {
  EventKind,
  EventFilter,
  PipelineEvent,
  PipelineLogger,
  NodeTrace,
} from "./events.js";
import type { ItemSummary } from "../types.js";
import type { InvocationLogger } from "../ports/invocation-logger.js";

export class MultiplexLogger implements PipelineLogger {
  constructor(
    private readonly inner: PipelineLogger,
    private readonly invocation: InvocationLogger,
  ) {}

  get runId(): string {
    return this.inner.runId;
  }

  event(kind: EventKind, itemKey: string | null, data: Record<string, unknown>): string {
    const id = this.inner.event(kind, itemKey, data);
    // Fire-and-forget the per-invocation tee. Must never throw upward.
    this.fanOut(kind, itemKey, data).catch(() => { /* swallow */ });
    return id;
  }

  blob(eventId: string, label: string, content: string): void {
    this.inner.blob(eventId, label, content);
  }

  query(filter: EventFilter): PipelineEvent[] {
    return this.inner.query(filter);
  }

  setAttempt(itemKey: string, attempt: number): void {
    this.inner.setAttempt(itemKey, attempt);
  }

  materializeItemSummary(itemKey: string, attempt?: number): ItemSummary | null {
    return this.inner.materializeItemSummary(itemKey, attempt);
  }

  queryNodeTrace(itemKey: string): NodeTrace {
    return this.inner.queryNodeTrace(itemKey);
  }

  // ---------------------------------------------------------------------
  // Per-invocation fan-out
  // ---------------------------------------------------------------------

  private async fanOut(
    kind: EventKind,
    itemKey: string | null,
    data: Record<string, unknown>,
  ): Promise<void> {
    if (kind === "tool.call") {
      // Spread `data` first so the literal `kind`/`itemKey` always win
      // — a buggy caller passing `data.kind` MUST NOT shadow the
      // event-routing label.
      await this.invocation.toolCall({ ...data, kind, itemKey });
      return;
    }
    if (kind === "agent.message") {
      const role = typeof data["role"] === "string" ? (data["role"] as string) : "agent";
      const text = typeof data["text"] === "string"
        ? (data["text"] as string)
        : typeof data["content"] === "string"
          ? (data["content"] as string)
          : "";
      const { role: _r, text: _t, content: _c, ...extra } = data;
      // Same precedence rule: literal `itemKey` wins over any caller
      // field of the same name.
      await this.invocation.message(role, text, { ...extra, itemKey });
      return;
    }
    await this.invocation.event({ ...data, kind, itemKey });
  }
}
