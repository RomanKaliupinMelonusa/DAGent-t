/**
 * src/temporal/activities/copilot-agent.activity.ts — Phase 5 of the
 * Session 3 migration. The hardest activity to migrate; this docstring
 * documents the audit trail.
 *
 * Why an activity (not workflow code):
 *   1. It drives the Copilot SDK (`@github/copilot-sdk`) — non-deterministic
 *      LLM I/O, network sockets, MCP child processes, all forbidden in
 *      workflow scope.
 *   2. Sessions can run for tens of minutes; heartbeats keep the worker
 *      alive against the Temporal server's liveness check.
 *   3. Cancellation MUST disconnect the SDK session — otherwise a
 *      cancelled activity would silently keep the worker slot busy
 *      until the SDK's own timeout (often hours), starving the queue.
 *
 * Cancellation audit (S3-R2)
 * --------------------------
 * Pre-migration, `runCopilotSession` had no external cancel API: its
 * only termination paths were the cognitive circuit breaker, the
 * post-completion grace timer, and `params.timeout`. None of those
 * observe the activity context. Phase 5 closes the gap by extending
 * `CopilotSessionParams.abortSignal?: AbortSignal` (port + adapter)
 * — the adapter wires `addEventListener("abort", () => session.disconnect())`
 * so workflow-initiated activity cancellation propagates to the SDK.
 *
 * The activity then has TWO defenses:
 *   1. The race below surfaces cancellation as a deterministic
 *      `outcome: "failed"` with `COPILOT_AGENT_CANCELLED_PREFIX` —
 *      the workflow body matches on this prefix to short-circuit
 *      retry loops without inspecting opaque SDK reject messages.
 *   2. The `abortSignal` plumbing into the SDK ensures the
 *      `sendAndWait` actually rejects (rather than the activity
 *      reporting cancelled while the session keeps running in the
 *      background). Without (2), (1) is a lie.
 *
 * Both defenses are required. Removing either is a regression.
 *
 * Dependency injection
 * --------------------
 * The copilot-agent handler reaches for THREE heavyweight ports:
 *   - `ctx.client`               — concrete `CopilotClient`
 *   - `ctx.copilotSessionRunner` — port (`NodeCopilotSessionRunner`)
 *   - `ctx.codeIndexer`          — optional, for freshness gate
 *
 * Temporal's activity proxy doesn't thread per-call options, so we
 * use module-scoped DI (mirrors `setTriageDependencies` from Phase 4).
 * Production wiring lives in the worker bootstrap (Session 6 task);
 * tests inject via `setCopilotAgentDependencies`.
 *
 * What this activity does NOT do
 * ------------------------------
 * - It does not own `report_outcome` validation — that's the harness
 *   tool's job, fed via the runner's `precompletionGate`.
 * - It does not own no-op-dev detection — that's still inside the
 *   legacy handler (and tested in `src/handlers/__tests__/`).
 * - It does not own change-manifest writing — that's a side effect
 *   of the handler against `ctx.vcs` / `ctx.filesystem`, kept
 *   verbatim through the middleware chain.
 *
 * Cooperative cancellation only intercepts AT the activity boundary.
 * Once the handler has spun up the session, abort propagates through
 * `params.abortSignal` (adapter-wired). Once `sendAndWait` rejects,
 * the existing `catch` path in the runner classifies the error.
 */

import copilotAgentHandler from "../../handlers/copilot-agent.js";
import { withHeartbeat } from "./support/heartbeat.js";
import { buildNodeContext } from "./support/build-context.js";
import { buildCancellationRace } from "./support/cancellation.js";
import { runActivityChain } from "./middleware-chain.js";
import type { NodeActivityInput, NodeActivityResult } from "./types.js";
import type { NodeResult } from "../../handlers/types.js";
import type { CopilotSessionRunner, CopilotSessionParams, CopilotSessionResult } from "../../ports/copilot-session-runner.js";
import type { CodeIndexer } from "../../ports/code-indexer.js";
import type { CopilotClient } from "@github/copilot-sdk";

/** Marker prefix for cancelled-by-workflow results. Stable across
 *  releases — the workflow body matches on this to distinguish
 *  external cancellation from agent-reported failures. Don't rename
 *  without bumping the workflow body's version (Session 4). */
export const COPILOT_AGENT_CANCELLED_PREFIX = "Copilot agent cancelled by workflow";

// ---------------------------------------------------------------------------
// Module-scoped DI (see file header for rationale).
// ---------------------------------------------------------------------------

let injectedClient: CopilotClient | undefined;
let injectedRunner: CopilotSessionRunner | undefined;
let injectedCodeIndexer: CodeIndexer | undefined;

/** Worker-bootstrap helper. Call once from `src/temporal/worker/main.ts`
 *  after constructing the production adapters. Tests use this to inject
 *  fakes in `beforeEach`. Pass `undefined` to clear the slot. */
export function setCopilotAgentDependencies(deps: {
  readonly client?: CopilotClient;
  readonly copilotSessionRunner?: CopilotSessionRunner;
  readonly codeIndexer?: CodeIndexer;
}): void {
  injectedClient = deps.client;
  injectedRunner = deps.copilotSessionRunner;
  injectedCodeIndexer = deps.codeIndexer;
}

// ---------------------------------------------------------------------------
// Cancellable runner wrapper
// ---------------------------------------------------------------------------

/**
 * Wraps an inner `CopilotSessionRunner` and threads the activity's
 * `AbortSignal` into every `run()` call. The legacy handler does NOT
 * know about activities — it just calls `ctx.copilotSessionRunner.run`.
 * Rather than plumb the signal through `NodeContext` (which would
 * touch every call site in the legacy code base), the activity wraps
 * the production runner once at the boundary.
 *
 * Caller-supplied `params.abortSignal` (rare but possible — e.g. tests
 * that already pass one) is preserved by chaining: if EITHER the
 * caller's signal or the activity's signal aborts, the merged signal
 * aborts. This composes cleanly with the per-test cancel-before-run
 * pattern used in the activity boundary tests below.
 */
class CancellableRunner implements CopilotSessionRunner {
  constructor(
    private readonly inner: CopilotSessionRunner,
    private readonly activitySignal: AbortSignal,
  ) {}

  run(client: CopilotClient, params: CopilotSessionParams): Promise<CopilotSessionResult> {
    const merged = mergeAbortSignals(this.activitySignal, params.abortSignal);
    return this.inner.run(client, { ...params, abortSignal: merged });
  }
}

/** Merge two `AbortSignal`s into one that aborts when either does.
 *  When `b` is undefined, returns `a` directly. When both are present,
 *  uses `AbortSignal.any` (Node 20+) when available, falling back to a
 *  manual controller. We keep the fallback because the production
 *  worker runs on Node 22 but Vitest in Node 20-shim environments
 *  occasionally trips on `AbortSignal.any` in test fixtures. */
function mergeAbortSignals(
  a: AbortSignal,
  b: AbortSignal | undefined,
): AbortSignal {
  if (!b) return a;
  // Node 20.3+ / 22 — use the platform implementation when available.
  const anyFn = (AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal }).any;
  if (typeof anyFn === "function") return anyFn([a, b]);
  // Manual fallback. Each registered listener removes itself from
  // BOTH signals on the first abort, so a long-running worker does
  // not accumulate dead listeners on the Temporal cancellation signal
  // when many short sessions complete without abort. ({ once: true }
  // alone would only auto-remove the listener on the signal that
  // actually fires.)
  const controller = new AbortController();
  const onAbort = (): void => {
    a.removeEventListener("abort", onAbort);
    b.removeEventListener("abort", onAbort);
    controller.abort(a.aborted ? a.reason : b.reason);
  };
  if (a.aborted || b.aborted) controller.abort(a.aborted ? a.reason : b.reason);
  else {
    a.addEventListener("abort", onAbort);
    b.addEventListener("abort", onAbort);
  }
  return controller.signal;
}

// ---------------------------------------------------------------------------
// Result projection
// ---------------------------------------------------------------------------

function toActivityResult(result: NodeResult): NodeActivityResult {
  // Strip `signal: "approval-pending"` defensively per D-S3-3. The
  // copilot-agent handler doesn't synthesize the legacy approval
  // signal directly, but a downstream middleware historically could
  // and the invariant is load-bearing.
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

// ---------------------------------------------------------------------------
// Activity entry point
// ---------------------------------------------------------------------------

/**
 * Heartbeat-aware activity that runs a Copilot SDK agent session.
 * Cancellation propagates two ways: the prefix race (deterministic
 * `outcome: "failed"`) AND the `abortSignal` plumbing into the SDK
 * (which actually disconnects the session). Both must be present.
 */
export async function copilotAgentActivity(
  input: NodeActivityInput,
): Promise<NodeActivityResult> {
  return withHeartbeat<NodeActivityResult>(
    async ({ emit, signal }) => {
      // Wrap the production runner so the activity's signal threads
      // into every `runner.run()` call. When DI is unwired, leave the
      // slot undefined — the handler's `ctx.client` guard returns a
      // deterministic BUG error before ever reaching the runner.
      const wrappedRunner: CopilotSessionRunner | undefined = injectedRunner
        ? new CancellableRunner(injectedRunner, signal)
        : undefined;

      const ctx = await buildNodeContext(input, {
        client: injectedClient,
        copilotSessionRunner: wrappedRunner,
        codeIndexer: injectedCodeIndexer,
        onHeartbeat: () => emit({ stage: "agent-running", itemKey: input.itemKey }),
      });

      // Pre-abort gap: `withHeartbeat`'s controller signal listener is
      // registered after construction, so a cancellation issued before
      // `env.run()` won't propagate into `signal` (DOM AbortSignal
      // semantics: `addEventListener("abort", ...)` on an already-
      // aborted signal does not auto-fire). The shared helper checks
      // BOTH the heartbeat signal and Temporal's cancellationSignal
      // directly to close the gap. Bug history lives in
      // [support/cancellation.ts](./support/cancellation.ts).
      const cancelled = buildCancellationRace({
        prefix: COPILOT_AGENT_CANCELLED_PREFIX,
        heartbeatSignal: signal,
      });

      const handled = (async (): Promise<NodeActivityResult> => {
        const result = await runActivityChain(copilotAgentHandler, ctx);
        return toActivityResult(result as NodeResult);
      })();

      return Promise.race([handled, cancelled]);
    },
    // 30s heartbeats: agent sessions routinely run 5–20 minutes; longer
    // intervals risk the Temporal server marking the worker unhealthy
    // during deep tool-call chains.
    { intervalMs: 30_000 },
  );
}
