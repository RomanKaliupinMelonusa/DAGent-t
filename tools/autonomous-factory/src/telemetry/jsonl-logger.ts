/**
 * telemetry/jsonl-logger.ts — JSONL-backed PipelineLogger implementation.
 */

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { ItemSummary } from "../types.js";
import type {
  EventKind,
  EventFilter,
  PipelineEvent,
  PipelineBlob,
  PipelineLogger,
  NodeTrace,
  NodeTraceAttempt,
} from "./events.js";
import { renderEventToConsole } from "./console-render.js";

export class JsonlPipelineLogger implements PipelineLogger {
  readonly runId: string;

  /** In-memory event buffer for hot-path reads (query, materialize) */
  private events: PipelineEvent[] = [];
  private blobs: PipelineBlob[] = [];

  /** File descriptors (lazy-opened on first write) */
  private eventsFd: number | null = null;
  private blobsFd: number | null = null;

  /** Current item context for attempt tracking */
  private currentAttempts: Record<string, number> = {};

  constructor(
    private readonly eventsPath: string,
    private readonly blobsPath: string,
    runId?: string,
  ) {
    this.runId = runId ?? randomUUID();

    // Flush on process exit (best-effort).
    // Store the bound handler so we can remove it in close() to prevent
    // accumulating handlers when multiple loggers are created (e.g. in tests).
    this._exitHandler = () => this.close();
    process.on("exit", this._exitHandler);
  }

  /** Bound reference for deregistration */
  private _exitHandler: () => void;

  /** Set the current attempt for an item key (called by kernel on item start) */
  setAttempt(itemKey: string, attempt: number): void {
    this.currentAttempts[itemKey] = attempt;
  }

  event(kind: EventKind, itemKey: string | null, data: Record<string, unknown>): string {
    const evt: PipelineEvent = {
      id: randomUUID(),
      ts: new Date().toISOString(),
      run_id: this.runId,
      item_key: itemKey,
      attempt: itemKey ? (this.currentAttempts[itemKey] ?? null) : null,
      kind,
      data,
    };

    // In-memory buffer
    this.events.push(evt);

    // Append to JSONL file
    this.appendEvent(evt);

    // Console rendering
    const line = renderEventToConsole(evt);
    if (line !== null) {
      if (kind.startsWith("breaker.") || kind === "state.salvage") {
        console.warn(line);
      } else {
        console.log(line);
      }
    }

    return evt.id;
  }

  blob(eventId: string, label: string, content: string): void {
    const b: PipelineBlob = { event_id: eventId, label, content };
    this.blobs.push(b);
    this.appendBlob(b);
  }

  query(filter: EventFilter): PipelineEvent[] {
    let results = this.events;

    if (filter.kind) {
      const kinds = Array.isArray(filter.kind) ? filter.kind : [filter.kind];
      results = results.filter((e) => kinds.includes(e.kind));
    }
    if (filter.item_key !== undefined) {
      results = results.filter((e) => e.item_key === filter.item_key);
    }
    if (filter.attempt !== undefined) {
      results = results.filter((e) => e.attempt === filter.attempt);
    }
    if (filter.since) {
      results = results.filter((e) => e.ts >= filter.since!);
    }

    return results;
  }

  /** Return all events (read-only). Used by materializers. */
  allEvents(): readonly PipelineEvent[] {
    return this.events;
  }

  /**
   * Materialize an ItemSummary from the in-memory event buffer.
   * Reads from memory (not disk) for hot-path performance.
   */
  materializeItemSummary(itemKey: string, attempt?: number): ItemSummary | null {
    const events = this.events.filter((e) =>
      e.item_key === itemKey &&
      (attempt === undefined || e.attempt === attempt),
    );
    if (events.length === 0) return null;

    // Find the item.start event to seed the summary
    const startEvt = events.find((e) => e.kind === "item.start");
    const endEvt = [...events].reverse().find((e) => e.kind === "item.end");
    const usageEvts = events.filter((e) => e.kind === "agent.usage");
    const intentEvts = events.filter((e) => e.kind === "agent.intent");
    const messageEvts = events.filter((e) => e.kind === "agent.message");
    const toolEvts = events.filter((e) => e.kind === "tool.call");

    const toolCounts: Record<string, number> = {};
    const filesRead: string[] = [];
    const filesChanged: string[] = [];
    for (const t of toolEvts) {
      const cat = (t.data.category as string) ?? (t.data.tool as string) ?? "unknown";
      toolCounts[cat] = (toolCounts[cat] ?? 0) + 1;
      if (t.data.is_write && t.data.file) {
        const f = t.data.file as string;
        if (!filesChanged.includes(f)) filesChanged.push(f);
      } else if (t.data.file) {
        const f = t.data.file as string;
        if (!filesRead.includes(f)) filesRead.push(f);
      }
    }

    let inputTokens = 0, outputTokens = 0, cacheReadTokens = 0, cacheWriteTokens = 0;
    for (const u of usageEvts) {
      inputTokens += (u.data.input_tokens as number) ?? 0;
      outputTokens += (u.data.output_tokens as number) ?? 0;
      cacheReadTokens += (u.data.cache_read_tokens as number) ?? 0;
      cacheWriteTokens += (u.data.cache_write_tokens as number) ?? 0;
    }

    const startedAt = startEvt?.ts ?? events[0].ts;
    const finishedAt = endEvt?.ts ?? "";
    const startMs = new Date(startedAt).getTime();
    const endMs = finishedAt ? new Date(finishedAt).getTime() : Date.now();

    const outcome = endEvt
      ? (endEvt.data.outcome as ItemSummary["outcome"]) ?? "completed"
      : "in-progress";

    return {
      key: itemKey,
      label: (startEvt?.data.label as string) ?? itemKey,
      agent: (startEvt?.data.agent as string) ?? itemKey,
      attempt: attempt ?? (startEvt?.attempt ?? 1),
      startedAt,
      finishedAt,
      durationMs: endMs - startMs,
      outcome,
      intents: intentEvts.map((e) => e.data.text as string),
      messages: messageEvts.map((e) => e.data.preview as string).filter(Boolean),
      filesRead,
      filesChanged,
      shellCommands: [],
      toolCounts,
      errorMessage: endEvt?.data.error_preview as string | undefined,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
    };
  }

  queryNodeTrace(itemKey: string): NodeTrace {
    const nodeEvents = this.events.filter((e) => e.item_key === itemKey);

    // Group events by attempt
    const byAttempt = new Map<number, PipelineEvent[]>();
    for (const evt of nodeEvents) {
      const a = evt.attempt ?? 1;
      if (!byAttempt.has(a)) byAttempt.set(a, []);
      byAttempt.get(a)!.push(evt);
    }

    const attempts: NodeTraceAttempt[] = [];
    for (const [attempt, events] of [...byAttempt.entries()].sort((a, b) => a[0] - b[0])) {
      const startEvt = events.find((e) => e.kind === "item.start");
      const endEvt = [...events].reverse().find((e) => e.kind === "item.end");

      const handoffEmitted = events
        .filter((e) => e.kind === "handoff.emit")
        .flatMap((e) => (e.data.keys as string[]) ?? []);
      const handoffInjected = events
        .filter((e) => e.kind === "handoff.inject")
        .flatMap((e) => (e.data.injection_types as string[]) ?? []);

      attempts.push({
        attempt,
        startedAt: startEvt?.ts ?? events[0]?.ts ?? "",
        finishedAt: endEvt?.ts ?? "",
        outcome: (endEvt?.data.outcome as string) ?? "in-progress",
        errorMessage: endEvt?.data.error_preview as string | undefined,
        handoffEmitted,
        handoffInjected,
        events,
      });
    }

    // Cross-node references from handoff events across all items.
    // Match emitters to consumers by comparing emitted vs injected keys.
    const upstreamNodes = new Set<string>();
    const downstreamNodes = new Set<string>();

    // Keys this node consumed (from handoff.inject events)
    const consumedKeys = new Set<string>();
    for (const evt of nodeEvents) {
      if (evt.kind === "handoff.inject") {
        for (const t of (evt.data.injection_types as string[]) ?? []) {
          consumedKeys.add(t);
        }
      }
    }

    // Keys this node emitted (from handoff.emit events)
    const emittedKeys = new Set<string>();
    for (const evt of nodeEvents) {
      if (evt.kind === "handoff.emit" && evt.data.channel === "handler_data") {
        for (const k of (evt.data.keys as string[]) ?? []) {
          emittedKeys.add(k);
        }
      }
    }

    // Upstream: other nodes whose emitted keys overlap with what this node consumed
    if (consumedKeys.size > 0) {
      for (const evt of this.events) {
        if (evt.kind === "handoff.emit" && evt.data.channel === "handler_data" &&
            evt.item_key && evt.item_key !== itemKey) {
          const otherKeys = (evt.data.keys as string[]) ?? [];
          if (otherKeys.some((k) => consumedKeys.has(k) || consumedKeys.has(`missing_optional:${k}`) || consumedKeys.has(`missing_required:${k}`))) {
            upstreamNodes.add(evt.item_key);
          }
        }
      }
    }

    // Downstream: other nodes whose consumed keys overlap with what this node emitted
    if (emittedKeys.size > 0) {
      for (const evt of this.events) {
        if (evt.kind === "handoff.inject" && evt.item_key && evt.item_key !== itemKey) {
          const otherInjections = (evt.data.injection_types as string[]) ?? [];
          if (otherInjections.some((t) => emittedKeys.has(t) || emittedKeys.has(t.replace(/^missing_(optional|required):/, "")))) {
            downstreamNodes.add(evt.item_key);
          }
        }
      }
    }

    return {
      itemKey,
      totalAttempts: attempts.length,
      attempts,
      upstreamNodes: [...upstreamNodes],
      downstreamNodes: [...downstreamNodes],
    };
  }

  /** Close file descriptors and deregister exit handler. */
  close(): void {
    if (this._exitHandler) {
      process.removeListener("exit", this._exitHandler);
    }
    if (this.eventsFd !== null) {
      try { fs.closeSync(this.eventsFd); } catch { /* best-effort */ }
      this.eventsFd = null;
    }
    if (this.blobsFd !== null) {
      try { fs.closeSync(this.blobsFd); } catch { /* best-effort */ }
      this.blobsFd = null;
    }
  }

  // --- Private helpers ---

  private appendEvent(evt: PipelineEvent): void {
    try {
      if (this.eventsFd === null) {
        fs.mkdirSync(path.dirname(this.eventsPath), { recursive: true });
        this.eventsFd = fs.openSync(this.eventsPath, "a");
      }
      fs.writeSync(this.eventsFd, JSON.stringify(evt) + "\n");
    } catch { /* non-fatal — in-memory buffer is the primary source */ }
  }

  private appendBlob(b: PipelineBlob): void {
    try {
      if (this.blobsFd === null) {
        fs.mkdirSync(path.dirname(this.blobsPath), { recursive: true });
        this.blobsFd = fs.openSync(this.blobsPath, "a");
      }
      fs.writeSync(this.blobsFd, JSON.stringify(b) + "\n");
    } catch { /* non-fatal */ }
  }
}
