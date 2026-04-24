/**
 * telemetry/events.ts — Event schema and PipelineLogger interface.
 *
 * Pure type definitions shared across the telemetry subsystem. Backends
 * (JSONL, no-op, future SQLite) implement `PipelineLogger`.
 */

import type { ItemSummary } from "../types.js";

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
  | "state.stall"
  // Triage
  | "triage.evaluate"
  | "triage.enqueue"
  | "triage.dispatch"
  | "triage.handoff.skipped_non_completed"
  // Handoff
  | "handoff.emit"
  | "handoff.inject"
  // Git
  | "git.commit"
  | "git.push"
  // Breaker
  | "breaker.fire"
  // Retry backoff (loop-level exponential sleep between failed batches)
  | "retry.backoff"
  // Lifecycle hooks
  | "hook.pre.start"
  | "hook.pre.end"
  | "hook.post.start"
  | "hook.post.end"
  // Metrics (structured observation, emitted by the metrics middleware)
  | "node.metric"
  // Artifact bus / invocation ledger (Phase 4)
  | "invocation.append_failed"
  | "invocation.seal_failed"
  | "invocation.params_write_failed"
  | "invocation.meta_write_failed"
  | "invocation.meta_seal_failed"
  | "invocation.node_report_failed"
  // Uniform per-invocation lifecycle (Phase B — fires for every handler type
  // regardless of whether the handler itself emits item.start/item.end).
  // Stamped with { invocationId, nodeKey, trigger, parentInvocationId,
  // cycleIndex, attempt }. Triage filters by invocationId for lineage.
  | "node.start"
  | "node.end"
  | "node.artifact.write"
  | "node.artifact.seal"
  // Script handler-output envelope (symmetric counterpart to handoff.emit
  // for the agent path). Fired by local-exec when a script writes
  // `$OUTPUTS_DIR/handler-output.json` and the envelope is ingested.
  // `handler-output.invalid` / `handler-output.reserved_key` are advisory
  // warnings that never fail the script.
  | "node.handler_output"
  | "handler-output.invalid"
  | "handler-output.reserved_key";

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
