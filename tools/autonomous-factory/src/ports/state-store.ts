/**
 * ports/state-store.ts — Port interface for pipeline state persistence.
 *
 * Abstracts pipeline state read/write behind an async interface. The
 * production adapter (`JsonFileStateStore`) owns all file I/O; tests use
 * an in-memory stub.
 */

import type {
  PipelineState,
  FailResult,
  ResetResult,
  InitResult,
  InvocationRecord,
  AppendInvocationInput,
  SealInvocationInput,
} from "../types.js";

/**
 * Port for all pipeline state read/write operations.
 * Every method is async to accommodate both file I/O and in-memory stubs.
 */
export interface StateStore {
  /** Read the full pipeline state. Throws if state file does not exist. */
  getStatus(slug: string): Promise<PipelineState>;

  /** Read the full pipeline state, returning `null` if no state file exists. */
  readState(slug: string): Promise<PipelineState | null>;

  /** Get all items whose DAG dependencies are satisfied. */
  getNextAvailable(slug: string): Promise<Array<{
    key: string | null;
    label: string;
    agent: string | null;
    status: string;
  }>>;

  /** Mark an item as completed. */
  completeItem(slug: string, itemKey: string): Promise<PipelineState>;

  /** Record a failure for an item. */
  failItem(slug: string, itemKey: string, message: string, maxFailures?: number): Promise<FailResult>;

  /** Reset a node + all downstream dependents to pending. */
  resetNodes(slug: string, seedKey: string, reason: string, maxCycles?: number, logKey?: string): Promise<ResetResult>;

  /** Graceful degradation — skip downstream nodes for Draft PR. */
  salvageForDraft(slug: string, failedItemKey: string): Promise<PipelineState>;

  /** Set a doc note on a pipeline item. */
  setDocNote(slug: string, itemKey: string, note: string): Promise<PipelineState>;

  /** Append an implementation note. */
  setNote(slug: string, note: string): Promise<PipelineState>;

  /** Set the deployed URL. */
  setUrl(slug: string, url: string): Promise<PipelineState>;

  /**
   * Persist the kernel's in-memory DAG snapshot to disk. Overwrites only
   * the DAG-shaped fields (`items`, `errorLog`, `cycleCounters`,
   * `implementationNotes`, `deployedUrl`) from the snapshot — any fields
   * that only side-setters touch (e.g. `executionLog`, per-item `docNote`)
   * are preserved from the on-disk state so in-flight writes are not
   * clobbered.
   *
   * This is the bridge between the command-sourced kernel (which holds
   * authoritative state in memory) and the on-disk `_STATE.json` that
   * downstream tooling / retros / CLI `pipeline:status` reads.
   */
  persistDagSnapshot(slug: string, snapshot: PipelineState): Promise<PipelineState>;

  /** Initialize pipeline state from APM-compiled context. */
  initState(slug: string, workflowName: string, contextJsonPath?: string): Promise<InitResult>;

  /**
   * Write a human-readable halt-escalation artifact to
   * `in-progress/<slug>_HALT.md`. Best-effort; failures must not break the
   * halt itself (the kernel halt signal is authoritative — this is just
   * for operator visibility and resume pointers).
   */
  writeHaltArtifact(slug: string, content: string): Promise<void>;

  // ── Artifact Bus — invocation ledger (Phase 2) ────────────────────────────

  /**
   * Create a new `InvocationRecord` in `state.artifacts`, set the owning
   * item's `latestInvocationId` pointer, and tail `_invocations.jsonl`.
   *
   * Invoked by the kernel at dispatch time, once per handler execution.
   * The record is returned for inspection; its sealed / outputs fields are
   * populated later via `sealInvocation`.
   */
  appendInvocationRecord(slug: string, input: AppendInvocationInput): Promise<InvocationRecord>;

  /**
   * Stamp `startedAt` on a previously-staged unsealed invocation record.
   * Used by the dispatch hook when adopting a record that was created
   * upfront by `stage-invocation` (e.g. by the triage handler) instead
   * of being appended fresh at dispatch time.
   *
   * Throws if the invocationId is unknown or the record is already
   * started/sealed.
   */
  stampInvocationStart(slug: string, invocationId: string, startedAt: string): Promise<InvocationRecord>;

  /**
   * Finalize an existing invocation: set outcome, finishedAt, sealed flag,
   * and any produced outputs. After sealing, `ArtifactBus.write` calls
   * targeting the same `invocationId` will reject.
   *
   * Idempotent: sealing an already-sealed record is a no-op.
   */
  sealInvocation(slug: string, input: SealInvocationInput): Promise<InvocationRecord>;

  /** Read a single invocation record (returns `null` when absent). */
  getInvocationRecord(slug: string, invocationId: string): Promise<InvocationRecord | null>;

  /** Enumerate all invocation records for a node, ordered chronologically. */
  listInvocationRecords(slug: string, nodeKey: string): Promise<InvocationRecord[]>;
}
