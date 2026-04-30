/**
 * src/temporal/activities/support/heartbeat.ts — Heartbeat helper.
 *
 * Long-running activities must call `Context.current().heartbeat()` more
 * frequently than their declared `heartbeatTimeout` so Temporal can
 * detect a stalled or crashed worker. `withHeartbeat` runs the supplied
 * body and emits a periodic heartbeat in the background until the body
 * settles (resolved or rejected).
 *
 * The heartbeat callback also wires `Context.current().cancellationSignal`
 * into an `AbortController` so the body can cooperatively shut down when
 * the workflow cancels the activity. The body opts in by reading
 * `signal` from the second parameter; activities that ignore it fall
 * back to Temporal's `startToCloseTimeout` for forced termination.
 *
 * Determinism: this module is activity-only (full Node access). It is
 * NOT importable from `src/temporal/workflow/**` — the ESLint scope rule
 * does not need to ban it because it lives outside `workflow/`.
 */

import { Context } from "@temporalio/activity";

export interface HeartbeatOptions {
  /** Interval in ms between heartbeats. Defaults to 30s. */
  readonly intervalMs?: number;
  /**
   * Optional payload builder invoked on each tick. The returned value is
   * passed to `Context.current().heartbeat(details)` so the Web UI shows
   * live progress.
   */
  readonly details?: () => unknown;
}

export interface HeartbeatBodyArgs {
  /** Aborted when Temporal cancels the activity. */
  readonly signal: AbortSignal;
  /** Manually emit a heartbeat (with optional payload). */
  readonly emit: (payload?: unknown) => void;
}

const DEFAULT_INTERVAL_MS = 30_000;

/**
 * Run `body` while emitting periodic Temporal heartbeats. Cancellation
 * from Temporal propagates as `AbortSignal` so cooperative bodies can
 * shut down cleanly.
 */
export async function withHeartbeat<T>(
  body: (args: HeartbeatBodyArgs) => Promise<T>,
  opts: HeartbeatOptions = {},
): Promise<T> {
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
  const ctx = Context.current();
  const controller = new AbortController();
  const detailsFn = opts.details;

  const onCancel = (): void => controller.abort();
  // The Temporal `cancellationSignal` is a standard AbortSignal — listen
  // for `abort` (it's an EventTarget) and translate into our controller.
  ctx.cancellationSignal.addEventListener("abort", onCancel, { once: true });

  let stop = false;
  const tick = (): void => {
    if (stop) return;
    try {
      ctx.heartbeat(detailsFn ? detailsFn() : undefined);
    } catch {
      // heartbeat() throws if the activity has been cancelled and the
      // worker hasn't yet noticed — abort propagates via the signal,
      // so swallow here.
    }
  };

  const timer: NodeJS.Timeout = setInterval(tick, intervalMs);
  // Don't keep the worker process alive for an idle timer.
  if (typeof timer.unref === "function") timer.unref();

  // Emit one heartbeat immediately so the activity registers as "live"
  // before the first tick.
  tick();

  try {
    return await body({
      signal: controller.signal,
      emit: (payload?: unknown) => {
        try {
          ctx.heartbeat(payload);
        } catch {
          // see comment in tick().
        }
      },
    });
  } finally {
    stop = true;
    clearInterval(timer);
    ctx.cancellationSignal.removeEventListener("abort", onCancel);
  }
}
