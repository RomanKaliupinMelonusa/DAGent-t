/**
 * domain/progress-tracker.ts — Phase 4 pure helpers for loop-level hardening.
 *
 * Exposes two small pure functions used by the pipeline loop to enforce the
 * `max_idle_minutes` and `max_total_failures` policy fields:
 *
 *   • `snapshotProgress` reduces a list of item statuses to a stable
 *     "doneCount:failCount" key.
 *   • `evaluateHardening` decides — given the previous progress key, the
 *     current timestamp, and the policy — whether the loop should exit with
 *     `idle-timeout` or `failure-budget`.
 *
 * Pure — no I/O, no mutation. Consumed by `loop/pipeline-loop.ts`.
 */

/** Minimal item shape: only the status field is consulted. */
export interface ProgressTrackable {
  readonly status: "pending" | "done" | "failed" | "na" | "dormant";
}

/** Snapshot of pipeline progress used to detect idle periods. */
export interface ProgressSnapshot {
  readonly doneCount: number;
  readonly failCount: number;
  readonly key: string;
}

/** Produce a deterministic progress snapshot from the items. */
export function snapshotProgress(
  items: ReadonlyArray<ProgressTrackable>,
): ProgressSnapshot {
  let doneCount = 0;
  let failCount = 0;
  for (const item of items) {
    if (item.status === "done") doneCount++;
    else if (item.status === "failed") failCount++;
  }
  return { doneCount, failCount, key: `${doneCount}:${failCount}` };
}

/** Policy thresholds used by the hardening evaluator. */
export interface HardeningPolicy {
  readonly maxIdleMs?: number;
  readonly maxTotalFailures?: number;
}

/** Loop-visible state carried across iterations. */
export interface HardeningState {
  readonly prevKey: string | null;
  readonly lastProgressMs: number;
}

/** Result emitted by `evaluateHardening`. */
export type HardeningVerdict =
  | { readonly kind: "ok"; readonly state: HardeningState }
  | { readonly kind: "idle-timeout"; readonly idleMs: number }
  | { readonly kind: "failure-budget"; readonly failCount: number };

/**
 * Evaluate progress against the hardening policy.
 *
 * If the snapshot's `key` differs from `prev.prevKey`, `lastProgressMs` resets
 * to `nowMs` and the next iteration starts fresh. Otherwise, the caller has
 * been idle; if `nowMs - prev.lastProgressMs` exceeds `maxIdleMs`, the verdict
 * is `idle-timeout`. Independently, if `snapshot.failCount` meets or exceeds
 * `maxTotalFailures`, the verdict is `failure-budget`.
 */
export function evaluateHardening(
  snapshot: ProgressSnapshot,
  prev: HardeningState,
  nowMs: number,
  policy: HardeningPolicy,
): HardeningVerdict {
  const advanced = snapshot.key !== prev.prevKey;
  const lastProgressMs = advanced ? nowMs : prev.lastProgressMs;

  if (
    policy.maxTotalFailures !== undefined &&
    snapshot.failCount >= policy.maxTotalFailures
  ) {
    return { kind: "failure-budget", failCount: snapshot.failCount };
  }

  if (
    policy.maxIdleMs !== undefined &&
    nowMs - lastProgressMs > policy.maxIdleMs
  ) {
    return { kind: "idle-timeout", idleMs: nowMs - lastProgressMs };
  }

  return {
    kind: "ok",
    state: { prevKey: snapshot.key, lastProgressMs },
  };
}
