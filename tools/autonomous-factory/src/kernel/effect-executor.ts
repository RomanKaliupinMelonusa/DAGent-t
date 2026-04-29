/**
 * kernel/effect-executor.ts — Executes side effects produced by the kernel.
 *
 * The kernel is pure — it returns Effect descriptors. This module
 * translates those into real I/O operations via port interfaces.
 *
 * Phase 4.2 — effects are partitioned into two classes:
 *
 *   - **critical**: awaited in order. A slow critical sink blocks the
 *     pipeline loop (by design — state mutations and invocation records
 *     must land before the next batch runs).
 *   - **observational**: submitted to a module-level queue and drained
 *     by a bounded worker pool in the background. `executeEffects`
 *     returns as soon as critical effects finish. A slow telemetry sink
 *     never blocks the loop. Queue has a fixed depth cap; overflow drops
 *     oldest and bumps a counter.
 */

import type { Effect } from "./effects.js";
import type { StateStore } from "../ports/state-store.js";
import type { Telemetry } from "../ports/telemetry.js";
import type { CodeIndexer } from "../ports/code-indexer.js";

export interface EffectPorts {
  readonly stateStore: StateStore;
  readonly telemetry: Telemetry;
  /**
   * Optional — when provided, `reindex` effects synchronously refresh
   * the semantic graph before resolving. When absent, `reindex` effects
   * become a telemetry-only no-op (preserves backward compatibility for
   * any caller that constructs `EffectPorts` without an indexer, e.g.
   * unit tests of the kernel reducer in isolation).
   */
  readonly codeIndexer?: CodeIndexer;
}

/**
 * Classify an effect as critical (state-mutating, must block) or
 * observational (metrics/logging, fire-and-forget). Keyed purely by
 * `effect.type` so it stays a pure function over the Effect union.
 */
function classifyEffect(effect: Effect): "critical" | "observational" {
  switch (effect.type) {
    case "persist-state":
    case "persist-execution-record":
    case "write-halt-artifact":
    case "append-invocation-record":
    case "seal-invocation":
    case "reindex":
      return "critical";
    case "telemetry-event":
      return "observational";
    default: {
      const _exhaustive: never = effect;
      return _exhaustive;
    }
  }
}

// ---------------------------------------------------------------------------
// Observational queue — bounded FIFO drained in the background.
// ---------------------------------------------------------------------------

/** Default cap on the observational in-flight + queued depth. Overridable
 *  via `configureObservationalQueue({ cap })` — kept module-level so the
 *  loop doesn't need to thread it through every call site. */
const DEFAULT_QUEUE_CAP = 256;
const DEFAULT_CONCURRENCY = 4;

interface QueueEntry {
  readonly effect: Effect;
  readonly ports: EffectPorts;
}

interface ObservationalState {
  queued: QueueEntry[];
  inFlight: number;
  concurrency: number;
  cap: number;
  dropped: number;
  processed: number;
  /** Promises currently executing — awaited by `drainObservational()`
   *  so tests can assert on the post-drain state. */
  pending: Set<Promise<void>>;
}

const observational: ObservationalState = {
  queued: [],
  inFlight: 0,
  concurrency: DEFAULT_CONCURRENCY,
  cap: DEFAULT_QUEUE_CAP,
  dropped: 0,
  processed: 0,
  pending: new Set(),
};

/** Tune the observational queue. Intended for test harnesses and the
 *  composition root; runtime reconfiguration during a pipeline run is
 *  supported but discouraged. */
export function configureObservationalQueue(opts: {
  cap?: number;
  concurrency?: number;
}): void {
  if (opts.cap !== undefined) observational.cap = Math.max(1, opts.cap);
  if (opts.concurrency !== undefined) {
    observational.concurrency = Math.max(1, opts.concurrency);
  }
}

/** Snapshot queue metrics — read-only surface for tests and telemetry. */
export function observationalQueueMetrics(): {
  readonly queueDepth: number;
  readonly inFlight: number;
  readonly dropped: number;
  readonly processed: number;
  readonly cap: number;
} {
  return {
    queueDepth: observational.queued.length,
    inFlight: observational.inFlight,
    dropped: observational.dropped,
    processed: observational.processed,
    cap: observational.cap,
  };
}

/** Wait until the observational queue is empty AND all in-flight effects
 *  have completed. Used by tests; the pipeline loop never calls this. */
export async function drainObservational(): Promise<void> {
  while (observational.queued.length > 0 || observational.inFlight > 0) {
    if (observational.pending.size === 0) {
      // Nothing in flight but queue non-empty — kick the pump once.
      pumpObservational();
      if (observational.pending.size === 0) return;
    }
    await Promise.race(observational.pending);
  }
}

/** Reset all queue state — tests only. */
export function _resetObservationalQueueForTests(): void {
  observational.queued = [];
  observational.inFlight = 0;
  observational.dropped = 0;
  observational.processed = 0;
  observational.pending.clear();
  observational.cap = DEFAULT_QUEUE_CAP;
  observational.concurrency = DEFAULT_CONCURRENCY;
}

/** Submit an observational effect to the queue. Drops oldest if the
 *  combined (queued + in-flight) depth exceeds the cap. Never throws. */
function submitObservational(effect: Effect, ports: EffectPorts): void {
  const depth = observational.queued.length + observational.inFlight;
  if (depth >= observational.cap) {
    // Drop oldest — matches the plan's "never drop critical, drop oldest
    // observational when saturated" rule. Newest survives.
    observational.queued.shift();
    observational.dropped++;
  }
  observational.queued.push({ effect, ports });
  pumpObservational();
}

function pumpObservational(): void {
  while (
    observational.inFlight < observational.concurrency &&
    observational.queued.length > 0
  ) {
    const next = observational.queued.shift()!;
    observational.inFlight++;
    const p = runObservational(next.effect, next.ports)
      .finally(() => {
        observational.inFlight--;
        observational.processed++;
        observational.pending.delete(p);
        // Drain remaining queued entries without blowing the stack.
        if (observational.queued.length > 0) queueMicrotask(pumpObservational);
      });
    observational.pending.add(p);
  }
}

async function runObservational(effect: Effect, ports: EffectPorts): Promise<void> {
  try {
    switch (effect.type) {
      case "telemetry-event":
        ports.telemetry.event(effect.category, effect.itemKey, effect.context);
        break;
      default:
        // Non-observational effects should never reach here; silently ignore.
        break;
    }
  } catch {
    // Observational effects are fire-and-forget — sink failures never
    // propagate into the pipeline loop.
  }
}

/**
 * Execute a list of effects. Critical effects run sequentially and are
 * awaited before the returned promise resolves. Observational effects
 * are submitted to the background queue and drained concurrently — the
 * returned promise does NOT wait for them.
 *
 * Returns the count of effects accepted (all critical executed + all
 * observational submitted, whether or not they have been processed).
 * Callers treating this as a "work done" counter should prefer
 * `observationalQueueMetrics().processed` for the observational side.
 */
export async function executeEffects(
  effects: readonly Effect[],
  ports: EffectPorts,
): Promise<number> {
  let accepted = 0;

  // Phase 2 (parallelism observability) — pre-aggregate `causedBy` values
  // across all `reindex` effects in this call so the single coalesced
  // `code-index.refresh{trigger:"kernel-effect"}` event attributes to
  // every node-complete that produced an effect this tick. The first
  // reindex encountered fires the actual `index()` call carrying the
  // aggregated set; subsequent reindex effects in the same call are
  // dropped (the indexer would coalesce them anyway, but doing it here
  // gives us a single telemetry record with full attribution).
  const aggregatedCausedBy: string[] = (() => {
    const seen = new Set<string>();
    for (const e of effects) {
      if (e.type === "reindex" && typeof e.causedBy === "string") {
        if (!seen.has(e.causedBy)) seen.add(e.causedBy);
      }
    }
    return Array.from(seen);
  })();
  let reindexFired = false;

  for (const effect of effects) {
    if (classifyEffect(effect) === "observational") {
      submitObservational(effect, ports);
      accepted++;
      continue;
    }

    // Critical — await in order.
    switch (effect.type) {
      case "persist-state":
        // State persistence is handled by the loop's lifecycle.commitState(),
        // not individual effects. This is a placeholder for future use.
        accepted++;
        break;

      case "persist-execution-record":
        try {
          ports.telemetry.event("item.end", null, {
            executionId: effect.record.executionId,
            nodeKey: effect.record.nodeKey,
          });
          accepted++;
        } catch {
          // Non-fatal — don't block the pipeline for telemetry failures
        }
        break;

      case "write-halt-artifact":
        try {
          const lines: string[] = [];
          lines.push(`# ⛔ Pipeline halted — identical error recurred`);
          lines.push("");
          lines.push(`- **Feature:** \`${effect.slug}\``);
          lines.push(`- **Most recent failing node:** \`${effect.failingItemKey}\``);
          lines.push(`- **Error signature:** \`${effect.errorSignature}\``);
          lines.push(`- **Threshold:** ${effect.thresholdMatchCount}/${effect.threshold} identical failures`);
          lines.push("");
          lines.push(`## Why this halted`);
          lines.push("");
          lines.push(
            "The kernel saw the **same error signature** recur across multiple dispatches within this feature run.",
            "Rather than burn more cycles on a stuck dev agent, the pipeline halted for human review.",
          );
          lines.push("");
          lines.push(`## Identical failures (newest last)`);
          lines.push("");
          for (const f of effect.sampleFailures) {
            const excerpt = f.message.split(/\r?\n/).slice(0, 6).join("\n");
            lines.push(`### \`${f.itemKey}\` — ${f.timestamp}`);
            lines.push("```");
            lines.push(excerpt);
            lines.push("```");
            lines.push("");
          }
          lines.push(`## Resume`);
          lines.push("");
          lines.push("1. Investigate the root cause (the recurring error above).");
          lines.push("2. Commit any fix to the feature branch.");
          lines.push(`3. Run: \`npm run pipeline:resume ${effect.slug}\` — (not yet implemented for escalation halts; reset the stuck node via \`pipeline:reset-scripts\` or clear \`${effect.slug}_HALT.md\` and re-run \`agent:run\` to retry).`);
          lines.push("");
          await ports.stateStore.writeHaltArtifact(effect.slug, lines.join("\n") + "\n");
          accepted++;
        } catch {
          // Non-fatal — halt itself is already recorded via telemetry + kernel signal
        }
        break;

      case "append-invocation-record":
        try {
          await ports.stateStore.appendInvocationRecord(effect.slug, effect.input);
          accepted++;
        } catch (err) {
          // Non-fatal — ledger is a derived index, the handler still runs.
          ports.telemetry.event("invocation.append_failed", null, {
            slug: effect.slug,
            invocationId: effect.input.invocationId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        break;

      case "seal-invocation":
        try {
          await ports.stateStore.sealInvocation(effect.slug, effect.input);
          accepted++;
        } catch (err) {
          // Non-fatal — the invocation dir may have been cleaned up or the
          // append effect may have been dropped earlier in the same batch.
          ports.telemetry.event("invocation.seal_failed", null, {
            slug: effect.slug,
            invocationId: effect.input.invocationId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        break;

      case "reindex":
        // Refresh the semantic graph before the next dispatch reads it.
        // Coalesced internally by the indexer port — concurrent callers
        // (parallel dev nodes completing at once, triage reroutes,
        // pre-tool-call gate) all await the same in-flight refresh.
        // Failures are non-fatal: the pipeline continues with whatever
        // state the indexer is in and agents fall back to standard tools.
        //
        // Phase 2 (parallelism observability) — when multiple reindex
        // effects arrive in the same `executeEffects` call (one per
        // completing node in a parallel batch), only the first triggers
        // an actual `index()` and emits the telemetry event; the
        // remainder are no-ops. The telemetry carries the aggregated
        // `causedBy` set so coalesced refreshes are still attributable.
        if (reindexFired) {
          accepted++;
          break;
        }
        reindexFired = true;
        if (ports.codeIndexer && ports.codeIndexer.isAvailable()) {
          try {
            const result = await ports.codeIndexer.index();
            ports.telemetry.event("code-index.refresh", null, {
              trigger: "kernel-effect",
              durationMs: result.durationMs,
              upToDate: result.upToDate,
              categories: effect.categories,
              ...(aggregatedCausedBy.length > 0 ? { causedBy: aggregatedCausedBy } : {}),
            });
          } catch (err) {
            ports.telemetry.event("code-index.refresh_failed", null, {
              error: err instanceof Error ? err.message : String(err),
              categories: effect.categories,
              ...(aggregatedCausedBy.length > 0 ? { causedBy: aggregatedCausedBy } : {}),
            });
          }
        } else {
          ports.telemetry.event("code-index.refresh_skipped", null, {
            reason: "indexer-unavailable",
            categories: effect.categories,
            ...(aggregatedCausedBy.length > 0 ? { causedBy: aggregatedCausedBy } : {}),
          });
        }
        accepted++;
        break;

      default: {
        // Unreachable — classifyEffect partitions the union and
        // observational branches returned early above.
        break;
      }
    }
  }

  return accepted;
}
