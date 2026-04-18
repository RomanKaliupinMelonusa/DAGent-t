/**
 * adapters/json-file-state-store.ts — StateStore adapter over pipeline-state.mjs.
 *
 * Wraps the existing state.ts proxy with the StateStore port interface.
 * All methods are async to satisfy the port contract.
 */

import type { StateStore } from "../ports/state-store.js";
import type { PipelineState, FailResult, ResetResult, InitResult, TriageRecord } from "../types.js";

/**
 * Lazy loader for the state module.
 * The state.ts module uses dynamic import() internally for pipeline-state.mjs,
 * so we import it statically here (it's already a thin TS proxy).
 */
async function getStateMod() {
  return import("../state.js");
}

export class JsonFileStateStore implements StateStore {
  async getStatus(slug: string): Promise<PipelineState> {
    const mod = await getStateMod();
    return mod.getStatus(slug);
  }

  async getNextAvailable(slug: string): Promise<Array<{
    key: string | null;
    label: string;
    agent: string | null;
    status: string;
  }>> {
    const mod = await getStateMod();
    return mod.getNextAvailable(slug);
  }

  async completeItem(slug: string, itemKey: string): Promise<PipelineState> {
    const mod = await getStateMod();
    return mod.completeItem(slug, itemKey);
  }

  async failItem(slug: string, itemKey: string, message: string, maxFailures?: number): Promise<FailResult> {
    const mod = await getStateMod();
    return mod.failItem(slug, itemKey, message, maxFailures);
  }

  async resetNodes(slug: string, seedKey: string, reason: string, maxCycles?: number, logKey?: string): Promise<ResetResult> {
    const mod = await getStateMod();
    return mod.resetNodes(slug, seedKey, reason, maxCycles, logKey);
  }

  async salvageForDraft(slug: string, failedItemKey: string): Promise<PipelineState> {
    const mod = await getStateMod();
    return mod.salvageForDraft(slug, failedItemKey);
  }

  async setDocNote(slug: string, itemKey: string, note: string): Promise<PipelineState> {
    const mod = await getStateMod();
    return mod.setDocNote(slug, itemKey, note);
  }

  async setHandoffArtifact(slug: string, itemKey: string, artifactJson: string): Promise<PipelineState> {
    const mod = await getStateMod();
    return mod.setHandoffArtifact(slug, itemKey, artifactJson);
  }

  async setNote(slug: string, note: string): Promise<PipelineState> {
    const mod = await getStateMod();
    return mod.setNote(slug, note);
  }

  async setUrl(slug: string, url: string): Promise<PipelineState> {
    const mod = await getStateMod();
    return mod.setUrl(slug, url);
  }

  async setPendingContext(slug: string, itemKey: string, context: string): Promise<PipelineState> {
    const mod = await getStateMod();
    return mod.setPendingContext(slug, itemKey, context);
  }

  async setLastTriageRecord(slug: string, record: TriageRecord): Promise<PipelineState> {
    const mod = await getStateMod();
    return mod.setLastTriageRecord(slug, record);
  }

  async initState(slug: string, workflowName: string, contextJsonPath?: string): Promise<InitResult> {
    const mod = await getStateMod();
    return mod.initState(slug, workflowName, contextJsonPath);
  }
}
