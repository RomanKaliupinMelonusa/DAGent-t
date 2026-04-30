/**
 * src/workflow/pipeline.workflow.ts — Full pipeline workflow body.
 *
 * Composes the Phase 3 activities (`local-exec`,
 * `github-ci-poll`, `triage`, `copilot-agent`) with the approval
 * pattern around a `DagState` instance to walk the DAG to completion.
 *
 * Workflow lifecycle (one `pipelineWorkflow` execution per feature):
 *
 *   1. Install signal/query handlers BEFORE the first await (Temporal
 *      ordering requirement — signals delivered before `setHandler` are
 *      buffered, but only when the handler is installed in the same
 *      task).
 *   2. Build `DagState` from the compiled workflow node map.
 *   3. Loop:
 *        a. Hold gate — `await condition(() => !dag.isHeld() || dag.isCancelled())`.
 *        b. Cancellation — return early with `{status: "cancelled"}`.
 *        c. Bump batch counter.
 *        d. `getReady()` — terminal kinds (`complete`/`blocked`) end the loop.
 *        e. For each ready item, dispatch in parallel via
 *           `dispatchNodeActivity` OR `awaitApproval` for approval gates.
 *        f. Apply each result (`applyComplete` / `applyFail`).
 *   4. Final archive activity.
 *
 * Determinism scope (enforced by ESLint):
 *   - Only Temporal SDK + workflow-scoped helpers imported.
 *   - All ISO timestamps come from `formatIsoFromMs(Workflow.now())`.
 *   - All UUIDs come from `Workflow.uuid4()`.
 *   - No `Date`, no `Math.random`, no `node:*`, no adapters.
 *
 * Scope notes:
 *   - Triage cascade: WIRED. Newly-failed items with `on_failure.triage`
 *     dispatch the triage activity in parallel; returned commands are
 *     applied serially via `applyTriageCommand` so the failed node is
 *     re-queued (and its cycle counter incremented) before the next
 *     batch is scheduled. See `runTriageCascade` below and
 *     [__tests__/triage-cascade-reroute.test.ts](./__tests__/triage-cascade-reroute.test.ts)
 *     for the end-to-end reroute proof (Session 5 P1, 2026-04-30).
 *   - Cycle-budget halt: WIRED. `applyResetNodes` halts when the
 *     `errorLog` count for `logKey` reaches `maxCycles`; halt reason
 *     bubbles up from `applyTriageCommand` → `runTriageCascade` → the
 *     main loop, which sets `finalStatus = "halted"` and `finalReason =
 *     "triage-halt: ..."`. Verified by
 *     [__tests__/cycle-budget.test.ts](./__tests__/cycle-budget.test.ts).
 *   - Continue-as-new at >8K events: WIRED. Top-of-loop check on
 *     `workflowInfo().historyLength` triggers `continueAsNew` with a
 *     `priorSnapshot` + `priorAttemptCounts` rehydration payload.
 *     Pending approvals block CAN to keep signal handlers stable.
 *     See [__tests__/continue-as-new.test.ts](./__tests__/continue-as-new.test.ts)
 *     for round-trip rehydration coverage and
 *     [../../__tests__/replay/replay.test.ts](../../__tests__/replay/replay.test.ts)
 *     for the cluster-history replay harness (Session 5 P2, 2026-04-30).
 *
 * The workflow body is the only orchestration entry-point post-cutover;
 * happy path, hold/cancel, approval gating, triage-cascade reroute, and
 * cycle-budget halts are all exercised end-to-end by the workflow-scope
 * Vitest suite under `__tests__/`.
 */

import {
  condition,
  setHandler,
  workflowInfo,
  continueAsNew,
  CancelledFailure,
  isCancellation,
} from "@temporalio/workflow";
import { getNowMs } from "./clock.js";
import { DagState } from "./dag-state.js";
import type { DagSnapshot } from "./dag-state.js";
import {
  installApprovalRegistry,
  awaitApproval,
  ApprovalRejectedError,
} from "./approval-pattern.js";
import {
  holdPipelineSignal,
  resumePipelineSignal,
  cancelPipelineSignal,
} from "./signals.js";
import {
  stateQuery,
  progressQuery,
  nextBatchQuery,
  summaryQuery,
  type StateSnapshot,
  type ProgressSnapshot,
  type NextBatchItem,
  type SummarySnapshot,
} from "./queries.js";
import {
  resetScriptsUpdate,
  resumeAfterElevatedUpdate,
  recoverElevatedUpdate,
} from "./updates.js";
import { formatIsoFromMs } from "./iso-time.js";
import {
  dispatchNodeActivity,
  resolveHandlerKind,
  type DispatchableNode,
} from "./dispatch-node.js";
import { archiveActivity, triageActivity } from "./activity-proxies.js";
import {
  resolveTriageDispatch,
  type TriageDispatch,
} from "./triage-cascade.js";
import { sha256 } from "js-sha256";
import type {
  NodeActivityInput,
  NodeActivityResult,
} from "../activities/types.js";
import type { PipelineState, PipelineItem } from "../types.js";
import type { RoutableWorkflow } from "../domain/failure-routing.js";
import type { DagCommand } from "../dag-commands.js";

// ---------------------------------------------------------------------------
// Workflow input / result wire types
// ---------------------------------------------------------------------------

/**
 * Build a deterministic, replay-safe invocation identifier.
 *
 * The on-disk artifact tree (`<appRoot>/.dagent/<slug>/<nodeKey>/<id>/`)
 * requires `id` to match `inv_` + 26 chars from Crockford base32
 * (validated by `isInvocationId` in `domain/invocation-id.ts`). The
 * legacy generator uses `node:crypto.randomBytes`, which is forbidden
 * inside Temporal's workflow VM (non-deterministic).
 *
 * Workflow scope can't draw randomness, but it doesn't need to — the
 * tuple `(workflowId, nodeKey, attempt)` is already unique per dispatch
 * and stable across replays. SHA-256 of that tuple, sliced to 26 hex
 * chars and uppercased, is a strict subset of Crockford's alphabet
 * (`[0-9A-F]` ⊂ `0-9A-Z\IL\OU`), so the output passes `isInvocationId`.
 */
function makeInvocationId(
  workflowId: string,
  nodeKey: string,
  attempt: number,
): string {
  const digest = sha256(`${workflowId}|${nodeKey}|${attempt}`);
  return `inv_${digest.toUpperCase().slice(0, 26)}`;
}

/**
 * Per-node compiled metadata the workflow body consults for dispatch.
 * Superset of `DispatchableNode` and `CompiledNode` (from init-state.ts).
 * The pre-workflow client step (Group I) builds this from the compiled
 * APM context.
 */
export interface PipelineNodeSpec extends DispatchableNode {
  readonly agent?: string | null;
  readonly type?: string;
  readonly category?: string;
  readonly depends_on?: ReadonlyArray<string>;
  readonly activation?: string;
  readonly salvage_survivor?: boolean;
  readonly salvage_immune?: boolean;
  readonly triggers?: ReadonlyArray<"schedule" | "route">;
  readonly consumes_artifacts?: ReadonlyArray<{
    readonly from: string;
    readonly kind: string;
    readonly required?: boolean;
  }>;
  /** Triage-routing fields consumed by the workflow-scope cascade
   *  (`triage-cascade.ts`). The workflow body forwards these into
   *  `RoutableWorkflow` for `resolveTriageDispatch`. */
  readonly on_failure?:
    | string
    | { triage?: string; routes?: Record<string, string | null> };
  readonly triage?: string;
  readonly triage_profile?: string;
}

/**
 * Workflow input. Compiled client-side once, then frozen for the
 * lifetime of the workflow. Path-style fields (apmContextPath, specFile)
 * are passed through to activities verbatim — activities load on-disk
 * payloads themselves (per S3 D-S3-1).
 */
export interface PipelineInput {
  readonly slug: string;
  readonly workflowName: string;
  readonly appRoot: string;
  readonly repoRoot: string;
  readonly baseBranch: string;
  readonly specFile: string;
  readonly apmContextPath: string;
  /** Resolved environment from compiled apm.yml. */
  readonly environment: Readonly<Record<string, string>>;
  /** Compiled node map. */
  readonly nodes: Readonly<Record<string, PipelineNodeSpec>>;
  /** Workflow-level default triage node key (used when a failing node
   *  has no explicit `on_failure.triage`). */
  readonly default_triage?: string;
  /** Workflow-level default failure routes. */
  readonly default_routes?: Readonly<Record<string, string | null>>;
  /** Workflow start time (ms since epoch). Captured at client side and
   *  passed in so the workflow's `started` ISO is stable. */
  readonly startedMs: number;
  /**
   * Session 5 P2 — when present, the workflow rehydrates from this
   * `DagState.snapshot()` payload instead of `fromInit`. Set by
   * continueAsNew to carry full dynamic state (held / cancelled /
   * approvals / cycleCounters / batchNumber) across incarnations.
   * Production clients leave this undefined.
   */
  readonly priorSnapshot?: DagSnapshot;
  /**
   * Per-itemKey attempt counter at the moment continueAsNew fired.
   * Carried so the new incarnation's `attempt = (counts.get(k) ?? 0) + 1`
   * arithmetic stays monotonic across incarnations.
   */
  readonly priorAttemptCounts?: Readonly<Record<string, number>>;
  /**
   * Override for the history-length threshold that triggers
   * continueAsNew. Default 8000. Tests use a tiny number to exercise
   * the path without growing the history; production leaves it
   * undefined.
   */
  readonly continueAsNewHistoryThreshold?: number;
}

export type PipelineFinalStatus =
  | "complete"
  | "halted"
  | "blocked"
  | "cancelled"
  | "approval-rejected";

export interface PipelineResult {
  readonly status: PipelineFinalStatus;
  readonly reason: string;
  readonly batchNumber: number;
  /** Final DAG snapshot — the post-workflow client step renders
   *  `_TRANS.md` from this. */
  readonly finalSnapshot: StateSnapshot;
}

// ---------------------------------------------------------------------------
// Helper: build NodeActivityInput from DagState + workflow input.
//
// The activity rebuilds NodeContext internally from this JSON-only shape.
// Per-attempt counters are workflow-local (reset on continue-as-new).
// ---------------------------------------------------------------------------

function buildPipelineState(
  dag: DagState,
  input: PipelineInput,
  startedIso: string,
): PipelineState {
  const snap = dag.snapshot();
  const items: PipelineItem[] = snap.state.items.map((i) => ({
    key: i.key,
    label: i.label,
    agent: i.agent ?? null,
    status: i.status,
    error: null,
  }));
  return {
    feature: input.slug,
    workflowName: input.workflowName,
    started: startedIso,
    deployedUrl: null,
    implementationNotes: null,
    items,
    errorLog: snap.state.errorLog.map((e) => ({
      timestamp: e.timestamp,
      itemKey: e.itemKey,
      message: e.message,
      errorSignature: e.errorSignature ?? null,
    })),
    dependencies: snap.state.dependencies,
    nodeTypes: snap.state.nodeTypes,
    nodeCategories: snap.state.nodeCategories,
    jsonGated: {},
    naByType: snap.state.naByType,
    salvageSurvivors: snap.state.salvageSurvivors,
  };
}

function buildActivityInput(
  itemKey: string,
  attempt: number,
  dag: DagState,
  input: PipelineInput,
  startedIso: string,
  executionId: string,
): NodeActivityInput {
  const pipelineState = buildPipelineState(dag, input, startedIso);
  return {
    itemKey,
    executionId,
    slug: input.slug,
    appRoot: input.appRoot,
    repoRoot: input.repoRoot,
    baseBranch: input.baseBranch,
    specFile: input.specFile,
    attempt,
    effectiveAttempts: attempt,
    environment: { ...input.environment },
    apmContextPath: input.apmContextPath,
    workflowName: input.workflowName,
    pipelineState,
    pipelineSummaries: [],
    preStepRefs: {},
    handlerData: {},
    failureRoutes: {},
    // Failure context fields are populated only for triage dispatches
    // (handled in the future Group B6 cascade).
  } satisfies NodeActivityInput;
}

// ---------------------------------------------------------------------------
// Query projections — derived from DagState.snapshot() each call.
// ---------------------------------------------------------------------------

function projectState(dag: DagState, input: PipelineInput, startedIso: string): StateSnapshot {
  const snap = dag.snapshot();
  return {
    feature: input.slug,
    workflowName: input.workflowName,
    started: startedIso,
    items: snap.state.items.map((i) => ({
      key: i.key,
      label: i.label,
      agent: i.agent ?? null,
      status: i.status,
    })),
    errorLog: snap.state.errorLog.map((e) => ({
      itemKey: e.itemKey,
      message: e.message,
      timestamp: e.timestamp,
    })),
    held: snap.held,
    cancelled: snap.cancelled,
    cancelReason: snap.cancelReason,
  };
}

function projectProgress(dag: DagState): ProgressSnapshot {
  const snap = dag.snapshot();
  let done = 0,
    pending = 0,
    inProgress = 0,
    failed = 0,
    na = 0,
    dormant = 0;
  for (const item of snap.state.items) {
    switch (item.status) {
      case "done":
        done++;
        break;
      case "pending":
        pending++;
        break;
      case "failed":
        failed++;
        break;
      case "na":
        na++;
        break;
      case "dormant":
        dormant++;
        break;
      default:
        // "in-progress" or any future status — surfaces in pending bucket
        // for the dashboard so totals always sum to `total`.
        inProgress++;
        break;
    }
  }
  return {
    total: snap.state.items.length,
    done,
    pending,
    inProgress,
    failed,
    na,
    dormant,
    held: snap.held,
    cancelled: snap.cancelled,
  };
}

function projectNextBatch(dag: DagState): readonly NextBatchItem[] {
  const ready = dag.getReady();
  if (ready.kind !== "items") return [];
  return ready.items.map((i) => ({ key: i.key, label: i.label, agent: i.agent ?? null }));
}

function projectSummary(
  dag: DagState,
  input: PipelineInput,
  startedIso: string,
): SummarySnapshot {
  const snap = dag.snapshot();
  const totals = projectProgress(dag);
  let status: SummarySnapshot["status"] = "running";
  if (snap.cancelled) status = "cancelled";
  else if (snap.held) status = "held";
  else if (totals.failed > 0 && totals.pending === 0 && totals.inProgress === 0) status = "halted";
  else if (totals.done + totals.na + totals.dormant === totals.total) status = "complete";
  return {
    slug: input.slug,
    workflowName: input.workflowName,
    started: startedIso,
    status,
    batchNumber: snap.batchNumber,
    totals,
    pendingApprovals: snap.approvals.filter((a) => a.decision === null).length,
    lastError: snap.state.errorLog.length > 0
      ? snap.state.errorLog[snap.state.errorLog.length - 1]!.message
      : null,
  };
}

// ---------------------------------------------------------------------------
// Triage cascade — workflow-scope failure routing
// ---------------------------------------------------------------------------

/**
 * Build the activity input for a triage dispatch. Mirrors `buildActivityInput`
 * but populates the failure-context fields (`failingNodeKey`, `rawError`, …)
 * that the triage handler reads to classify the upstream failure.
 */
function buildTriageActivityInput(
  dispatch: TriageDispatch,
  attempt: number,
  dag: DagState,
  input: PipelineInput,
  startedIso: string,
  executionId: string,
): NodeActivityInput {
  const pipelineState = buildPipelineState(dag, input, startedIso);
  const base: NodeActivityInput = {
    itemKey: dispatch.triageNodeKey,
    executionId,
    slug: input.slug,
    appRoot: input.appRoot,
    repoRoot: input.repoRoot,
    baseBranch: input.baseBranch,
    specFile: input.specFile,
    attempt,
    effectiveAttempts: attempt,
    environment: { ...input.environment },
    apmContextPath: input.apmContextPath,
    workflowName: input.workflowName,
    pipelineState,
    pipelineSummaries: [],
    preStepRefs: {},
    handlerData: {},
    failingNodeKey: dispatch.failingKey,
    ...(dispatch.failingInvocationId
      ? { failingInvocationId: dispatch.failingInvocationId }
      : {}),
    rawError: dispatch.rawError,
    errorSignature: dispatch.errorSignature,
    failingNodeSummary: dispatch.failingNodeSummary,
    failureRoutes: { ...dispatch.failureRoutes },
    ...(dispatch.structuredFailure !== undefined
      ? { structuredFailure: dispatch.structuredFailure }
      : {}),
  };
  return base;
}

/**
 * Apply a single `DagCommand` to the workflow's `DagState`. Returns a
 * non-empty halt reason when the command halted the run (cycle budget
 * exhausted on `reset-nodes`); otherwise null.
 *
 * Workflow-scope subset:
 *   - `reset-nodes`     → `dag.applyResetNodes` (full halt semantics)
 *   - `salvage-draft`   → `dag.applySalvage`
 *   - `bypass-node`     → `dag.applyBypass`
 *   - `stage-invocation` → no-op (workflow body manages invocation IDs
 *                         via `attemptCounts` + `executionId`; the legacy
 *                         kernel-side staging is unnecessary here).
 *   - `reindex`         → no-op (would require a non-deterministic
 *                         indexer activity; deferred).
 *   - `note-triage-blocked` → no-op (advisory; not required for MVP
 *                         routing correctness).
 *
 * Exported (in addition to being used inside `pipelineWorkflow`) so
 * unit tests can exercise the cycle-budget halt-reason emission
 * without booting a workflow runtime. The function is pure aside from
 * the in-place `DagState` mutation and is safe to call outside
 * workflow context.
 */
export function applyTriageCommand(
  cmd: DagCommand,
  dag: DagState,
  nowIso: string,
): string | null {
  switch (cmd.type) {
    case "reset-nodes": {
      const result = dag.applyResetNodes(
        cmd.seedKey,
        cmd.reason,
        nowIso,
        cmd.maxCycles,
        cmd.logKey,
      );
      if (result.halted) {
        return `triage-halt: reset-nodes cycle budget exhausted for '${cmd.seedKey}' (logKey=${cmd.logKey ?? "reset-nodes"})`;
      }
      return null;
    }
    case "salvage-draft": {
      dag.applySalvage(cmd.failedItemKey, nowIso);
      return null;
    }
    case "bypass-node": {
      dag.applyBypass(cmd.nodeKey, cmd.routeTarget, cmd.reason, nowIso);
      return null;
    }
    case "stage-invocation":
    case "reindex":
    case "note-triage-blocked":
      // Advisory in workflow scope — see function docstring.
      return null;
    default: {
      // Exhaustiveness — TypeScript flags any new DagCommand variant.
      const _exhaustive: never = cmd;
      void _exhaustive;
      return null;
    }
  }
}

/**
 * Run the triage cascade for a batch of newly-failed items. Each
 * failure with a configured triage target gets its own triage activity
 * dispatch (parallel — Promise.all), and the returned commands are
 * applied serially to `dag` so reducer transitions stay deterministic.
 *
 * Returns a non-empty halt reason when a command halted the run, else null.
 */
async function runTriageCascade(
  newlyFailed: ReadonlyArray<{ itemKey: string; result: NodeActivityResult }>,
  dag: DagState,
  input: PipelineInput,
  startedIso: string,
  attemptCounts: Map<string, number>,
  nowIso: string,
  routableWorkflow: RoutableWorkflow,
): Promise<string | null> {
  const dispatches: TriageDispatch[] = [];
  for (const f of newlyFailed) {
    const d = resolveTriageDispatch({
      failingKey: f.itemKey,
      result: f.result,
      workflow: routableWorkflow,
    });
    if (d) dispatches.push(d);
  }
  if (dispatches.length === 0) return null;

  const triagePromises = dispatches.map(async (dispatch) => {
    const attempt = (attemptCounts.get(dispatch.triageNodeKey) ?? 0) + 1;
    attemptCounts.set(dispatch.triageNodeKey, attempt);
    const executionId = makeInvocationId(
      workflowInfo().workflowId,
      dispatch.triageNodeKey,
      attempt,
    );
    const activityInput = buildTriageActivityInput(
      dispatch,
      attempt,
      dag,
      input,
      startedIso,
      executionId,
    );
    const result = await triageActivity(activityInput);
    return { dispatch, result };
  });
  const triageResults = await Promise.all(triagePromises);

  // Apply commands serially for deterministic reducer ordering.
  for (const { dispatch, result } of triageResults) {
    // Mark the triage node itself complete or failed in the DAG. The
    // commands the triage handler emits (reset/salvage/bypass) operate
    // on the *failing* node and its dependents — the triage node only
    // needs to be sealed in DAG state so future batches can re-run it
    // for new failures.
    if (result.outcome === "completed") {
      // Triage nodes are only schedulable via cascade activation, so
      // calling applyComplete on a not-pending item would be a reducer
      // error. Guard via the snapshot; the legacy contract is that
      // triage nodes stay in `pending` and re-fire each time a fresh
      // failure hits them.
    } else {
      // A triage activity that itself fails leaves a paper trail in the
      // errorLog; the legacy kernel surfaces this via the standard
      // failed-item path. We do the same here.
      dag.applyFail(
        dispatch.triageNodeKey,
        result.errorMessage ?? "triage failed",
        nowIso,
      );
    }

    const commands = (result.commands ?? []) as ReadonlyArray<DagCommand>;
    for (const cmd of commands) {
      const halt = applyTriageCommand(cmd, dag, nowIso);
      if (halt) return halt;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Workflow body
// ---------------------------------------------------------------------------

export async function pipelineWorkflow(input: PipelineInput): Promise<PipelineResult> {
  const startedIso = formatIsoFromMs(input.startedMs);
  // Session 5 P2 — rehydrate from a prior snapshot when the workflow
  // was just continued-as-new; otherwise build fresh from compiled nodes.
  const dag = input.priorSnapshot
    ? DagState.fromSnapshot(input.priorSnapshot)
    : DagState.fromInit({
        feature: input.slug,
        workflowName: input.workflowName,
        started: startedIso,
        // The PipelineNodeSpec/CompiledNode delta is read-only-ness on
        // optional array fields; the structurally compatible cast is safe
        // (DagState only reads, never mutates the arrays).
        nodes: input.nodes as unknown as Parameters<typeof DagState.fromInit>[0]["nodes"],
      });

  // Project the input into the shape `domain/failure-routing.ts` expects
  // (`RoutableWorkflow`). Cheap to build once at workflow start; pure
  // structural projection — no I/O.
  const routableWorkflow: RoutableWorkflow = {
    nodes: input.nodes,
    ...(input.default_triage ? { default_triage: input.default_triage } : {}),
    ...(input.default_routes
      ? { default_routes: { ...input.default_routes } }
      : {}),
  };

  // ── Install signal + query handlers FIRST (before any await) ───────
  // Approval registry binds approveGate / rejectGate / pendingApprovals.
  const approvalRegistry = installApprovalRegistry();

  setHandler(holdPipelineSignal, () => {
    dag.markHeld();
  });
  setHandler(resumePipelineSignal, () => {
    dag.markResumed();
  });
  setHandler(cancelPipelineSignal, (reason: string) => {
    dag.markCancelled(reason);
  });

  setHandler(stateQuery, () => projectState(dag, input, startedIso));
  setHandler(progressQuery, () => projectProgress(dag));
  setHandler(nextBatchQuery, () => projectNextBatch(dag));
  setHandler(summaryQuery, () => projectSummary(dag, input, startedIso));

  // Admin updates (Session 5 P4) — mutate-and-return primitives that
  // replace the legacy `npm run pipeline:reset-scripts/resume/recover-elevated`
  // CLI verbs. Each delegates straight to the existing `DagState.applyXxx`
  // reducer and returns its `{halted, cycleCount, ...}` result so the
  // CLI can print operator-facing feedback. Handlers stamp `nowIso`
  // from the deterministic workflow clock; reducers themselves are pure.
  setHandler(resetScriptsUpdate, (args) => {
    const nowIso = formatIsoFromMs(getNowMs());
    return dag.applyResetScripts(args.category, nowIso, args.maxCycles);
  });
  setHandler(resumeAfterElevatedUpdate, (args) => {
    const nowIso = formatIsoFromMs(getNowMs());
    return dag.applyResumeAfterElevated(nowIso, args.maxCycles);
  });
  setHandler(recoverElevatedUpdate, (args) => {
    const nowIso = formatIsoFromMs(getNowMs());
    return dag.applyRecoverElevated(
      args.errorMessage,
      nowIso,
      args.maxFailCount,
      args.maxDevCycles,
    );
  });

  // Per-item attempt counter — workflow-local; survives continue-as-new
  // when the client passes `priorAttemptCounts` on the new incarnation
  // (Session 5 P2). Without that hand-off, attempt numbers would reset
  // mid-feature and downstream telemetry would lose monotonicity.
  const attemptCounts = new Map<string, number>(
    input.priorAttemptCounts ? Object.entries(input.priorAttemptCounts) : [],
  );
  // Safety valve — same magnitude as legacy `policy.max_iterations`. The
  // DAG itself bounds iterations, but a misconfigured DAG that loops on
  // `blocked` would otherwise spin forever.
  const maxIterations = 500;

  // Session 5 P2 — continue-as-new threshold. Temporal's documented
  // soft cap is ~10K events / ~50 MB; we trigger well below at 8K to
  // give a margin for in-flight activities to finish without crossing
  // the hard cap. Tests can lower this via `continueAsNewHistoryThreshold`.
  const canThreshold = input.continueAsNewHistoryThreshold ?? 8000;

  let finalStatus: PipelineFinalStatus = "halted";
  let finalReason = "unspecified";

  try {
    for (let i = 0; i < maxIterations; i++) {
      // (a0) Continue-as-new gate. Checked at the top of each
      //      iteration so we never pre-empt a partially-applied batch.
      //      Pending approvals block CAN — handlers can't be re-bound
      //      mid-flight without losing buffered signals; we wait for
      //      the gate to resolve in this incarnation.
      if (
        workflowInfo().historyLength >= canThreshold &&
        !dag.hasPendingApproval()
      ) {
        const continueInput: PipelineInput = {
          ...input,
          priorSnapshot: dag.snapshot(),
          priorAttemptCounts: Object.fromEntries(attemptCounts),
        };
        // continueAsNew never returns; throws ContinueAsNew internally.
        await continueAsNew<typeof pipelineWorkflow>(continueInput);
      }

      // (a) Hold gate. Cancellation is checked alongside so a cancel
      //     during hold unblocks the loop.
      await condition(() => !dag.isHeld() || dag.isCancelled());

      // (b) Cancellation.
      if (dag.isCancelled()) {
        finalStatus = "cancelled";
        finalReason = dag.getCancelReason() ?? "cancelled";
        break;
      }

      // (c) Bump batch counter for query/telemetry visibility.
      dag.bumpBatch();

      // (d) Schedule next batch.
      const ready = dag.getReady();
      if (ready.kind === "complete") {
        finalStatus = "complete";
        finalReason = "all-items-terminal";
        break;
      }
      if (ready.kind === "blocked") {
        finalStatus = "blocked";
        finalReason = "no-ready-items";
        break;
      }

      // (e) Dispatch each item in parallel. Approval nodes resolve via
      //     awaitApproval; everything else dispatches via the activity
      //     proxy. Each promise produces a `{itemKey, kind, result}` row
      //     the `Promise.all` collects for serial application below.
      type DispatchOutcome =
        | { kind: "activity"; itemKey: string; result: NodeActivityResult }
        | { kind: "approval"; itemKey: string; rejected: false }
        | {
            kind: "approval";
            itemKey: string;
            rejected: true;
            reason: string;
          };

      const dispatchPromises: Array<Promise<DispatchOutcome>> = [];
      for (const item of ready.items) {
        const node = input.nodes[item.key];
        const handlerKind = resolveHandlerKind(node);

        if (handlerKind === "approval") {
          dispatchPromises.push(
            awaitApproval(approvalRegistry, item.key)
              .then(
                () => ({ kind: "approval", itemKey: item.key, rejected: false } as const),
              )
              .catch((err: unknown) => {
                if (err instanceof ApprovalRejectedError) {
                  return {
                    kind: "approval",
                    itemKey: item.key,
                    rejected: true,
                    reason: err.rejectionReason,
                  } as const;
                }
                throw err;
              }),
          );
          continue;
        }

        const attempt = (attemptCounts.get(item.key) ?? 0) + 1;
        attemptCounts.set(item.key, attempt);
        const executionId = makeInvocationId(
          workflowInfo().workflowId,
          item.key,
          attempt,
        );
        const activityInput = buildActivityInput(
          item.key,
          attempt,
          dag,
          input,
          startedIso,
          executionId,
        );
        dispatchPromises.push(
          dispatchNodeActivity(handlerKind, activityInput).then(
            (result) => ({ kind: "activity", itemKey: item.key, result } as const),
          ),
        );
      }

      const outcomes = await Promise.all(dispatchPromises);

      // (f) Apply results to DagState. Done serially so reducer
      //     transitions stay deterministic; the parallelism is in
      //     activity execution, not state mutation.
      const nowIso = formatIsoFromMs(getNowMs());
      let approvalRejection: { itemKey: string; reason: string } | null = null;

      // Track newly-failed items so the triage cascade only fires for
      // failures that surfaced this batch (avoids re-triaging items
      // that were already in `failed` before this iteration).
      const newlyFailed: Array<{
        itemKey: string;
        result: NodeActivityResult;
      }> = [];

      for (const out of outcomes) {
        if (out.kind === "approval") {
          if (out.rejected) {
            approvalRejection ??= { itemKey: out.itemKey, reason: out.reason };
            dag.applyFail(
              out.itemKey,
              `Approval rejected: ${out.reason}`,
              nowIso,
            );
          } else {
            dag.applyComplete(out.itemKey);
          }
          continue;
        }
        const r = out.result;
        if (r.outcome === "completed") {
          dag.applyComplete(out.itemKey);
        } else {
          dag.applyFail(
            out.itemKey,
            r.errorMessage ?? "unspecified failure",
            nowIso,
          );
          newlyFailed.push({ itemKey: out.itemKey, result: r });
        }
      }

      // (g) Triage cascade. For every newly-failed item with a
      //     configured triage target, dispatch the triage activity in
      //     parallel and apply its returned graph-mutation commands.
      //     Halts the workflow loop when a reset/salvage exhausts its
      //     cycle budget.
      if (newlyFailed.length > 0) {
        const cascadeHalt = await runTriageCascade(
          newlyFailed,
          dag,
          input,
          startedIso,
          attemptCounts,
          nowIso,
          routableWorkflow,
        );
        if (cascadeHalt) {
          finalStatus = "halted";
          finalReason = cascadeHalt;
          break;
        }
      }

      // Approval rejections halt by default (most stringent). Workflow
      // node-level on_failure routing is the future enhancement.
      if (approvalRejection) {
        finalStatus = "approval-rejected";
        finalReason = `Gate '${approvalRejection.itemKey}' rejected: ${approvalRejection.reason}`;
        break;
      }
    }

    // Loop fall-through (max iterations exhausted).
    if (finalStatus === "halted" && finalReason === "unspecified") {
      finalReason = `max-iterations (${maxIterations}) exhausted`;
    }

    // Final archive — only on natural completion. Cancelled / rejected
    // / blocked runs leave the workspace untouched for operator
    // inspection.
    if (finalStatus === "complete") {
      try {
        await archiveActivity({
          slug: input.slug,
          appRoot: input.appRoot,
          repoRoot: input.repoRoot,
          baseBranch: input.baseBranch,
        });
      } catch (err) {
        // Archive failure does not invalidate the run — record reason
        // and surface in the result so the post-workflow client step
        // can attempt manual recovery.
        finalReason = `complete-but-archive-failed: ${
          err instanceof Error ? err.message : String(err)
        }`;
      }
    }
  } catch (err) {
    if (isCancellation(err)) {
      // Native Temporal cancellation (handle.cancel()) — distinguish
      // from the structured cancelPipelineSignal path so operators can
      // tell where the cancel came from.
      if (!dag.isCancelled()) {
        dag.markCancelled("temporal-cancellation");
      }
      finalStatus = "cancelled";
      finalReason = dag.getCancelReason() ?? "temporal-cancellation";
      // Propagate so Temporal records the workflow as cancelled rather
      // than completed. Our PipelineResult is unreachable in this
      // branch by design.
      throw err instanceof CancelledFailure
        ? err
        : new CancelledFailure(finalReason);
    }
    throw err;
  }

  return {
    status: finalStatus,
    reason: finalReason,
    batchNumber: dag.getBatchNumber(),
    finalSnapshot: projectState(dag, input, startedIso),
  };
}
