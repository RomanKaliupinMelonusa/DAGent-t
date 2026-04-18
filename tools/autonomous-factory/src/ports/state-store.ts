/**
 * ports/state-store.ts — Port interface for pipeline state persistence.
 *
 * Abstracts the file-based `pipeline-state.mjs` CLI behind an async interface.
 * The production adapter (`JsonFileStateStore`) imports the CLI module
 * directly; tests use an in-memory stub.
 */

import type { PipelineState, FailResult, ResetResult, InitResult, TriageRecord } from "../types.js";

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

  /** Set a structured handoff artifact on a pipeline item. */
  setHandoffArtifact(slug: string, itemKey: string, artifactJson: string): Promise<PipelineState>;

  /** Append an implementation note. */
  setNote(slug: string, note: string): Promise<PipelineState>;

  /** Set the deployed URL. */
  setUrl(slug: string, url: string): Promise<PipelineState>;

  /** Inject pre-built context into a node for its next attempt. */
  setPendingContext(slug: string, itemKey: string, context: string): Promise<PipelineState>;

  /** Persist a triage record for retrospective analysis. */
  setLastTriageRecord(slug: string, record: TriageRecord): Promise<PipelineState>;

  /** Initialize pipeline state from APM-compiled context. */
  initState(slug: string, workflowName: string, contextJsonPath?: string): Promise<InitResult>;
}
