/**
 * reporting/format.ts — Formatting helpers for durations, outcomes, and USD.
 */

import type { ItemSummary } from "../types.js";

/** Format milliseconds as human-readable duration */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  return remSecs > 0 ? `${mins}m ${remSecs}s` : `${mins}m`;
}

/** Emoji for outcome */
export function outcomeIcon(outcome: string): string {
  return outcome === "completed" ? "✅" : outcome === "failed" ? "❌" : "💥";
}

/** Check if a step was a barrier sync point (zero-execution DAG join) */
export function isBarrierStep(item: ItemSummary): boolean {
  return item.intents.some((i) => i.startsWith("barrier-sync"));
}

/** Icon for a step, with barrier override */
export function stepIcon(item: ItemSummary): string {
  if (isBarrierStep(item)) return "⊕";
  return outcomeIcon(item.outcome);
}

/** Format a number as a USD string with 4 decimal places */
export function formatUsd(amount: number): string {
  return `$${amount.toFixed(4)}`;
}
