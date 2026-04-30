/**
 * src/temporal/workflow/signals.ts — Workflow signal definitions.
 *
 * Signals are the Temporal-native replacement for the legacy
 * `signal: "approval-pending"` flag returned by
 * [src/handlers/approval.ts](../../handlers/approval.ts) and the
 * out-of-band `npm run pipeline:complete <slug> <gate>` ChatOps verb
 * documented in
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
