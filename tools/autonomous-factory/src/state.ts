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
} from "./types.js";

// Lazy-loaded module reference (cached after first import)
let _mod: PipelineStateMod | null = null;

interface PipelineStateMod {
  initState: (slug: string, workflowType: string, contextJsonPath?: string) => InitResult;
  completeItem: (slug: string, itemKey: string) => PipelineState;
  failItem: (slug: string, itemKey: string, message: string) => FailResult;
  resetScripts: (slug: string, phase: string) => ResetResult;
  resetPhases: (slug: string, phasesCsv: string, reason: string, maxCycles?: number) => ResetResult;
  resetForDev: (slug: string, itemKeys: string[], reason: string, maxCycles?: number) => ResetResult;
  resetForRedeploy: (slug: string, itemKeys: string[], reason: string, maxCycles?: number) => ResetResult;
  salvageForDraft: (slug: string, failedItemKey: string) => PipelineState;
  resumeAfterElevated: (slug: string) => ResetResult;
  recoverElevated: (slug: string, errorMessage: string) => ResetResult;
  getStatus: (slug: string) => PipelineState;
  getNext: (slug: string) => NextAction;
  getNextAvailable: (slug: string) => NextAction[];
  setNote: (slug: string, note: string) => PipelineState;
  setDocNote: (slug: string, itemKey: string, note: string) => PipelineState;
  setUrl: (slug: string, url: string) => PipelineState;
  readState: (slug: string) => PipelineState;
  getDownstream: (state: PipelineState, seedKeys: string[]) => string[];
  getUpstream: (state: PipelineState, seedKeys: string[]) => string[];
}

async function getMod(): Promise<PipelineStateMod> {
  if (!_mod) {
    _mod = (await import("../pipeline-state.mjs")) as unknown as PipelineStateMod;
  }
  return _mod;
}

export async function initState(slug: string, workflowType: string, contextJsonPath?: string): Promise<InitResult> {
  const mod = await getMod();
  return mod.initState(slug, workflowType, contextJsonPath);
}

export async function completeItem(slug: string, itemKey: string): Promise<PipelineState> {
  const mod = await getMod();
  return mod.completeItem(slug, itemKey);
}

export async function failItem(slug: string, itemKey: string, message: string): Promise<FailResult> {
  const mod = await getMod();
  return mod.failItem(slug, itemKey, message);
}

export async function resetScripts(slug: string, phase: string): Promise<ResetResult> {
  const mod = await getMod();
  return mod.resetScripts(slug, phase);
}

export async function resetPhases(slug: string, phasesCsv: string, reason: string, maxCycles?: number): Promise<ResetResult> {
  const mod = await getMod();
  return mod.resetPhases(slug, phasesCsv, reason, maxCycles);
}

export async function resetForDev(slug: string, itemKeys: string[], reason: string, maxCycles?: number): Promise<ResetResult> {
  const mod = await getMod();
  return mod.resetForDev(slug, itemKeys, reason, maxCycles);
}

export async function resetForRedeploy(slug: string, itemKeys: string[], reason: string, maxCycles?: number): Promise<ResetResult> {
  const mod = await getMod();
  return mod.resetForRedeploy(slug, itemKeys, reason, maxCycles);
}

export async function salvageForDraft(slug: string, failedItemKey: string): Promise<PipelineState> {
  const mod = await getMod();
  return mod.salvageForDraft(slug, failedItemKey);
}

export async function resumeAfterElevated(slug: string): Promise<ResetResult> {
  const mod = await getMod();
  return mod.resumeAfterElevated(slug);
}

export async function recoverElevated(slug: string, errorMessage: string): Promise<ResetResult> {
  const mod = await getMod();
  return mod.recoverElevated(slug, errorMessage);
}

export async function getStatus(slug: string): Promise<PipelineState> {
  const mod = await getMod();
  return mod.getStatus(slug);
}

export async function getNext(slug: string): Promise<NextAction> {
  const mod = await getMod();
  return mod.getNext(slug);
}

export async function getNextAvailable(slug: string): Promise<NextAction[]> {
  const mod = await getMod();
  return mod.getNextAvailable(slug);
}

export async function setNote(slug: string, note: string): Promise<PipelineState> {
  const mod = await getMod();
  return mod.setNote(slug, note);
}

export async function setDocNote(slug: string, itemKey: string, note: string): Promise<PipelineState> {
  const mod = await getMod();
  return mod.setDocNote(slug, itemKey, note);
}

export async function setUrl(slug: string, url: string): Promise<PipelineState> {
  const mod = await getMod();
  return mod.setUrl(slug, url);
}

export async function readState(slug: string): Promise<PipelineState> {
  const mod = await getMod();
  return mod.readState(slug);
}

export async function getDownstream(state: PipelineState, seedKeys: string[]): Promise<string[]> {
  const mod = await getMod();
  return mod.getDownstream(state, seedKeys);
}

export async function getUpstream(state: PipelineState, seedKeys: string[]): Promise<string[]> {
  const mod = await getMod();
  return mod.getUpstream(state, seedKeys);
}
