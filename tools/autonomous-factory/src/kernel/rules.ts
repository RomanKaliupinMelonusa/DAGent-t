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
  detectStalledItems,
  type SchedulableItem,
  type ScheduleResult,
  type DependencyGraph,
  type TransitionState,
  type CompleteResult,
  type FailResult,
  type FailItemOptions,
  type ResetResult,
  type SalvageResult,
  type BatchOutcome,
  type BatchSignals,
  type CycleCheck,
  type RoutableWorkflow,
  type StallableItem,
  type StalledItem,
  type VolatilePattern,
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
  fail(state: TransitionState, itemKey: string, message: string, options?: number | FailItemOptions): FailResult;

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

  /** Detect pending items that have exceeded their wait-timeout budget. */
  detectStalls(
    items: readonly StallableItem[],
    nowMs: number,
    pendingSinceMsByKey: ReadonlyMap<string, number>,
    readyWithinHoursByKey: ReadonlyMap<string, number>,
  ): StalledItem[];
}

// ---------------------------------------------------------------------------
// Default implementation — delegates to domain/ functions
// ---------------------------------------------------------------------------

/** Construction options for DefaultKernelRules. */
export interface DefaultKernelRulesOptions {
  /** Workflow-level extra volatile patterns (applied to all items). */
  workflowPatterns?: ReadonlyArray<VolatilePattern>;
  /** Per-node extra patterns, keyed by item key (applied additively on top
   *  of workflow patterns when the failing/resetting item is this node). */
  perNodePatterns?: ReadonlyMap<string, ReadonlyArray<VolatilePattern>>;
}

export class DefaultKernelRules implements KernelRules {
  private readonly workflowPatterns: ReadonlyArray<VolatilePattern>;
  private readonly perNodePatterns: ReadonlyMap<string, ReadonlyArray<VolatilePattern>>;

  constructor(opts: DefaultKernelRulesOptions = {}) {
    this.workflowPatterns = opts.workflowPatterns ?? [];
    this.perNodePatterns = opts.perNodePatterns ?? new Map();
  }

  /** Build a signature function for a specific item key — composes
   *  workflow-level + per-node patterns on top of the built-in baseline. */
  private signatureFor(itemKey?: string): (msg: string) => string {
    const nodeExtras = itemKey ? this.perNodePatterns.get(itemKey) : undefined;
    if (this.workflowPatterns.length === 0 && (!nodeExtras || nodeExtras.length === 0)) {
      return computeErrorSignature;
    }
    const composed: VolatilePattern[] = [
      ...this.workflowPatterns,
      ...(nodeExtras ?? []),
    ];
    return (msg: string) => computeErrorSignature(msg, composed);
  }

  schedule(items: readonly SchedulableItem[], deps: DependencyGraph): ScheduleResult {
    return schedule(items, deps);
  }

  complete(state: TransitionState, itemKey: string): CompleteResult {
    return completeItem(state, itemKey);
  }

  fail(state: TransitionState, itemKey: string, message: string, options?: number | FailItemOptions): FailResult {
    return failItem(state, itemKey, message, options ?? 10, this.signatureFor(itemKey));
  }

  reset(state: TransitionState, seedKey: string, reason: string, maxCycles?: number, logKey?: string): ResetResult {
    return resetNodes(state, seedKey, reason, maxCycles, logKey, this.signatureFor(seedKey));
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
    // Workflow-level patterns only (no item context at call site).
    return this.workflowPatterns.length === 0
      ? computeErrorSignature(msg)
      : computeErrorSignature(msg, this.workflowPatterns);
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

  detectStalls(
    items: readonly StallableItem[],
    nowMs: number,
    pendingSinceMsByKey: ReadonlyMap<string, number>,
    readyWithinHoursByKey: ReadonlyMap<string, number>,
  ): StalledItem[] {
    return detectStalledItems(items, nowMs, pendingSinceMsByKey, readyWithinHoursByKey);
  }
}
