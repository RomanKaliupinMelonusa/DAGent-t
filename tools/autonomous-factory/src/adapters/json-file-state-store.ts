/**
 * adapters/json-file-state-store.ts — StateStore adapter over `pipeline-state.mjs`.
 *
 * Imports the CLI module directly (adapters are the only layer allowed to
 * do I/O). All methods are async to satisfy the port contract, even though
 * the underlying implementation is synchronous file I/O.
 */

import type { StateStore } from "../ports/state-store.js";
import type { PipelineState, FailResult, ResetResult, InitResult, TriageRecord } from "../types.js";

// ---------------------------------------------------------------------------
// Cached dynamic import of the JS state module.
// Using dynamic import keeps the adapter decoupled from `.mjs` types at
// compile time (the .d.mts file provides the surface contract).
// ---------------------------------------------------------------------------

interface PipelineStateMod {
  getStatus: (slug: string) => PipelineState;
  readStateOrThrow: (slug: string) => PipelineState;
  getNextAvailable: (slug: string) => Array<{
    key: string | null;
    label: string;
    agent: string | null;
    status: string;
  }>;
  completeItem: (slug: string, itemKey: string) => PipelineState;
  failItem: (slug: string, itemKey: string, message: string, maxFailures?: number) => FailResult;
  resetNodes: (slug: string, seedKey: string, reason: string, maxCycles?: number, logKey?: string) => ResetResult;
  salvageForDraft: (slug: string, failedItemKey: string) => PipelineState;
  setDocNote: (slug: string, itemKey: string, note: string) => PipelineState;
  setHandoffArtifact: (slug: string, itemKey: string, artifactJson: string) => PipelineState;
  setNote: (slug: string, note: string) => PipelineState;
  setUrl: (slug: string, url: string) => PipelineState;
  setPendingContext: (slug: string, itemKey: string, context: string) => PipelineState;
  setLastTriageRecord: (slug: string, record: TriageRecord) => PipelineState;
  initState: (slug: string, workflowName: string, contextJsonPath?: string) => InitResult;
}

let _mod: PipelineStateMod | null = null;
async function getMod(): Promise<PipelineStateMod> {
  if (!_mod) {
    _mod = (await import("../../pipeline-state.mjs")) as unknown as PipelineStateMod;
  }
  return _mod;
}

export class JsonFileStateStore implements StateStore {
  async getStatus(slug: string): Promise<PipelineState> {
    return (await getMod()).getStatus(slug);
  }

  async readState(slug: string): Promise<PipelineState | null> {
    try {
      return (await getMod()).readStateOrThrow(slug);
    } catch (err) {
      // Missing state file is a legitimate null — callers distinguish
      // "first run" from fatal errors this way.
      const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
      if (msg.includes("not found") || msg.includes("enoent")) return null;
      throw err;
    }
  }

  async getNextAvailable(slug: string): Promise<Array<{
    key: string | null;
    label: string;
    agent: string | null;
    status: string;
  }>> {
    return (await getMod()).getNextAvailable(slug);
  }

  async completeItem(slug: string, itemKey: string): Promise<PipelineState> {
    return (await getMod()).completeItem(slug, itemKey);
  }

  async failItem(slug: string, itemKey: string, message: string, maxFailures?: number): Promise<FailResult> {
    return (await getMod()).failItem(slug, itemKey, message, maxFailures);
  }

  async resetNodes(slug: string, seedKey: string, reason: string, maxCycles?: number, logKey?: string): Promise<ResetResult> {
    return (await getMod()).resetNodes(slug, seedKey, reason, maxCycles, logKey);
  }

  async salvageForDraft(slug: string, failedItemKey: string): Promise<PipelineState> {
    return (await getMod()).salvageForDraft(slug, failedItemKey);
  }

  async setDocNote(slug: string, itemKey: string, note: string): Promise<PipelineState> {
    return (await getMod()).setDocNote(slug, itemKey, note);
  }

  async setHandoffArtifact(slug: string, itemKey: string, artifactJson: string): Promise<PipelineState> {
    return (await getMod()).setHandoffArtifact(slug, itemKey, artifactJson);
  }

  async setNote(slug: string, note: string): Promise<PipelineState> {
    return (await getMod()).setNote(slug, note);
  }

  async setUrl(slug: string, url: string): Promise<PipelineState> {
    return (await getMod()).setUrl(slug, url);
  }

  async setPendingContext(slug: string, itemKey: string, context: string): Promise<PipelineState> {
    return (await getMod()).setPendingContext(slug, itemKey, context);
  }

  async setLastTriageRecord(slug: string, record: TriageRecord): Promise<PipelineState> {
    return (await getMod()).setLastTriageRecord(slug, record);
  }

  async initState(slug: string, workflowName: string, contextJsonPath?: string): Promise<InitResult> {
    return (await getMod()).initState(slug, workflowName, contextJsonPath);
  }
}

