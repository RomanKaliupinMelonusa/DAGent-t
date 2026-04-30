/**
 * src/temporal/activities/support/cancellation.ts — Cooperative cancellation
 * helper shared by every activity that wraps a legacy handler.
 *
 * Why a shared helper
 * -------------------
 * Phases 1–5 each independently rolled their own cancellation race
 * against the heartbeat-controller signal. Phase 5 discovered a pre-
 * abort latent bug — `withHeartbeat`'s controller signal does NOT
 * auto-fire on already-aborted Temporal cancellation (DOM AbortSignal
 * semantics: `addEventListener("abort", ...)` on an already-aborted
 * signal does NOT auto-fire). Each activity must therefore check BOTH
 * the heartbeat controller signal AND `Context.current().cancellationSignal`
 * directly, with pre-checks on both `.aborted` flags.
 *
 * Centralising the pattern here ensures every activity gets the fix
 * (instead of carrying drifting copies). The contract is: pass a
 * stable prefix string and the heartbeat-controller signal, get back
 * a `Promise<NodeActivityResult>` that resolves with `outcome: "failed"`
 * the moment cancellation is observed.
 *
 * Why not throw `CancelledFailure`
 * --------------------------------
 * The workflow body in Session 4 wants UNIFORM `outcome: "failed"`
 * results so it can route every cancellation through the standard
 * triage path. Throwing `CancelledFailure` would force the workflow
 * to maintain a parallel `try/catch` branch for each activity. The
 * stable prefix lets the workflow `errorMessage.startsWith(...)` to
 * recognise external cancellation when it matters (e.g. to short-
 * circuit retry loops) without a separate exception type.
 */

import { Context } from "@temporalio/activity";
import type { NodeActivityResult } from "../types.js";

export interface CancellationRaceOptions {
  /** Stable prefix for the resulting `errorMessage`. Each activity
   *  defines its own (e.g. `CI_POLL_CANCELLED_PREFIX`). */
  readonly prefix: string;
  /** Heartbeat-controller signal (from `withHeartbeat`'s body args). */
  readonly heartbeatSignal: AbortSignal;
}

/**
 * Build the cancellation-race promise. Resolves with a uniform
 * `outcome: "failed"` result when EITHER the heartbeat-controller
 * signal aborts OR the underlying Temporal `cancellationSignal`
 * aborts. Pre-aborted state on either signal resolves immediately —
 * this closes the latent gap where `MockActivityEnvironment.cancel()`
 * called BEFORE `env.run()` would not propagate (DOM
 * `addEventListener("abort", ...)` on an already-aborted signal
 * does not auto-fire).
 */
export function buildCancellationRace(
  opts: CancellationRaceOptions,
): Promise<NodeActivityResult> {
  return new Promise<NodeActivityResult>((resolve) => {
    const tctx = Context.current();
    const onAbort = (): void => {
      resolve({
        outcome: "failed",
        errorMessage: `${opts.prefix} (reason: ${
          tctx.cancellationSignal.reason ?? opts.heartbeatSignal.reason ?? "cancel"
        })`,
        summary: {},
      });
    };
    if (opts.heartbeatSignal.aborted || tctx.cancellationSignal.aborted) {
      onAbort();
      return;
    }
    opts.heartbeatSignal.addEventListener("abort", onAbort, { once: true });
    tctx.cancellationSignal.addEventListener("abort", onAbort, { once: true });
  });
}
