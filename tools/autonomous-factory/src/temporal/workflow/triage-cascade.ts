/**
 * src/temporal/workflow/triage-cascade.ts — Workflow-scope triage resolution.
 *
 * Workflow analogue of [loop/triage-activation.ts](../../loop/triage-activation.ts).
 * The legacy implementation walks kernel `Command[]` produced by a batch and
 * synthesises a `TriageActivation` for every newly-failed item. In the
 * Temporal port we call this function once per failing activity result,
 * after `DagState.applyFail`, to decide whether triage should fire and
 * which fields the rerouted dispatch should carry.
 *
 * Workflow-scope contract:
 *   - Pure (no I/O, no clock, no random).
 *   - No node:* / kernel / loop / handler / adapter / port / activity-value
 *     imports — only `domain/` (pure routing functions) and workflow-local
 *     types.
 *   - `errorSignature` is preferred from the activity's
 *     `NodeActivityResult.errorSignature` (computed in activity scope where
 *     `node:crypto` is available — see `triage/playwright-report.ts`).
 *     Workflow scope cannot recompute it; if missing we surface a stable
 *     non-crypto fingerprint derived from the raw message.
 *   - `structuredFailure` is forwarded from `handlerOutput.structuredFailure`
 *     when the failing activity attached one (e.g. parsed Playwright JSON).
 *
 * The returned `TriageDispatch` is everything the workflow body needs to
 * build a follow-up `NodeActivityInput` and dispatch the triage node via
 * the same `triageActivity` proxy used for any other activity. The actual
 * routing decision (which downstream node to retry) is taken inside the
 * triage activity and surfaced back as `NodeActivityResult.commands`.
 */

import {
  resolveFailureTarget,
  resolveFailureRoutes,
  type RoutableWorkflow,
} from "../../domain/failure-routing.js";
import type { ItemSummary } from "../../types.js";
import type { NodeActivityResult } from "../activities/types.js";

/**
 * Everything the workflow body needs to dispatch a triage activity for a
 * single failing item. Mirrors the wire-relevant subset of the legacy
 * `TriageActivation` (`app-types.ts`); workflow code never touches the
 * legacy field directly so we keep a workflow-local shape.
 */
export interface TriageDispatch {
  readonly triageNodeKey: string;
  readonly failingKey: string;
  readonly failingInvocationId?: string;
  readonly rawError: string;
  readonly errorSignature: string;
  readonly failureRoutes: Readonly<Record<string, string | null>>;
  readonly failingNodeSummary: ItemSummary;
  readonly structuredFailure?: unknown;
}

export interface TriageCascadeInputs {
  /** Key of the item that just transitioned to `failed`. */
  readonly failingKey: string;
  /** Most recent activity result for the failing item. */
  readonly result: NodeActivityResult;
  /** Workflow definition (compiled subset — same shape used by the loop). */
  readonly workflow: RoutableWorkflow;
  /** Invocation id of the failing dispatch, if known. */
  readonly failingInvocationId?: string;
}

/**
 * Resolve a single triage dispatch for a newly-failed item, or `null`
 * when the workflow node has no triage configuration. Idempotent &
 * deterministic — safe to call from workflow scope.
 */
export function resolveTriageDispatch(
  inputs: TriageCascadeInputs,
): TriageDispatch | null {
  const { failingKey, result, workflow, failingInvocationId } = inputs;

  const triageNodeKey = resolveFailureTarget(workflow, failingKey);
  if (!triageNodeKey) return null;

  const failureRoutes = resolveFailureRoutes(workflow, failingKey);
  const rawError = result.errorMessage || "Unknown failure";
  const errorSignature =
    result.errorSignature && result.errorSignature.length > 0
      ? result.errorSignature
      : fallbackSignature(rawError);

  const structuredFailure = extractStructuredFailure(result.handlerOutput);
  const failingNodeSummary: ItemSummary = {
    key: failingKey,
    ...(result.summary ?? {}),
  } as ItemSummary;

  return {
    triageNodeKey,
    failingKey,
    ...(failingInvocationId ? { failingInvocationId } : {}),
    rawError,
    errorSignature,
    failureRoutes,
    failingNodeSummary,
    ...(structuredFailure !== undefined ? { structuredFailure } : {}),
  };
}

/**
 * Stable non-crypto fingerprint of a raw error string. Only used when the
 * activity failed to attach an `errorSignature` of its own (defensive
 * fallback — well-behaved activities always emit one). Java-style
 * polynomial hash → 8 hex chars; deterministic across replays without
 * touching `node:crypto`.
 */
function fallbackSignature(message: string): string {
  // Trim transient line:col / pid noise so retries with cosmetically
  // different errors still collide on the same signature when the
  // underlying defect is unchanged.
  const normalised = message
    .replace(/\d+:\d+/g, "0:0")
    .replace(/0x[0-9a-fA-F]+/g, "0x0")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1024);

  let hash = 0;
  for (let i = 0; i < normalised.length; i++) {
    hash = (Math.imul(hash, 31) + normalised.charCodeAt(i)) | 0;
  }
  // Mask to unsigned 32-bit and pad to 8 hex chars for stable length.
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function extractStructuredFailure(
  handlerOutput: NodeActivityResult["handlerOutput"],
): unknown {
  if (!handlerOutput || typeof handlerOutput !== "object") return undefined;
  if (!("structuredFailure" in handlerOutput)) return undefined;
  return (handlerOutput as { structuredFailure?: unknown }).structuredFailure;
}
