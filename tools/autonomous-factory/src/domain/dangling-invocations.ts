/**
 * domain/dangling-invocations.ts — Pure scanner for unsealed, abandoned
 * invocation records.
 *
 * When the orchestrator process is killed mid-session (Ctrl+C, OOM,
 * devcontainer restart), in-flight invocations are left with `sealed !== true`
 * and no `finishedAt`. On the next `agent:run` the kernel sees the slot
 * occupied and the loop never advances. This scanner identifies those
 * records so the kernel admin layer can synthesize a `failed` outcome and
 * free the slot for triage rerouting.
 *
 * No I/O, no mutation. The caller supplies `now` as a number so tests can
 * use a fake clock.
 */

import type { InvocationRecord, PipelineState, SealInvocationInput } from "../types.js";

/**
 * Return the subset of `records` that are dangling at time `now`:
 *   - `sealed !== true` (still considered in-flight), AND
 *   - `finishedAt` is absent (the seal-time stamp was never written), AND
 *   - either `startedAt` is absent (never adopted) OR
 *     `Date.parse(startedAt) <= now - staleMs`.
 *
 * Records with unparseable `startedAt` are treated as stale (defensive).
 * Pure; no side effects.
 */
export function findDanglingInvocations(
  records: ReadonlyArray<InvocationRecord>,
  now: number,
  staleMs: number,
): Array<{ record: InvocationRecord; ageMs: number }> {
  const cutoff = now - staleMs;
  const result: Array<{ record: InvocationRecord; ageMs: number }> = [];
  for (const rec of records) {
    if (rec.sealed === true) continue;
    if (rec.finishedAt) continue;
    if (!rec.startedAt) {
      // Never adopted — age is unknown; treat as stale.
      result.push({ record: rec, ageMs: staleMs });
      continue;
    }
    const startedAtMs = Date.parse(rec.startedAt);
    if (Number.isNaN(startedAtMs)) {
      result.push({ record: rec, ageMs: staleMs });
      continue;
    }
    if (startedAtMs <= cutoff) {
      result.push({ record: rec, ageMs: now - startedAtMs });
    }
  }
  return result;
}

/**
 * Pure scanner — find items carrying a `bypassedFor` marker whose route
 * target is in a settled state that will never re-fire the auto-revalidate
 * seal hook. Surfaces orphan markers left behind by orchestrator crashes
 * between `bypass-node` and the routed-to seal.
 *
 * Three cases are reported with distinct severities:
 *  - `route-done`: route target is already `done` — the seal hook fired
 *    but the `reset-after-fix` command never landed (e.g. crash between
 *    seal and command processing). Caller should re-emit the reset.
 *  - `route-failed`: route target is `failed` — its own retry / triage
 *    loop owns recovery. The bypass marker is genuinely orphaned only
 *    if all retries exhaust.
 *  - `route-pending`: route target is still pending — quiet case, the
 *    next dispatch will fire the seal hook normally. Filtered out.
 */
export interface DanglingBypass {
  readonly itemKey: string;
  readonly routeTarget: string;
  readonly cycleIndex: number;
  readonly routeStatus: "done" | "failed" | "na" | "dormant" | "pending";
  readonly severity: "route-done" | "route-failed" | "route-na";
}

export function findDanglingBypasses(state: PipelineState): DanglingBypass[] {
  const statusByKey = new Map(state.items.map((i) => [i.key, i.status]));
  const out: DanglingBypass[] = [];
  for (const item of state.items) {
    if (!item.bypassedFor) continue;
    const routeStatus = statusByKey.get(item.bypassedFor.routeTarget);
    if (!routeStatus) continue;
    if (routeStatus === "done") {
      out.push({
        itemKey: item.key,
        routeTarget: item.bypassedFor.routeTarget,
        cycleIndex: item.bypassedFor.cycleIndex,
        routeStatus,
        severity: "route-done",
      });
    } else if (routeStatus === "failed") {
      out.push({
        itemKey: item.key,
        routeTarget: item.bypassedFor.routeTarget,
        cycleIndex: item.bypassedFor.cycleIndex,
        routeStatus,
        severity: "route-failed",
      });
    } else if (routeStatus === "na" || routeStatus === "dormant") {
      out.push({
        itemKey: item.key,
        routeTarget: item.bypassedFor.routeTarget,
        cycleIndex: item.bypassedFor.cycleIndex,
        routeStatus,
        severity: "route-na",
      });
    }
    // pending route — quiet case; next dispatch fires seal hook normally.
  }
  return out;
}

/**
 * Pure state-mutation half of `sealInvocationRecord`. Mirrors the adapter's
 * logic but performs no I/O — does not write the JSONL tail. Used by the
 * kernel admin reducer (`recover-dangling`) so the kernel layer stays free
 * of adapter imports. The adapter's `sealInvocationRecord` delegates here
 * and then appends to `_invocations.jsonl`.
 *
 * Idempotent: re-sealing an already-sealed record returns the existing
 * record unchanged. Throws if the invocationId is unknown.
 */
export function sealInvocationRecordPure(
  state: PipelineState,
  input: SealInvocationInput,
): InvocationRecord {
  state.artifacts ??= {};
  const existing = state.artifacts[input.invocationId];
  if (!existing) {
    throw new Error(
      `sealInvocationRecord: unknown invocationId '${input.invocationId}'`,
    );
  }
  if (existing.sealed) {
    return existing;
  }
  const mergedOutputs = [
    ...(existing.outputs ?? []),
    ...(input.outputs ?? []),
  ];
  const sealed: InvocationRecord = {
    ...existing,
    outcome: input.outcome,
    finishedAt: input.finishedAt ?? new Date().toISOString(),
    outputs: mergedOutputs,
    sealed: true,
    ...(input.routedTo ? { routedTo: input.routedTo } : {}),
    ...(input.nextFailureHint ? { nextFailureHint: input.nextFailureHint } : {}),
  };
  state.artifacts[input.invocationId] = sealed;
  return sealed;
}
