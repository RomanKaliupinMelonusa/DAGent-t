/**
 * state.ts — Typed wrapper around pipeline-state.mjs's programmatic API.
 *
 * Uses dynamic import() to load the .mjs module and re-exports all
 * programmatic functions with TypeScript type annotations.
 *
 * This file is the sole bridge between the TypeScript orchestrator and the
 * JavaScript pipeline state management. All state access goes through here.
 */

import type {
  PipelineState,
  PipelineItem,
  NextAction,
  FailResult,
  ResetResult,
  InitResult,
  TriageRecord,
} from "./types.js";

// Lazy-loaded module reference (cached after first import)
let _mod: PipelineStateMod | null = null;

interface PipelineStateMod {
  initState: (slug: string, workflowType: string, contextJsonPath?: string) => InitResult;
  completeItem: (slug: string, itemKey: string) => PipelineState;
  failItem: (slug: string, itemKey: string, message: string) => FailResult;
  resetScripts: (slug: string, phase: string, maxCycles?: number) => ResetResult;
  resetPhases: (slug: string, phasesCsv: string, reason: string, maxCycles?: number) => ResetResult;
  resetNodes: (slug: string, seedKey: string, reason: string, maxCycles?: number, logKey?: string) => ResetResult;
  /** @deprecated Use `resetNodes`. */
  resetForReroute: (slug: string, seedKey: string, reason: string, maxCycles?: number, logKey?: string) => ResetResult;
  salvageForDraft: (slug: string, failedItemKey: string) => PipelineState;
  resumeAfterElevated: (slug: string, maxCycles?: number) => ResetResult;
  recoverElevated: (slug: string, errorMessage: string, maxFailCount?: number, maxDevCycles?: number) => ResetResult;
  getStatus: (slug: string) => PipelineState;
  getNext: (slug: string) => NextAction;
  getNextAvailable: (slug: string) => NextAction[];
  setNote: (slug: string, note: string) => PipelineState;
  setDocNote: (slug: string, itemKey: string, note: string) => PipelineState;
  setUrl: (slug: string, url: string) => PipelineState;
  setHandoffArtifact: (slug: string, itemKey: string, artifactJson: string) => PipelineState;
  setLastTriageRecord: (slug: string, record: TriageRecord) => PipelineState;
  readState: (slug: string) => PipelineState;
  getDownstream: (state: PipelineState, seedKeys: string[]) => string[];
  getUpstream: (state: PipelineState, seedKeys: string[]) => string[];
  formatPhaseHeading: (phase: string, phaseLabels?: Record<string, string>) => string;
}

async function getMod(): Promise<PipelineStateMod> {
  if (!_mod) {
    _mod = (await import("../pipeline-state.mjs")) as unknown as PipelineStateMod;
  }
  return _mod;
}

// ---------------------------------------------------------------------------
// Proxy-based auto-delegator — eliminates 19 identical wrapper functions.
// Each property access returns an async function that lazily loads the .mjs
// module and forwards to the corresponding function.
// ---------------------------------------------------------------------------

type AsyncPipelineStateMod = {
  [K in keyof PipelineStateMod]: (...args: Parameters<PipelineStateMod[K]>) => Promise<ReturnType<PipelineStateMod[K]>>;
};

const stateProxy = new Proxy({} as AsyncPipelineStateMod, {
  get(_target, prop: string) {
    return async (...args: unknown[]) => {
      const mod = await getMod();
      return (mod as unknown as Record<string, (...a: unknown[]) => unknown>)[prop](...args);
    };
  },
});

// Named re-exports for backward compatibility — every consumer that imports
// `import { completeItem } from "./state.js"` continues to work.
export const initState = stateProxy.initState;
export const completeItem = stateProxy.completeItem;
export const failItem = stateProxy.failItem;
export const resetScripts = stateProxy.resetScripts;
export const resetPhases = stateProxy.resetPhases;
export const resetNodes = stateProxy.resetNodes;
/** @deprecated Use `resetNodes`. */
export const resetForReroute = stateProxy.resetForReroute;
export const salvageForDraft = stateProxy.salvageForDraft;
export const resumeAfterElevated = stateProxy.resumeAfterElevated;
export const recoverElevated = stateProxy.recoverElevated;
export const getStatus = stateProxy.getStatus;
export const getNext = stateProxy.getNext;
export const getNextAvailable = stateProxy.getNextAvailable;
export const setNote = stateProxy.setNote;
export const setDocNote = stateProxy.setDocNote;
export const setUrl = stateProxy.setUrl;
export const setHandoffArtifact = stateProxy.setHandoffArtifact;
export const setLastTriageRecord = stateProxy.setLastTriageRecord;
export const readState = stateProxy.readState;
export const getDownstream = stateProxy.getDownstream;
export const getUpstream = stateProxy.getUpstream;
export const formatPhaseHeading = stateProxy.formatPhaseHeading;
