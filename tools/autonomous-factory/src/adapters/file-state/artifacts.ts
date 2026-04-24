/**
 * adapters/file-state/artifacts.ts — Invocation-ledger maintenance for the
 * JSON-file state store.
 *
 * Owns:
 *  - `appendInvocationRecord` — creates a fresh `InvocationRecord`, stores
 *    it in `state.artifacts[id]`, sets `item.latestInvocationId`, and tails
 *    `in-progress/<slug>/_invocations.jsonl`.
 *  - `sealInvocationRecord` — finalizes a record with outcome + outputs
 *    and marks it `sealed` so subsequent artifact writes will reject.
 *  - `ensureArtifactsIndex` — backfills a missing `artifacts` field on
 *    legacy state files.
 *
 * Pure functions over state + a small fs-sync side for the JSONL tail.
 * The adapter holds the file lock around every call.
 */

import { appendFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { IN_PROGRESS } from "./io.js";
import type {
  PipelineState,
  InvocationRecord,
  AppendInvocationInput,
  SealInvocationInput,
} from "../../types.js";
import { isInvocationId } from "../../kernel/invocation-id.js";

// ─── Index helpers ──────────────────────────────────────────────────────────

/** Ensure `state.artifacts` exists. Mutates in place; safe to call repeatedly. */
export function ensureArtifactsIndex(
  state: PipelineState,
): asserts state is PipelineState & { artifacts: Record<string, InvocationRecord> } {
  if (!state.artifacts) state.artifacts = {};
}

/** Count existing invocations for a node in `state.artifacts`. */
export function countInvocationsForNode(state: PipelineState, nodeKey: string): number {
  if (!state.artifacts) return 0;
  let n = 0;
  for (const rec of Object.values(state.artifacts)) {
    if (rec.nodeKey === nodeKey) n++;
  }
  return n;
}

// ─── Append ─────────────────────────────────────────────────────────────────

/**
 * Create a new `InvocationRecord` and attach it to state. Also updates the
 * owning item's `latestInvocationId` pointer. Returns the persisted record.
 *
 * Does NOT itself call `writeState` — the adapter is responsible for
 * persisting the mutated state, matching the pattern used by
 * `persistExecutionRecord`.
 */
export function appendInvocationRecord(
  state: PipelineState,
  slug: string,
  input: AppendInvocationInput,
): InvocationRecord {
  if (!isInvocationId(input.invocationId)) {
    throw new Error(`appendInvocationRecord: invalid invocationId '${input.invocationId}'`);
  }
  if (!input.nodeKey) {
    throw new Error("appendInvocationRecord: nodeKey is required");
  }
  ensureArtifactsIndex(state);
  if (state.artifacts[input.invocationId]) {
    throw new Error(
      `appendInvocationRecord: invocationId '${input.invocationId}' already exists in ledger`,
    );
  }

  const cycleIndex = input.cycleIndex ?? countInvocationsForNode(state, input.nodeKey) + 1;
  const rec: InvocationRecord = {
    invocationId: input.invocationId,
    nodeKey: input.nodeKey,
    cycleIndex,
    trigger: input.trigger,
    parentInvocationId: input.parentInvocationId,
    producedBy: input.producedBy,
    // `startedAt` may legitimately be undefined for staged records (e.g.
    // a triage-staged reroute slot). The dispatch hook stamps it via
    // `stampInvocationStart` when the handler actually begins.
    ...(input.startedAt ? { startedAt: input.startedAt } : {}),
    inputs: input.inputs ?? [],
    outputs: [],
  };
  state.artifacts[input.invocationId] = rec;

  // Point the owning item at the new invocation. Non-fatal if the item
  // cannot be located — some node types (e.g. ad-hoc triage activations)
  // may write records without a stable item key. The ledger is still
  // valid; only the convenience pointer is missing.
  const item = state.items.find((i) => i.key === input.nodeKey);
  if (item) {
    item.latestInvocationId = input.invocationId;
  }

  // Tail the derived JSONL stream. Regenerable from `state.artifacts`, but
  // kept on disk so operators can `tail -f` during long runs.
  appendInvocationJsonl(slug, rec);
  return rec;
}

// ─── Stamp staged record ────────────────────────────────────────────────────

/**
 * Stamp `startedAt` on an existing staged invocation record. Used by the
 * dispatch hook when adopting a record that was created upfront via
 * `stage-invocation` (typically by the triage handler) rather than being
 * appended fresh at dispatch time.
 *
 * Throws if the invocationId is unknown, the record has already been
 * stamped (`startedAt` set), or the record has been sealed.
 */
export function stampInvocationStart(
  state: PipelineState,
  invocationId: string,
  startedAt: string,
): InvocationRecord {
  ensureArtifactsIndex(state);
  const existing = state.artifacts[invocationId];
  if (!existing) {
    throw new Error(`stampInvocationStart: unknown invocationId '${invocationId}'`);
  }
  if (existing.sealed) {
    throw new Error(`stampInvocationStart: invocationId '${invocationId}' is already sealed`);
  }
  if (existing.startedAt) {
    // Idempotent: re-stamping a started record is a no-op so dispatch
    // can be retried safely.
    return existing;
  }
  const stamped: InvocationRecord = { ...existing, startedAt };
  state.artifacts[invocationId] = stamped;
  return stamped;
}

// ─── Seal ───────────────────────────────────────────────────────────────────

/**
 * Finalize an existing invocation: set outcome, finishedAt, seal flag, and
 * merge any produced outputs. Subsequent `ArtifactBus.write` targeting this
 * invocation will reject once the adapter consults `sealed`.
 */
export function sealInvocationRecord(
  state: PipelineState,
  slug: string,
  input: SealInvocationInput,
): InvocationRecord {
  ensureArtifactsIndex(state);
  const existing = state.artifacts[input.invocationId];
  if (!existing) {
    throw new Error(
      `sealInvocationRecord: unknown invocationId '${input.invocationId}'`,
    );
  }
  if (existing.sealed) {
    // Idempotent — sealing a sealed record is a no-op. Return the existing
    // record unchanged so callers can rely on the outcome field.
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
  };
  state.artifacts[input.invocationId] = sealed;
  appendInvocationJsonl(slug, sealed);
  return sealed;
}

// ─── JSONL tail ─────────────────────────────────────────────────────────────

/**
 * Append a single record to `in-progress/<slug>/_invocations.jsonl`. Best
 * effort: failures are swallowed so a ledger write can never block the
 * authoritative `_STATE.json` write. The tail is regenerable from the index.
 */
function appendInvocationJsonl(slug: string, rec: InvocationRecord): void {
  try {
    const dir = `${IN_PROGRESS}/${slug}`;
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const path = `${dir}/_invocations.jsonl`;
    if (!existsSync(dirname(path))) {
      mkdirSync(dirname(path), { recursive: true });
    }
    appendFileSync(path, JSON.stringify(rec) + "\n", "utf-8");
  } catch {
    // non-fatal — the authoritative record lives in state.artifacts
  }
}
