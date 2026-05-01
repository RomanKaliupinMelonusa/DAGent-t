/**
 * src/workflow/invocation-id.ts — Deterministic invocation-id builder.
 *
 * Workflow scope can't draw randomness, but the tuple
 * `(workflowId, nodeKey, attempt)` is unique per dispatch and stable
 * across replays. SHA-256 of that tuple, sliced to 26 hex chars and
 * uppercased, is a strict subset of Crockford's alphabet so the output
 * passes `isInvocationId` (`activities/support/invocation-id.ts`).
 *
 * Extracted from `pipeline.workflow.ts` so both `batch-dispatcher.ts`
 * and `triage-driver.ts` can import without pulling the workflow body's
 * activity-input projections transitively.
 */

import { sha256 } from "js-sha256";

export function makeInvocationId(
  workflowId: string,
  nodeKey: string,
  attempt: number,
): string {
  const digest = sha256(`${workflowId}|${nodeKey}|${attempt}`);
  return `inv_${digest.toUpperCase().slice(0, 26)}`;
}
