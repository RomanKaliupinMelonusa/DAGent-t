/**
 * src/workflow/signals.ts — Workflow signal definitions.
 *
 * Signals carry approval and lifecycle events into the workflow from the
 * `dagent-admin` Temporal client and from
 * [.github/workflows/elevated-infra-deploy.yml](../../../.github/workflows/elevated-infra-deploy.yml).
 *
 * Wire model (Session 6 will dispatch these from the CLI / GitHub Actions):
 *
 *     wf.signalWithStart('pipelineWorkflow', { signal: 'approveGate',
 *                                              signalArgs: ['await-infra-approval'] })
 *
 *     // Or, against an in-flight workflow:
 *     handle.signal(approveGateSignal, 'await-infra-approval')
 *
 * D-S3-3: there is no `outcome: "approval-pending"` on the activity
 * boundary. The workflow body owns the wait by calling `awaitApproval`
 * (see [approval-pattern.ts](./approval-pattern.ts)). The legacy
 * approval handler returns immediately on the activity side; the
 * workflow body interprets the structural-only gate.
 */

import { defineSignal } from "@temporalio/workflow";

/**
 * Signal an approval gate as completed. Args: `[gateKey]`.
 * `gateKey` matches the workflow node key (e.g. `await-infra-approval`).
 */
export const approveGateSignal = defineSignal<[gateKey: string]>("approveGate");

/**
 * Signal an approval gate as rejected. Args: `[gateKey, reason]`.
 * Rejection terminates the workflow's `awaitApproval` call with a
 * thrown `ApprovalRejectedError` so the workflow body can route to
 * triage / halt.
 */
export const rejectGateSignal = defineSignal<[gateKey: string, reason: string]>(
  "rejectGate",
);

/**
 * Hold the pipeline before the next batch is dispatched. Idempotent.
 * In-flight activities continue to completion; the loop blocks at the
 * top of the next iteration until `resumePipelineSignal` arrives.
 *
 * Operational parity with legacy ChatOps `dagent:hold`. Args: none.
 */
export const holdPipelineSignal = defineSignal<[]>("holdPipeline");

/**
 * Resume a held pipeline. No-op when not held. Args: none.
 */
export const resumePipelineSignal = defineSignal<[]>("resumePipeline");

/**
 * Cancel the pipeline. Sets a cancel flag the workflow body checks at
 * the top of each iteration. The workflow returns
 * `{ status: "cancelled", reason }` and Temporal cancels in-flight
 * activities cooperatively (each activity has a deterministic cancel
 * prefix per Phase 3). Args: `[reason]`.
 *
 * NOTE: callers can also use `handle.cancel()` (Temporal-native
 * cancellation). This signal is the structured variant that lets the
 * workflow record a human-readable reason in its final state.
 */
export const cancelPipelineSignal = defineSignal<[reason: string]>(
  "cancelPipeline",
);
