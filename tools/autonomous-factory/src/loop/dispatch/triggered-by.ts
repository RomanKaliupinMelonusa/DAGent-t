/**
 * dispatch/triggered-by.ts — Compute the `triggeredBy` causality envelope
 * for a fresh invocation from the current pipeline state.
 *
 * Pure read of `PipelineState.artifacts` — no I/O, no kernel mutation.
 * Used by `recordInvocationDispatch` to stamp each new `InvocationRecord`
 * with the upstream invocation that caused it to dispatch.
 */

import type { InvocationRecord, InvocationTrigger, PipelineState } from "../../types.js";

export interface TriggeredByContext {
  readonly itemKey: string;
  readonly trigger: InvocationTrigger;
  /** Workflow node `depends_on` list — used for the `initial` flavour to
   *  pick the upstream invocation whose seal unblocked this item. */
  readonly dependsOn?: readonly string[];
}

/**
 * Resolve the upstream invocation that "caused" this dispatch. Returns
 * `undefined` when no causal predecessor can be found (e.g. the very
 * first dispatch of a root node has no predecessor).
 *
 *   - `initial`             → latest completed invocation among `depends_on`
 *   - `retry`               → latest non-completed sealed invocation of THIS node
 *   - `redevelopment-cycle` → latest non-completed sealed invocation across
 *                             the workflow (typically the publish-pr / live-ui
 *                             failure that triggered the reset)
 *   - `triage-reroute`      → handled separately by `triggeredByFromStaged`
 *                             (the parent pointer lives on the staged record)
 */
export function computeTriggeredBy(
  ctx: TriggeredByContext,
  state: PipelineState,
): InvocationRecord["triggeredBy"] | undefined {
  const all = state.artifacts ? Object.values(state.artifacts) : [];
  if (all.length === 0) return undefined;

  if (ctx.trigger === "retry") {
    return latestMatching(all, (r) =>
      r.nodeKey === ctx.itemKey && r.sealed === true && r.outcome !== "completed"
    , ctx.trigger);
  }

  if (ctx.trigger === "redevelopment-cycle") {
    return latestMatching(all, (r) =>
      r.sealed === true && r.outcome !== "completed"
    , ctx.trigger);
  }

  // "initial" — among declared upstream nodes, pick the latest completed one.
  if (ctx.trigger === "initial") {
    const deps = ctx.dependsOn;
    if (!deps || deps.length === 0) return undefined;
    return latestMatching(all, (r) =>
      r.sealed === true && r.outcome === "completed" && deps.includes(r.nodeKey)
    , ctx.trigger);
  }

  // triage-reroute is resolved at staging time (see triggeredByFromStaged).
  return undefined;
}

/**
 * Resolve `triggeredBy` for a triage-reroute staged record. The parent
 * invocation pointer lives on the staged record itself (set by the
 * `stage-invocation` command); we derive the parent's `nodeKey` by
 * looking the parent up in `state.artifacts`.
 */
export function triggeredByFromStaged(
  state: PipelineState,
  parentInvocationId: string | undefined,
): InvocationRecord["triggeredBy"] | undefined {
  if (!parentInvocationId) return undefined;
  const parent = state.artifacts?.[parentInvocationId];
  if (!parent) return undefined;
  return {
    nodeKey: parent.nodeKey,
    invocationId: parent.invocationId,
    reason: "triage-reroute",
  };
}

function latestMatching(
  records: ReadonlyArray<InvocationRecord>,
  predicate: (r: InvocationRecord) => boolean,
  reason: InvocationTrigger,
): InvocationRecord["triggeredBy"] | undefined {
  let best: InvocationRecord | undefined;
  for (const r of records) {
    if (!predicate(r)) continue;
    if (!best || r.invocationId > best.invocationId) best = r;
  }
  if (!best) return undefined;
  return { nodeKey: best.nodeKey, invocationId: best.invocationId, reason };
}
