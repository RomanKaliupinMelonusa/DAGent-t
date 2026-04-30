/**
 * src/workflow/single-activity.workflow.ts — Phase 6 of Session 3.
 *
 * Dispatches exactly one node activity and returns its result. This is
 * the smallest workflow shape that exercises the activity boundary
 * end-to-end against a real Temporal cluster — the building block the
 * Session 4 full-pipeline workflow body will compose dozens of times
 * per feature.
 *
 * Why a single-activity workflow (and not the full pipeline yet):
 *   - Lets us validate Phase 1–5 activities against real Temporal
 *     infrastructure (history persistence, heartbeats, cancellation)
 *     without standing up the full DAG-walking control flow.
 *   - Gives us a `temporal:dispatch` CLI useful for ad-hoc runs and
 *     CI debugging (e.g. "run `local-exec` against this fixture
 *     payload, return the JSON result").
 *   - Forms the contract surface that Session 4's full pipeline
 *     workflow body will internalise as a `proxyActivities` call.
 *
 * Determinism contract
 * --------------------
 * The workflow body is pure control flow — it picks a proxy by
 * `handlerKind` and awaits the call. No `Date`, `Math.random`,
 * `node:*`, or process state. Per-handler timeouts come from
 * compile-time constants below; per-invocation overrides arrive on
 * the input.
 *
 * Retry policy (per plan §4a.4 / §4b.4 / §4d.5 / §4e Design decisions)
 * --------------------------------------------------------------------
 * Retry counts deliberately diverge by handler kind:
 *
 *   - `local-exec`:    `maximumAttempts: 1` — scripts are
 *     non-idempotent (push, publish); the workflow's redev cycle owns
 *     user-visible retry semantics.
 *   - `github-ci-poll`:`maximumAttempts: 3` — covers transient `gh`/
 *     network jitter; the activity itself loops over polls, so worker
 *     retry only triggers on hard crashes.
 *   - `triage`:        `maximumAttempts: 2` — one retry covers LLM
 *     transient failures; further retries waste tokens with no signal.
 *   - `copilot-agent`: `maximumAttempts: 1` — never auto-retry. A
 *     mid-session worker crash already burned tokens and may have
 *     partial side effects; the workflow's redev cycle decides
 *     whether to relaunch (see plan §4e Design decisions).
 *
 * Failure modes the legacy dispatcher treated as `outcome: "failed"`
 * (CI red, agent reported `failed`, triage classifier `failed`) are
 * NOT Temporal-level failures — they return successfully with
 * `outcome: "failed"` and the workflow surfaces them verbatim.
 *
 * Cancellation
 * ------------
 * When the workflow is cancelled, Temporal cancels the in-flight
 * activity. Each Phase 2/4/5 activity has a deterministic cancellation
 * prefix (`CI_POLL_CANCELLED_PREFIX`, `TRIAGE_CANCELLED_PREFIX`,
 * `COPILOT_AGENT_CANCELLED_PREFIX`) — the workflow returns the
 * activity's result rather than re-raising `CancelledFailure`, so
 * callers see uniform `outcome: "failed"` with the prefix in the
 * `errorMessage`.
 */

import { proxyActivities } from "@temporalio/workflow";
import type * as activities from "../activities/index.js";
import type { NodeActivityInput, NodeActivityResult } from "../activities/types.js";

/**
 * Discriminator selecting which activity to dispatch. Maps 1:1 to the
 * legacy `handlers/index.ts` registry minus the approval handler
 * (which is replaced by the workflow signal pattern from Phase 3).
 */
export type SingleActivityHandlerKind =
  | "local-exec"
  | "github-ci-poll"
  | "triage"
  | "copilot-agent";

export interface SingleActivityInput {
  readonly handlerKind: SingleActivityHandlerKind;
  readonly input: NodeActivityInput;
}

// ---------------------------------------------------------------------------
// Per-handler proxies. Different handler kinds have radically different
// duration profiles, so we use distinct proxy bindings rather than one
// over-broad timeout. Heartbeat timeouts are 2× the heartbeat interval
// (`withHeartbeat` defaults to 30s) — Temporal flags the worker as
// stalled if no heartbeat arrives within `heartbeatTimeout`.
// ---------------------------------------------------------------------------

/** Local script execution — push, publish, build, test. Plan §4a.4
 *  pins `startToCloseTimeout: 15 minutes` and `maximumAttempts: 1`
 *  (scripts are non-idempotent; the workflow's redev cycle handles
 *  user-visible retries). */
const { localExecActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "15 minutes",
  heartbeatTimeout: "60 seconds",
  retry: { maximumAttempts: 1 },
});

/** GitHub Actions CI polling — plan §4b.4 pins
 *  `startToCloseTimeout: 2 hours` (GH Actions runs commonly stretch),
 *  `heartbeatTimeout: 90 seconds` (less chatty than 30s; the heartbeat
 *  interval is 30s so 90s = 3× safety margin), and
 *  `maximumAttempts: 3` for transient `gh`/network failures. */
const { githubCiPollActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "2 hours",
  heartbeatTimeout: "90 seconds",
  retry: { maximumAttempts: 3 },
});

/** Triage — RAG / LLM classification. Plan §4d.5/4d.6 pins
 *  `startToCloseTimeout: 5 minutes` (triage is fast or it's broken)
 *  and `maximumAttempts: 2` (one retry covers LLM transient failure;
 *  more retries waste tokens). */
const { triageActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
  heartbeatTimeout: "60 seconds",
  retry: { maximumAttempts: 2 },
});

/** Copilot agent — long LLM sessions; routinely 5–20 minutes,
 *  occasionally longer for large refactors. Plan §4e Design decisions
 *  pins `startToCloseTimeout: 4 hours` (legacy `params.timeout` is the
 *  authoritative budget; this is the worker safety net),
 *  `heartbeatTimeout: 90 seconds`, and `maximumAttempts: 1` —
 *  CRITICAL: never auto-retry. A mid-session worker crash already
 *  burned tokens and may have partial side effects; the workflow's
 *  redev cycle is the sole authority on retry. */
const { copilotAgentActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "4 hours",
  heartbeatTimeout: "90 seconds",
  retry: { maximumAttempts: 1 },
});

/**
 * Dispatch a single node activity. The workflow exists only as a
 * Temporal-side adapter: it picks the correct proxy by `handlerKind`
 * and forwards the input verbatim. Result projection is the
 * activity's responsibility (see `toActivityResult` in each activity
 * module).
 */
export async function singleActivityWorkflow(
  args: SingleActivityInput,
): Promise<NodeActivityResult> {
  switch (args.handlerKind) {
    case "local-exec":
      return await localExecActivity(args.input);
    case "github-ci-poll":
      return await githubCiPollActivity(args.input);
    case "triage":
      return await triageActivity(args.input);
    case "copilot-agent":
      return await copilotAgentActivity(args.input);
    default: {
      // Exhaustiveness guard — TypeScript widens to `never` if all
      // discriminants are handled. Throwing here documents intent
      // for any future handler kind that lands without a workflow
      // case (rather than silently falling through).
      const exhaustive: never = args.handlerKind;
      throw new Error(`Unknown handlerKind: ${String(exhaustive)}`);
    }
  }
}
