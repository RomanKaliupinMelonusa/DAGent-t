/**
 * src/temporal/activities/github-ci-poll.activity.ts — Phase 2 of the
 * Session 3 migration. Wraps the legacy `handlers/github-ci-poll.ts`
 * with a Temporal activity boundary.
 *
 * Why an activity (not workflow code):
 * 1. The poll shells out to `poll-ci.sh` via `child_process.execSync`
 *    — non-deterministic Node I/O, forbidden in workflow scope.
 * 2. CI runs are long (default 20-minute exec timeout per attempt;
 *    `POLL_MAX_RETRIES=60` inside the script multiplies that). The
 *    activity emits Temporal heartbeats every 30s so the server can
 *    detect a worker crash mid-poll and reschedule.
 * 3. Cancellation is cooperative: when the workflow cancels the
 *    activity, `withHeartbeat` flips an `AbortSignal`. We surface
 *    cancellation through the `NodeActivityResult.outcome === "failed"`
 *    path with a known errorMessage so the workflow body can route to
 *    triage rather than treating it as a Temporal-level failure.
 *
 * Retry strategy (responsibility split):
 * - **Inside the activity**: `runPollWithRetries` already retries
 *   transient `gh`/network errors up to `apmContext.config.transient_retry.max`
 *   (default 5). This is the legacy contract and stays put.
 * - **Outside the activity** (workflow side, Session 6): a Temporal
 *   `RetryPolicy` with `maximumAttempts: 3` covers worker-process
 *   crashes only. Don't bump it — CI-pending is NOT a Temporal failure;
 *   it's a normal `outcome: "failed"` that the workflow loops on.
 *
 * Middleware chain reuse: routes through `runActivityChain` for
 * byte-identical parity with the legacy dispatcher (lifecycle hooks,
 * auto-skip, etc. typically no-op for ci-poll nodes but we don't want
 * to special-case the chain — same code path as `local-exec.activity`).
 */

import githubCiPollHandler from "../../handlers/github-ci-poll.js";
import { withHeartbeat } from "./support/heartbeat.js";
import { buildNodeContext } from "./support/build-context.js";
import { buildCancellationRace } from "./support/cancellation.js";
import { runActivityChain } from "./middleware-chain.js";
import type { NodeActivityInput, NodeActivityResult } from "./types.js";
import type { NodeResult } from "../../handlers/types.js";

/** Marker errorMessage emitted when the activity is cancelled mid-poll.
 *  Stable across releases — the workflow body matches on this prefix to
 *  distinguish cancellation from CI failure. */
export const CI_POLL_CANCELLED_PREFIX = "CI poll cancelled by workflow";

function toActivityResult(result: NodeResult): NodeActivityResult {
  // Same projection contract as local-exec — `signal: "approval-pending"`
  // is impossible for ci-poll (the handler never produces it), but we
  // strip defensively to preserve the load-bearing D-S3-3 invariant
  // that no activity result carries the approval signal.
  const projected: NodeActivityResult = {
    outcome: result.outcome,
    summary: result.summary,
    errorMessage: result.errorMessage,
    handlerOutput: result.handlerOutput,
  };
  return projected;
}

/**
 * Heartbeat-aware activity that polls GitHub Actions CI for completion.
 * Input/output are JSON-serialisable — the workflow owns lineage and
 * state; this activity is a pure observer.
 */
export async function githubCiPollActivity(
  input: NodeActivityInput,
): Promise<NodeActivityResult> {
  return withHeartbeat<NodeActivityResult>(
    async ({ emit, signal }) => {
      const ctx = await buildNodeContext(input, {
        onHeartbeat: () => emit({ stage: "polling", itemKey: input.itemKey }),
      });

      // Cooperative cancellation. The legacy poll loop is a
      // synchronous `execSync` chain; we can't interrupt it
      // mid-call, but we can short-circuit between iterations by
      // racing against the abort signal. Workflow-initiated
      // cancellation manifests as `outcome: "failed"` rather than
      // a thrown CancelledFailure so the workflow can route through
      // triage uniformly. The shared helper closes the pre-abort gap
      // (DOM AbortSignal semantics) by checking BOTH the heartbeat
      // controller signal AND `Context.current().cancellationSignal`.
      const cancelled = buildCancellationRace({
        prefix: CI_POLL_CANCELLED_PREFIX,
        heartbeatSignal: signal,
      });

      const polled = (async (): Promise<NodeActivityResult> => {
        const result = await runActivityChain(githubCiPollHandler, ctx);
        return toActivityResult(result as NodeResult);
      })();

      return Promise.race([polled, cancelled]);
    },
    // CI workflows commonly take 5–15 minutes; 30s heartbeats are
    // conservative without over-flooding the Temporal server.
    { intervalMs: 30_000 },
  );
}
