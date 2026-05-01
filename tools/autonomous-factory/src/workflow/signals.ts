/**
 * src/workflow/signals.ts — Workflow signal definitions.
 *
 * Pipeline-spine signals: only `cancelPipeline` survives. Approval gates,
 * hold/resume, and the legacy reset-scripts/recover-elevated lifecycle
 * were removed in the storefront-spine refactor. Operators interact via
 * `dagent-admin status|cancel|nuke`.
 */

import { defineSignal } from "@temporalio/workflow";

/**
 * Cancel the pipeline. Sets a cancel flag the workflow body checks at
 * the top of each iteration. The workflow returns
 * `{ status: "cancelled", reason }` and Temporal cancels in-flight
 * activities cooperatively (each activity has a deterministic cancel
 * prefix per Phase 3). Args: `[reason]`.
 */
export const cancelPipelineSignal = defineSignal<[reason: string]>(
  "cancelPipeline",
);
