/**
 * logger.ts — Unified pipeline event bus with JSONL backend.
 *
 * Single entry point for ALL orchestrator telemetry. Replaces ~40 scattered
 * console.log statements and 5 redundant file writers with a single event
 * stream backed by append-only JSONL files.
 *
 * Design principles:
 *   1. Collect, don't analyze — emit events, never interpret at log time
 *   2. Two data types — structured events (fixed schema) + raw blobs (free text)
 *   3. Single accumulator — each datum captured in exactly one place
 *   4. Node-agnostic — event kinds describe *what happened*, not *which agent*
 *   5. Backend-swappable — PipelineLogger interface; JSONL today, SQLite tomorrow
 */

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { ItemSummary } from "./types.js";

// ---------------------------------------------------------------------------
// Event kinds — exhaustive enum covering everything currently logged
// ---------------------------------------------------------------------------

export type EventKind =
  // Lifecycle
  | "run.start"
  | "run.end"
  | "batch.start"
  | "batch.end"
  | "item.start"
  | "item.end"
  | "item.skip"
  | "item.barrier"
  | "item.approval"
  // Tool calls
  | "tool.call"
  | "tool.result"
  // Agent
  | "agent.intent"
  | "agent.message"
  | "agent.usage"
  // State
  | "state.complete"
  | "state.fail"
  | "state.reset"
  | "state.salvage"
  // Triage
  | "triage.evaluate"
  // Handoff
  | "handoff.emit"
  | "handoff.inject"
  // Git
  | "git.commit"
  | "git.push"
  // Breaker
  | "breaker.fire"
  // Lifecycle hooks
  | "hook.pre.start"
  | "hook.pre.end"
  | "hook.post.start"
  | "hook.post.end";

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

export interface PipelineEvent {
  /** Unique event ID (UUID v4) */
  id: string;
  /** ISO timestamp */
  ts: string;
  /** Pipeline run ID — stable across the entire orchestrator execution */
  run_id: string;
  /** Pipeline item key (null for run-level events) */
  item_key: string | null;
  /** Attempt number (null for non-item events) */
  attempt: number | null;
  /** Event classification */
  kind: EventKind;
  /** Event-specific payload */
  data: Record<string, unknown>;
}

export interface PipelineBlob {
  /** FK to PipelineEvent.id */
  event_id: string;
  /** Human-readable label (e.g. "error_trace", "full_message") */
  label: string;
  /** Raw text content */
  content: string;
}

export interface EventFilter {
  kind?: EventKind | EventKind[];
  item_key?: string;
  attempt?: number;
  since?: string;
}

// ---------------------------------------------------------------------------
// PipelineLogger interface — the ONLY logging API
// ---------------------------------------------------------------------------

export interface PipelineLogger {
  /** Emit a structured event. Returns the event ID. */
  event(kind: EventKind, itemKey: string | null, data: Record<string, unknown>): string;

  /** Attach a raw text blob to an event (for large payloads). */
  blob(eventId: string, label: string, content: string): void;

  /** Synchronous query against the in-memory event buffer. */
  query(filter: EventFilter): PipelineEvent[];

  /** Set the current attempt for an item key (called by kernel on item start). */
  setAttempt(itemKey: string, attempt: number): void;

  /**
   * Materialize an ItemSummary from the in-memory event buffer.
   * Reads item.start, item.end, tool.call, agent.intent, agent.message,
   * agent.usage events to construct the equivalent of the old mutable summary.
   * Returns null if no events exist for the given item+attempt.
   */
  materializeItemSummary(itemKey: string, attempt?: number): ItemSummary | null;

  /** The run ID for this pipeline execution. */
  readonly runId: string;

  /**
   * Build a structured execution trace for a node across all attempts.
   * Captures: start/end, handler events, handoff (emit/inject), triage reroutes,
   * and state transitions — everything needed to trace execution flow between nodes.
   *
   * @param itemKey - The node key to trace
   * @returns NodeTrace with ordered events grouped by attempt
   */
  queryNodeTrace(itemKey: string): NodeTrace;
}

// ---------------------------------------------------------------------------
// NodeTrace — structured execution trace for a single node
// ---------------------------------------------------------------------------

export interface NodeTraceAttempt {
  /** 1-based attempt number */
  attempt: number;
  /** ISO timestamp of item.start */
  startedAt: string;
  /** ISO timestamp of item.end (empty if still running) */
  finishedAt: string;
  /** Execution outcome */
  outcome: string;
  /** Error message (if failed) */
  errorMessage?: string;
  /** Handler output keys emitted to downstream nodes */
  handoffEmitted: string[];
  /** Context types injected from upstream nodes */
  handoffInjected: string[];
  /** All events in this attempt (ordered) */
  events: PipelineEvent[];
}

export interface NodeTrace {
  /** The node key */
  itemKey: string;
  /** Total attempts across the pipeline run */
  totalAttempts: number;
  /** Per-attempt trace */
  attempts: NodeTraceAttempt[];
  /** Cross-node references: nodes this node received data from (via handoff.inject) */
  upstreamNodes: string[];
  /** Cross-node references: nodes that consumed this node's handoff data */
  downstreamNodes: string[];
}

// ---------------------------------------------------------------------------
// Console rendering — maps EventKind to emoji+text format
// ---------------------------------------------------------------------------

function renderEventToConsole(evt: PipelineEvent): string | null {
  const d = evt.data;
  switch (evt.kind) {
    case "run.start":
      return `\n  🚀 Pipeline started: ${d.slug} (${d.workflow_name}) on ${d.base_branch}`;
    case "run.end":
      return `\n  ${d.outcome === "complete" ? "✔" : "✖"} Pipeline ${d.outcome} (${formatMs(d.duration_ms as number)})`;

    case "batch.start":
      return (d.items as string[]).length > 1
        ? `\n${"─".repeat(70)}\n  🔀 Parallel batch: ${(d.items as string[]).join(" ‖ ")}\n${"─".repeat(70)}`
        : null; // Single-item batches don't need a banner
    case "batch.end":
      return null; // Silent

    case "item.start":
      return `\n${"═".repeat(70)}\n  Item: ${evt.item_key} | Agent: ${d.agent}\n${"═".repeat(70)}`;
    case "item.end": {
      const o = d.outcome as string;
      if (o === "completed") {
        const note = d.note ? ` (${d.note})` : "";
        return `  ✅ ${evt.item_key} complete${note}`;
      }
      if (d.halted) return `  ✖ HALTED: ${evt.item_key} — ${d.error_preview ?? o}`;
      if (o === "error") return `  ✖ ${evt.item_key} error: ${d.error_preview ?? "unknown"}`;
      return `  ⚠ ${evt.item_key} ${o} — retrying on next loop iteration`;
    }
    case "item.skip": {
      const st = d.skip_type as string;
      if (st === "circuit_breaker") return `\n  ⚡ Circuit breaker: ${evt.item_key} — ${d.reason}`;
      if (st === "auto_skip") return `  ✅ ${evt.item_key} complete (auto-skipped)`;
      if (st === "handler_skip") return `  ⏭ Handler skip: ${evt.item_key} — ${d.reason}`;
      if (st === "non_retryable") return `  ⚡ Non-retryable: ${evt.item_key} — ${d.reason}`;
      return `  ⏭ ${evt.item_key} skipped: ${d.reason}`;
    }
    case "item.barrier":
      return `  ⊕ Barrier ${evt.item_key} — all upstream resolved, auto-completing`;

    case "tool.call": {
      const label = CONSOLE_TOOL_LABELS[d.tool as string] ?? `🔧 ${d.tool}`;
      return `  ${label}${d.detail ?? ""}`;
    }
    case "tool.result":
      return null; // Tool results are silent in console (breaker injections logged separately)

    case "agent.intent":
      return `\n  💡 ${d.text}\n`;
    case "agent.message":
      return null; // Messages not logged to console by default
    case "agent.usage":
      return `  📊 Tokens: +${d.input_tokens}in / +${d.output_tokens}out / +${d.cache_read_tokens}cache-read / +${d.cache_write_tokens}cache-write`;

    case "state.complete":
      return null; // Covered by item.end
    case "state.fail":
      return null; // Covered by item.end
    case "state.reset":
      return `\n  🔄 Triage reroute: ${evt.item_key} → route_to: ${d.route_to} (domain: ${d.domain}, source: ${d.source})`;
    case "state.salvage":
      return `  🛑 Triggering Graceful Degradation — pipeline will open a Draft PR for human remediation.`;

    case "triage.evaluate": {
      const src = d.source as string;
      if (src === "rag") {
        return `  🔍 RAG triage: matched "${d.rag_selected}" → ${d.domain} (${d.reason})`;
      } else if (src === "llm") {
        return `  🤖 LLM triage result: fault_domain=${d.domain} (${d.reason})`;
      }
      return `  ⚠ Triage: ${d.domain} (${d.reason}) [${src}]`;
    }

    case "handoff.emit":
      return null; // Silent — diagnostic only
    case "handoff.inject": {
      const types = d.injection_types as string[];
      return types.length > 0 ? `  📎 Injected context: ${types.join(", ")}` : null;
    }

    case "git.commit":
      return `  🔒 Git commit: ${d.message}`;
    case "git.push":
      return d.deferred
        ? `  🔒 State committed locally — push deferred`
        : `  📤 Pushed to origin`;

    case "breaker.fire": {
      const t = d.type as string;
      if (t === "soft") return `\n  ⚠️  COGNITIVE CIRCUIT BREAKER INJECTED: Agent passed soft limit of ${d.threshold} calls.\n`;
      if (t === "hard") return `\n  ✖ HARD LIMIT: Agent exceeded ${d.tool_count} tool calls. Force-disconnecting session.\n`;
      if (t === "density") return `\n  ⚠️  WRITE-DENSITY BREAKER: "${d.file}" written ${d.write_count} times.\n`;
      if (t === "timeout") return `\n  ⏰ PRE-TIMEOUT WARNING INJECTED: ~${d.remaining_sec}s remaining before session timeout.\n`;
      return `  ⚠️  Circuit breaker: ${t}`;
    }

    default:
      return null;
  }
}

/** Tool labels for console rendering */
const CONSOLE_TOOL_LABELS: Record<string, string> = {
  read_file:    "📄 Read",
  write_file:   "✏️  Write",
  edit_file:    "✏️  Edit",
  bash:         "🖥  Shell",
  write_bash:   "🖥  Shell (write)",
  shell:        "🖥  StructuredShell",
  file_read:    "📄 SafeRead",
  view:         "👁  View",
  grep_search:  "🔍 Search",
  list_dir:     "📂 List",
  report_intent:"💭 Intent",
  report_outcome:"🏁 Outcome",
};

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  return remSecs > 0 ? `${mins}m ${remSecs}s` : `${mins}m`;
}

// ---------------------------------------------------------------------------
// JSONL Backend — append-only file writer + in-memory buffer
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// No-op logger — for tests and contexts where logging is disabled
// ---------------------------------------------------------------------------

export class NoopPipelineLogger implements PipelineLogger {
  readonly runId = "noop";
  event(_kind: EventKind, _itemKey: string | null, _data: Record<string, unknown>): string {
    return "noop";
  }
  blob(_eventId: string, _label: string, _content: string): void {}
  query(_filter: EventFilter): PipelineEvent[] { return []; }
  setAttempt(_itemKey: string, _attempt: number): void {}
  materializeItemSummary(_itemKey: string, _attempt?: number): ItemSummary | null { return null; }
  queryNodeTrace(itemKey: string): NodeTrace {
    return { itemKey, totalAttempts: 0, attempts: [], upstreamNodes: [], downstreamNodes: [] };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Create a JSONL-backed logger for a pipeline run. */
export function createPipelineLogger(appRoot: string, slug: string): JsonlPipelineLogger {
  const dir = path.join(appRoot, "in-progress");
  return new JsonlPipelineLogger(
    path.join(dir, `${slug}_EVENTS.jsonl`),
    path.join(dir, `${slug}_BLOBS.jsonl`),
  );
}
