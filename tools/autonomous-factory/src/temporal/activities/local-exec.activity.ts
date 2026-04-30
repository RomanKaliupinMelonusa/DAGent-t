/**
 * src/temporal/activities/local-exec.activity.ts — Phase 1 (Session 3).
 *
 * Temporal-boundary wrapper around the legacy `local-exec` handler
 * ([src/handlers/local-exec.ts](../../handlers/local-exec.ts)). The
 * activity is a thin shim:
 *
 *   1. Reconstruct `NodeContext` from the JSON-serializable input
 *      ([support/build-context.ts](./support/build-context.ts)).
 *   2. Run the legacy handler — middleware composition is intentionally
 *      *not* applied here (Phase 0 scope). Lifecycle hooks, auto-skip,
 *      handler-output ingestion, and inputs materialization are wired
 *      back in once `src/temporal/activities/middlewares/` lands in
 *      Phase 0.6.
 *   3. Project the legacy `NodeResult` onto the wire-typed
 *      `NodeActivityResult`. The `signal: "approval-pending"` value is
 *      stripped (Decision D-S3-3) — local-exec never emits it, so the
 *      assertion is also a contract guard.
 *
 * Activity options (declared by the workflow at `proxyActivities` time
 * in Session 4):
 *     startToCloseTimeout: 20m   (covers default 15m + hook overhead)
 *     heartbeatTimeout:    60s
 *     RetryPolicy:         { maximumAttempts: 1 }
 *
 * Per Decision D-S3-5, scripts are deterministic from the workflow's
 * point of view — auto-retry stays at 1 and the workflow's redev cycle
 * handles user-visible retry logic.
 */

import localExecHandler from "../../handlers/local-exec.js";
import { withHeartbeat } from "./support/heartbeat.js";
import { buildNodeContext } from "./support/build-context.js";
import { buildCancellationRace } from "./support/cancellation.js";
import { runActivityChain } from "./middleware-chain.js";
import type { NodeActivityInput, NodeActivityResult } from "./types.js";
import type { NodeResult } from "../../handlers/types.js";

/**
 * Stable prefix on `errorMessage` when the activity surfaces external
 * cancellation as `outcome: "failed"`. The workflow body matches on
 * this prefix to short-circuit retry logic. The legacy local-exec
 * shell call is synchronous (`execSync`); the race only short-
 * circuits AT START — i.e. it prevents launching a fresh script when
 * the activity was already cancelled before `env.run()`. Once the
 * shell starts, we cannot interrupt it without OS-level `kill`,
 * which the legacy handler does not implement.
 */
export const LOCAL_EXEC_CANCELLED_PREFIX = "local-exec activity cancelled";

/**
 * Project a legacy `NodeResult` onto the wire-typed activity result.
 * Strips the deprecated `signal: "approval-pending"` so the activity
 * boundary cannot leak it (Decision D-S3-3).
 */
export function toActivityResult(result: NodeResult): NodeActivityResult {
  const projected: NodeActivityResult = {
    outcome: result.outcome,
    summary: result.summary ?? {},
    ...(result.errorMessage !== undefined ? { errorMessage: result.errorMessage } : {}),
    ...(result.signals !== undefined ? { signals: result.signals } : {}),
    ...(result.handlerOutput !== undefined ? { handlerOutput: result.handlerOutput } : {}),
    ...(result.producedArtifacts !== undefined && result.producedArtifacts.length > 0
      ? { producedArtifacts: result.producedArtifacts }
      : {}),
    ...(result.diagnosticTrace !== undefined ? { diagnosticTrace: result.diagnosticTrace } : {}),
  };

  if (result.signal && result.signal !== "approval-pending") {
    return { ...projected, signal: result.signal };
  }
  return projected;
}

/**
 * Phase 1 activity. Runs the legacy `local-exec` handler under a
 * Temporal heartbeat envelope.
 */
export async function localExecActivity(
  input: NodeActivityInput,
): Promise<NodeActivityResult> {
  return withHeartbeat(
    async ({ emit, signal }) => {
      const ctx = await buildNodeContext(input, {
        onHeartbeat: () => emit({ stage: "running", itemKey: input.itemKey }),
      });
      // Phase 0.6 — run through the legacy middleware chain (auto-skip,
      // fixture-validation, acceptance-integrity, handler-output-ingestion,
      // lifecycle-hooks, materialize-inputs, result-processor). Direct
      // reuse rather than copy-port: activities are full-Node code and
      // can import the engine middlewares unchanged. See
      // [middleware-chain.ts](./middleware-chain.ts) for the order
      // contract.
      const cancelled = buildCancellationRace({
        prefix: LOCAL_EXEC_CANCELLED_PREFIX,
        heartbeatSignal: signal,
      });
      const handled = (async (): Promise<NodeActivityResult> => {
        const result = await runActivityChain(localExecHandler, ctx);
        return toActivityResult(result as NodeResult);
      })();
      return Promise.race([handled, cancelled]);
    },
    {
      intervalMs: 30_000,
      details: () => ({ activity: "local-exec", itemKey: input.itemKey }),
    },
  );
}
