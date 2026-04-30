/**
 * domain/cycle-counter.ts — Cycle budget evaluation.
 *
 * Pure functions for checking whether retry/reset cycle budgets are
 * exhausted. Used by the kernel before executing reset operations.
 */

export interface ErrorLogEntry {
  readonly itemKey: string;
  readonly errorSignature?: string | null;
}

export interface CycleCheck {
  /** Number of cycles already consumed. */
  readonly cycleCount: number;
  /** True if the budget is exhausted. */
  readonly halted: boolean;
}

/**
 * Count cycles for a given log key and check against the budget.
 */
export function checkCycleBudget(
  errorLog: readonly ErrorLogEntry[],
  logKey: string,
  maxCycles: number,
): CycleCheck {
  const cycleCount = errorLog.filter((e) => e.itemKey === logKey).length;
  return { cycleCount, halted: cycleCount >= maxCycles };
}

/**
 * Count occurrences of a specific error signature in the error log.
 * Used for death-spiral detection.
 */
export function countErrorSignature(
  errorLog: readonly ErrorLogEntry[],
  signature: string,
): number {
  return errorLog.filter((e) => e.errorSignature === signature).length;
}
