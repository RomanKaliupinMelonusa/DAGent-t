/**
 * kernel/rules.ts — KernelRules interface + default implementation.
 *
 * Thin delegation layer between the kernel and the pure domain functions.
 * The kernel calls rules.*(); rules delegate to domain/. This indirection
 * enables tests to inject custom rules without touching domain code.
 */

import {
  schedule,
  completeItem,
  failItem,
  resetNodes,
  salvageForDraft,
  interpretBatch,
  resolveFailureTarget,
  resolveFailureRoutes,
  checkCycleBudget,
  computeErrorSignature,
  getDownstream,
  getUpstream,
  cascadeBarriers,
  topologicalSort,
  type SchedulableItem,
  type ScheduleResult,
  type DependencyGraph,
  type TransitionState,
  type CompleteResult,
  type FailResult,
  type ResetResult,
  type SalvageResult,
  type BatchOutcome,
  type BatchSignals,
  type CycleCheck,
  type RoutableWorkflow,
} from "../domain/index.js";

// ---------------------------------------------------------------------------
// KernelRules interface
// ---------------------------------------------------------------------------

export interface KernelRules {
  /** Determine which items are ready for dispatch. */
  schedule(items: readonly SchedulableItem[], deps: DependencyGraph): ScheduleResult;

  /** Mark an item as completed. */
  complete(state: TransitionState, itemKey: string): CompleteResult;

  /** Record a failure. */
  fail(state: TransitionState, itemKey: string, message: string, maxFailures?: number): FailResult;

  /** Reset a node + downstream cascade. */
  reset(state: TransitionState, seedKey: string, reason: string, maxCycles?: number, logKey?: string): ResetResult;

  /** Graceful degradation for draft PR. */
  salvage(state: TransitionState, failedItemKey: string): SalvageResult;

  /** Interpret a batch of session outcomes. */
  interpretBatch(results: readonly PromiseSettledResult<BatchOutcome>[]): BatchSignals;

  /** Resolve failure routing target. */
  resolveFailureTarget(workflow: RoutableWorkflow, itemKey: string): string | undefined;

  /** Resolve failure routes map. */
  resolveFailureRoutes(workflow: RoutableWorkflow, itemKey: string): Record<string, string | null>;

  /** Check cycle budget. */
  checkCycleBudget(errorLog: readonly { itemKey: string }[], logKey: string, maxCycles: number): CycleCheck;

  /** Compute error signature. */
  computeErrorSignature(msg: string): string;

  /** Get downstream dependents. */
  getDownstream(deps: DependencyGraph, seedKeys: readonly string[]): string[];

  /** Get upstream dependencies. */
  getUpstream(deps: DependencyGraph, seedKeys: readonly string[]): string[];

  /** Topological sort. */
  topologicalSort(deps: DependencyGraph): string[];
}

// ---------------------------------------------------------------------------
// Default implementation — delegates to domain/ functions
// ---------------------------------------------------------------------------

export class DefaultKernelRules implements KernelRules {
  schedule(items: readonly SchedulableItem[], deps: DependencyGraph): ScheduleResult {
    return schedule(items, deps);
  }

  complete(state: TransitionState, itemKey: string): CompleteResult {
    return completeItem(state, itemKey);
  }

  fail(state: TransitionState, itemKey: string, message: string, maxFailures?: number): FailResult {
    return failItem(state, itemKey, message, maxFailures);
  }

  reset(state: TransitionState, seedKey: string, reason: string, maxCycles?: number, logKey?: string): ResetResult {
    return resetNodes(state, seedKey, reason, maxCycles, logKey);
  }

  salvage(state: TransitionState, failedItemKey: string): SalvageResult {
    return salvageForDraft(state, failedItemKey);
  }

  interpretBatch(results: readonly PromiseSettledResult<BatchOutcome>[]): BatchSignals {
    return interpretBatch(results);
  }

  resolveFailureTarget(workflow: RoutableWorkflow, itemKey: string): string | undefined {
    return resolveFailureTarget(workflow, itemKey);
  }

  resolveFailureRoutes(workflow: RoutableWorkflow, itemKey: string): Record<string, string | null> {
    return resolveFailureRoutes(workflow, itemKey);
  }

  checkCycleBudget(errorLog: readonly { itemKey: string }[], logKey: string, maxCycles: number): CycleCheck {
    return checkCycleBudget(errorLog, logKey, maxCycles);
  }

  computeErrorSignature(msg: string): string {
    return computeErrorSignature(msg);
  }

  getDownstream(deps: DependencyGraph, seedKeys: readonly string[]): string[] {
    return getDownstream(deps, seedKeys);
  }

  getUpstream(deps: DependencyGraph, seedKeys: readonly string[]): string[] {
    return getUpstream(deps, seedKeys);
  }

  topologicalSort(deps: DependencyGraph): string[] {
    return topologicalSort(deps);
  }
}
