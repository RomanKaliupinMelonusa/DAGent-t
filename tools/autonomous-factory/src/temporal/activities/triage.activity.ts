/**
 * src/temporal/activities/triage.activity.ts — Phase 4.
 *
 * Wraps the legacy `handlers/triage-handler.ts` chain with a Temporal
 * activity boundary. The triage handler is the engine's failure-routing
 * brain — it classifies failures (contract → RAG → LLM → fallback) and
 * emits declarative `DagCommand[]` describing how the graph should
 * mutate (reset nodes, salvage to draft, etc).
 *
 * Why an activity (and not a workflow body):
 *   1. It's read-heavy: walks the on-disk artifact graph (Playwright
 *      reports, baselines, prior triage handoffs) — filesystem access
 *      is forbidden in workflow scope.
 *   2. The optional LLM path is non-deterministic by definition.
 *
 * Activity boundary contract
 * --------------------------
 *
 * Input:  the standard `NodeActivityInput`. Triage-specific fields
 *         (`failingNodeKey`, `rawError`, `errorSignature`, …) carry
 *         the upstream failure across the boundary; the workflow body
 *         in Session 4 captures these from the failed activity's
 *         result and packs them in.
 *
 * Output: `NodeActivityResult.commands` carries the graph-mutation
 *         payload. The workflow body translates each command into the
 *         matching `DagState` reducer call. `handlerOutput` carries
 *         the structured `TriageHandlerOutput` (domain, source,
 *         routedTo, …) for telemetry observers.
 *
 * Determinism / cancellation
 * --------------------------
 *
 * - `withHeartbeat` wraps the body with 30s heartbeats — the LLM call
 *   can take seconds, and the artifact-walk on a large workspace can
 *   take longer.
 * - Cancellation is cooperative: like `github-ci-poll`, we race the
 *   handler promise against the activity cancellation signal and
 *   surface cancellation as `outcome: "failed"` with a stable
 *   prefix so the workflow body can route uniformly without
 *   catching `CancelledFailure`.
 *
 * Optional ports (see `support/build-context.ts`):
 * - `triageLlm`        — when undefined, the handler degrades to
 *                        contract-only classification (deterministic).
 * - `baselineLoader`   — when undefined, the noise-filter pass is a
 *                        no-op; the contract path still works.
 *
 * For tests we leave both undefined and exercise the contract /
 * fallback paths. Production wiring (Session 6) injects an Anthropic-
 * backed `TriageLlm` adapter and a `FileBaselineLoader`.
 */

import triageHandler from "../../handlers/triage-handler.js";
import { withHeartbeat } from "./support/heartbeat.js";
import { buildNodeContext } from "./support/build-context.js";
import { buildCancellationRace } from "./support/cancellation.js";
import { runActivityChain } from "./middleware-chain.js";
import type { NodeActivityInput, NodeActivityResult } from "./types.js";
import type { NodeResult } from "../../handlers/types.js";
import type { TriageLlm } from "../../ports/triage-llm.js";
import type { BaselineLoader } from "../../ports/baseline-loader.js";

/** Marker prefix for `outcome: "failed"` results produced by Temporal-
 *  level cancellation (vs. classifier-failed). Stable across releases —
 *  the workflow body matches on this to short-circuit retry loops. */
export const TRIAGE_CANCELLED_PREFIX = "Triage cancelled by workflow";

/**
 * Optional dependency-injection slots. Assigning here scopes
 * customisation to the worker process — production wiring lives in the
 * worker's main entrypoint (`src/temporal/worker/main.ts`), test
 * injection happens via `setTriageDependencies` in the test bed.
 *
 * We expose these as module-scoped getters/setters rather than passing
 * them per-activity-call because Temporal's activity proxy doesn't
 * thread arbitrary options through — activities receive their input
 * arg only. A `Worker.create({ activities })` registration takes the
 * already-bound function reference; ambient ports are the
 * canonical workaround.
 */
let triageLlm: TriageLlm | undefined;
let baselineLoader: BaselineLoader | undefined;

/** Worker-bootstrap helper. Call from `main.ts` after constructing the
 *  port adapters. Tests use this to inject fakes. */
export function setTriageDependencies(deps: {
  readonly triageLlm?: TriageLlm;
  readonly baselineLoader?: BaselineLoader;
}): void {
  triageLlm = deps.triageLlm;
  baselineLoader = deps.baselineLoader;
}

function toActivityResult(result: NodeResult): NodeActivityResult {
  // Triage produces `commands` and `handlerOutput`; pass them through
  // verbatim. `signal: "approval-pending"` is impossible for triage
  // (the handler never produces it) but we still strip defensively
  // per the D-S3-3 invariant — no activity result carries the legacy
  // approval signal.
  return {
    outcome: result.outcome,
    summary: result.summary,
    errorMessage: result.errorMessage,
    handlerOutput: result.handlerOutput,
    signal: result.signal === "approval-pending" ? undefined : result.signal,
    signals: result.signals,
    producedArtifacts: result.producedArtifacts,
    diagnosticTrace: result.diagnosticTrace,
    commands: result.commands,
  };
}

/**
 * Heartbeat-aware activity that classifies a pipeline failure and
 * emits routing commands. Workflow body (Session 4) applies the
 * commands to `DagState`; this activity is purely advisory.
 */
export async function triageActivity(
  input: NodeActivityInput,
): Promise<NodeActivityResult> {
  return withHeartbeat<NodeActivityResult>(
    async ({ emit, signal }) => {
      const ctx = await buildNodeContext(input, {
        triageLlm,
        baselineLoader,
        onHeartbeat: () =>
          emit({ stage: "classifying", itemKey: input.itemKey }),
      });

      const cancelled = buildCancellationRace({
        prefix: TRIAGE_CANCELLED_PREFIX,
        heartbeatSignal: signal,
      });

      const classified = (async (): Promise<NodeActivityResult> => {
        const result = await runActivityChain(triageHandler, ctx);
        return toActivityResult(result as NodeResult);
      })();

      return Promise.race([classified, cancelled]);
    },
    { intervalMs: 30_000 },
  );
}
