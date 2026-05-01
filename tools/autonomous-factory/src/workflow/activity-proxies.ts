/**
 * src/workflow/activity-proxies.ts — Per-handler activity proxies.
 *
 * Centralises the timeout / retry policy for each activity kind. Values
 * are pinned by the canonical Session 4 plan and mirror the constants
 * baked into [single-activity.workflow.ts](./single-activity.workflow.ts):
 *
 *   local-exec     :  15min  / 60s heartbeat / maxAttempts 1
 *   github-ci-poll :   2h    / 90s heartbeat / maxAttempts 3
 *   triage         :   5min  / 60s heartbeat / maxAttempts 2
 *   copilot-agent  :   4h    / 90s heartbeat / maxAttempts 1 (CRITICAL: never auto-retry)
 *   archive        :  30min  /     —          / maxAttempts 1
 *
 * Why distinct proxy bindings rather than one over-broad one: Temporal
 * activity options are bound at proxy construction time, not per-call.
 * Distinct durations + retry policies require distinct proxies.
 */

import { proxyActivities } from "@temporalio/workflow";
import type * as activities from "../activities/index.js";

export const { localExecActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "15 minutes",
  heartbeatTimeout: "60 seconds",
  retry: { maximumAttempts: 1 },
});

export const { triageActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
  heartbeatTimeout: "60 seconds",
  retry: { maximumAttempts: 2 },
});

export const { copilotAgentActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "4 hours",
  heartbeatTimeout: "90 seconds",
  retry: { maximumAttempts: 1 },
});
