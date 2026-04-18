/**
 * domain/stall-detection.ts — Pure detection of stalled-upstream nodes.
 *
 * A pending node is "stalled-upstream" when it has remained pending longer
 * than its configured `ready_within_hours` budget. The typical cause is an
 * upstream dep that hangs indefinitely (or a downstream node in a diamond
 * convergence where one branch never resolves).
 *
 * This module is pure — no I/O, no clock access. The caller supplies both
 * `nowMs` and the per-key `pendingSinceMs` map. Adapters decide how to
 * derive `pendingSinceMs` (e.g. from pipeline start time, from the latest
 * reset-log entry, or from a future `pendingSince` state field).
 *
 * Stall failures route through the standard `on_failure.triage` path, so
 * per-node triage can decide whether to retry, skip, or salvage.
 */

/** Minimal item shape needed for stall detection. */
export interface StallableItem {
  readonly key: string;
  readonly status: "pending" | "done" | "failed" | "na" | "dormant";
}

/** Describes a node that has exceeded its wait-timeout budget. */
export interface StalledItem {
  readonly key: string;
  readonly elapsedMs: number;
  readonly thresholdMs: number;
}

/**
 * Detect all pending items whose elapsed wait exceeds their
 * `ready_within_hours` threshold.
 *
 * Nodes without a configured threshold are skipped (opt-in).
 * Nodes without a known `pendingSinceMs` are skipped (insufficient data).
 * Only items in `pending` status are considered — `failed` items use the
 * normal failure-retry path, and terminal states never stall.
 */
export function detectStalledItems(
  items: readonly StallableItem[],
  nowMs: number,
  pendingSinceMsByKey: ReadonlyMap<string, number>,
  readyWithinHoursByKey: ReadonlyMap<string, number>,
): StalledItem[] {
  const stalled: StalledItem[] = [];

  for (const item of items) {
    if (item.status !== "pending") continue;

    const hours = readyWithinHoursByKey.get(item.key);
    if (hours === undefined || hours <= 0) continue;

    const pendingSince = pendingSinceMsByKey.get(item.key);
    if (pendingSince === undefined) continue;

    const thresholdMs = hours * 60 * 60 * 1000;
    const elapsedMs = Math.max(0, nowMs - pendingSince);
    if (elapsedMs >= thresholdMs) {
      stalled.push({ key: item.key, elapsedMs, thresholdMs });
    }
  }

  return stalled;
}

/**
 * Build a standard error message for a stalled-upstream failure.
 * Triage handlers can pattern-match the `stalled-upstream:` prefix if they
 * wish to apply specialized routing.
 */
export function formatStallError(stalled: StalledItem): string {
  const elapsedHours = (stalled.elapsedMs / (60 * 60 * 1000)).toFixed(2);
  const thresholdHours = (stalled.thresholdMs / (60 * 60 * 1000)).toFixed(2);
  return `stalled-upstream: node "${stalled.key}" remained pending for ${elapsedHours}h (threshold ${thresholdHours}h). An upstream dependency failed to resolve in time.`;
}
