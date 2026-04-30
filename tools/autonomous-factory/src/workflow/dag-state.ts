/**
 * src/workflow/dag-state.ts — Workflow-local DAG state façade.
 *
 * Encapsulates the in-workflow pipeline state and the reducer surface the
 * workflow body calls to drive it. Methods on this class map 1:1 to the
 * discrete state transitions the workflow performs.
 *
 * Determinism contract — every method that emits an `errorLog` entry
 * requires a `now: string` parameter (ISO-8601). The workflow body sources
 * it from `Workflow.now().toISOString()`; tests pass a fixed string. The
 * reducers themselves live in `./domain/transitions.ts` and `./domain/`.
 *
 * `DagState` is a thin façade: it holds an internal `TransitionState`
 * snapshot and replaces it on every reducer call. Snapshots are still
 * structurally immutable (the reducers return new objects); the *holder*
 * is mutable so the workflow body can call `state.applyComplete(key)`
 * imperatively rather than rebinding a variable on every step.
 *
 * No Temporal SDK imports — `DagState` is unit-testable in isolation under
 * Vitest. Time is injected via parameters; cryptographic identity comes
 * from the workflow-safe `error-signature.ts`.
 */

import {
  schedule,
  type ScheduleResult,
  type ScheduleOptions,
} from "./domain/scheduling.js";
import {
  buildInitialState,
  type CompiledNode,
  type InitialState,
} from "./domain/init-state.js";
import {
  completeItem,
  failItem,
  resetNodes,
  resetScripts,
  resumeAfterElevated,
  salvageForDraft,
  bypassNode,
  findInfraPollKey,
  findInfraDevKey,
  type TransitionState,
  type FailItemOptions,
  type FailResult,
  type ResetResult,
  type ResumeElevatedResult,
  type SalvageResult,
  type BypassResult,
} from "./domain/transitions.js";
import { checkCycleBudget } from "./domain/cycle-counter.js";

// ---------------------------------------------------------------------------
// Wire types — distinct from the implementation types so workflow-input
// signatures stay stable across the migration.
// ---------------------------------------------------------------------------

/** Inputs for constructing a fresh `DagState` at workflow start. */
export interface DagInitInputs {
  readonly feature: string;
  readonly workflowName: string;
  /** ISO timestamp (workflow start). */
  readonly started: string;
  /** Compiled-workflow node map (from APM). */
  readonly nodes: Record<string, CompiledNode>;
}

/**
 * Approval-gate state. Stored on `DagState` so the Session 4 signal/query
 * handlers have a single source of truth. Unused this session; methods
 * exist as stubs so the Session 4 workflow body can already wire signals
 * to them.
 */
export interface ApprovalRequest {
  readonly gateKey: string;
  readonly requestedAtMs: number;
  decision: "approved" | "rejected" | null;
  resolvedAtMs: number | null;
}

/** Frozen snapshot returned by `snapshot()` (Session 4 query handler). */
export interface DagSnapshot {
  readonly state: TransitionState;
  readonly cycleCounters: Readonly<Record<string, number>>;
  readonly approvals: ReadonlyArray<ApprovalRequest>;
  readonly held: boolean;
  readonly cancelled: boolean;
  readonly cancelReason: string | null;
  readonly batchNumber: number;
}

/** Result of admin-shaped reducers — mirrors `kernel/admin.ts#AdminResult`. */
export interface AdminResetScriptsResult {
  readonly cycleCount: number;
  readonly halted: boolean;
  readonly resetKeys: ReadonlyArray<string>;
}
export interface AdminResumeElevatedResult {
  readonly cycleCount: number;
  readonly halted: boolean;
  readonly resetCount: number;
}
export interface AdminRecoverElevatedResult {
  readonly cycleCount: number;
  readonly halted: boolean;
  readonly failCount?: number;
}

// ---------------------------------------------------------------------------
// DagState
// ---------------------------------------------------------------------------

export class DagState {
  /** Inner immutable snapshot — replaced on every reducer call. */
  private state: TransitionState;
  /** Persisted cycle counts keyed by logKey. Mirrors `kernel/admin.ts`. */
  private cycleCounters: Record<string, number>;
  /** Pending and resolved approval requests, keyed by gateKey. */
  private approvals: Map<string, ApprovalRequest>;
  /** Held: true once `holdPipelineSignal` arrives; cleared by resume. */
  private held: boolean = false;
  /** Cancellation: set once `cancelPipelineSignal` arrives. The workflow
   *  body checks this at the top of each iteration and returns. */
  private cancelled: boolean = false;
  private cancelReason: string | null = null;
  /** Batch counter — bumped at the top of each loop iteration. Surfaces
   *  on the `summary` query for operator visibility. */
  private batchNumber: number = 0;

  // -------------------------------------------------------------------
  // Construction
  // -------------------------------------------------------------------

  /**
   * Build a fresh `DagState` from compiled workflow nodes. Internally
   * delegates to `buildInitialState()` so the DAG topology, node typing,
   * salvage/dormant/required-artifact bookkeeping is identical to the
   * legacy kernel's bootstrap.
   */
  static fromInit(inputs: DagInitInputs): DagState {
    const seed = buildInitialState(inputs);
    return new DagState(seed);
  }

  /**
   * Rehydrate from an already-persisted state. The Temporal workflow
   * never calls this in production (history replay handles persistence);
   * exists for parity tests that load a fixture state directly.
   */
  static fromState(state: TransitionState): DagState {
    return new DagState(state);
  }

  /**
   * Rehydrate from a `snapshot()` payload — used by Session 5 P2
   * continue-as-new to carry full dynamic state (held / cancelled /
   * batch counter / cycle counters / approvals) across workflow
   * incarnations. `fromState` would lose these.
   *
   * Approvals revive in their persisted state; pending requests
   * return to `pending` and the workflow body re-installs handlers
   * before the first await (Temporal ordering rule).
   */
  static fromSnapshot(snap: DagSnapshot): DagState {
    // Inject cycleCounters via the InitialState-shaped path so the
    // private constructor's `counters ? { ...counters } : {}` branch
    // copies them. Cast retains structural typing.
    const seed = {
      ...snap.state,
      cycleCounters: snap.cycleCounters,
    } as unknown as TransitionState;
    const dag = new DagState(seed);
    dag.held = snap.held;
    dag.cancelled = snap.cancelled;
    dag.cancelReason = snap.cancelReason;
    dag.batchNumber = snap.batchNumber;
    for (const a of snap.approvals) {
      dag.approvals.set(a.gateKey, { ...a });
    }
    return dag;
  }

  private constructor(seed: TransitionState | InitialState) {
    // Normalise: the InitialState shape carries `cycleCounters` separately,
    // but TransitionState allows pass-through fields. Treat the inner
    // snapshot as opaque-but-typed.
    this.state = seed as TransitionState;
    const counters = (seed as { cycleCounters?: Record<string, number> }).cycleCounters;
    this.cycleCounters = counters ? { ...counters } : {};
    this.approvals = new Map();
  }

  // -------------------------------------------------------------------
  // Scheduling
  // -------------------------------------------------------------------

  /**
   * Compute the next batch of dispatchable items. Forwards to the pure
   * `schedule()` reducer; optional `opts` carry the artifact-bus
   * producer-readiness gate (workflow body builds these per tick).
   */
  getReady(opts?: ScheduleOptions): ScheduleResult {
    return schedule(this.state.items, this.state.dependencies, opts);
  }

  // -------------------------------------------------------------------
  // DAG-shape transitions
  // -------------------------------------------------------------------

  applyComplete(itemKey: string): void {
    const result = completeItem(this.state, itemKey);
    this.state = result.state;
  }

  applyFail(
    itemKey: string,
    message: string,
    now: string,
    options?: FailItemOptions,
    signatureFn?: (msg: string) => string,
  ): FailResult {
    const result = failItem(this.state, itemKey, message, now, options ?? {}, signatureFn);
    this.state = result.state;
    return result;
  }

  applyResetNodes(
    seedKey: string,
    reason: string,
    now: string,
    maxCycles: number = 5,
    logKey: string = "reset-nodes",
    signatureFn?: (msg: string) => string,
  ): ResetResult {
    const result = resetNodes(this.state, seedKey, reason, now, maxCycles, logKey, signatureFn);
    this.state = result.state;
    if (!result.halted && result.resetKeys.length > 0) {
      this.bumpCounter(logKey, result.cycleCount);
    }
    return result;
  }

  applyBypass(
    nodeKey: string,
    routeTarget: string,
    reason: string,
    now: string,
    signatureFn?: (msg: string) => string,
  ): BypassResult {
    const result = bypassNode(this.state, nodeKey, routeTarget, reason, now, signatureFn);
    this.state = result.state;
    return result;
  }

  applySalvage(failedItemKey: string, now: string): SalvageResult {
    const result = salvageForDraft(this.state, failedItemKey, now);
    this.state = result.state;
    return result;
  }

  // -------------------------------------------------------------------
  // Admin-shape reducers (back the future Session 4 signal handlers)
  //
  // Mirror `kernel/admin.ts#applyAdminCommand` semantics 1:1 — including
  // the cycleCounter bookkeeping. Session 4 only adds signal/query
  // plumbing; no new reducer logic should be needed.
  // -------------------------------------------------------------------

  applyResetScripts(
    category: string,
    now: string,
    maxCycles: number = 10,
  ): AdminResetScriptsResult {
    const logKey = `reset-scripts:${category}`;
    const result = resetScripts(this.state, category, now, maxCycles);
    this.state = result.state;
    if (!result.halted) this.bumpCounter(logKey, result.cycleCount);
    return {
      cycleCount: result.cycleCount,
      halted: result.halted,
      resetKeys: result.resetKeys,
    };
  }

  applyResumeAfterElevated(
    now: string,
    maxCycles: number = 5,
  ): AdminResumeElevatedResult {
    const logKey = "resume-elevated";
    const result: ResumeElevatedResult = resumeAfterElevated(this.state, now, maxCycles);
    this.state = result.state;
    if (!result.halted) this.bumpCounter(logKey, result.cycleCount);
    return {
      cycleCount: result.cycleCount,
      halted: result.halted,
      resetCount: result.resetCount,
    };
  }

  applyRecoverElevated(
    errorMessage: string,
    now: string,
    maxFailCount: number = 10,
    maxDevCycles: number = 5,
  ): AdminRecoverElevatedResult {
    // Step 1: record failure on the infra CI poll node (if any).
    const infraPollKey = findInfraPollKey(this.state);
    if (infraPollKey) {
      const failed = failItem(
        this.state,
        infraPollKey,
        `Elevated apply failed: ${errorMessage}`,
        now,
        maxFailCount,
      );
      this.state = failed.state;
      if (failed.halted) {
        return { cycleCount: 0, halted: true, failCount: failed.failCount };
      }
    }
    // Step 2: cascade-reset from the infra dev entry node.
    const infraDevKey = findInfraDevKey(this.state);
    if (!infraDevKey) {
      throw new Error("Cannot recover elevated state: no infrastructure dev node found in DAG.");
    }
    const reason = `Elevated infra apply failed — agent will diagnose and fix TF code. Error: ${errorMessage.slice(0, 200)}`;
    const reset = resetNodes(
      this.state,
      infraDevKey,
      reason,
      now,
      maxDevCycles,
      "reset-for-dev",
    );
    this.state = reset.state;
    if (!reset.halted) this.bumpCounter("reset-for-dev", reset.cycleCount);
    return { cycleCount: reset.cycleCount, halted: reset.halted };
  }

  // -------------------------------------------------------------------
  // Predicates / queries
  // -------------------------------------------------------------------

  /** True when every item is in a terminal state (`done` / `na` / `dormant`). */
  isComplete(): boolean {
    return this.state.items.every(
      (i) => i.status === "done" || i.status === "na" || i.status === "dormant",
    );
  }

  /** True when at least one item is in `failed` status. */
  hasFailed(): boolean {
    return this.state.items.some((i) => i.status === "failed");
  }

  /** Return the most recent errorLog entry, or null. */
  lastFailure(): TransitionState["errorLog"][number] | null {
    const log = this.state.errorLog;
    return log.length > 0 ? log[log.length - 1]! : null;
  }

  /** True when the cycle budget for `logKey` is exhausted. */
  cycleBudgetExceeded(logKey: string, maxCycles: number): boolean {
    return checkCycleBudget(this.state.errorLog, logKey, maxCycles).halted;
  }

  /** Frozen, JSON-serializable snapshot for query handlers / persistence. */
  snapshot(): DagSnapshot {
    return Object.freeze({
      state: structuredClone(this.state),
      cycleCounters: { ...this.cycleCounters },
      approvals: Array.from(this.approvals.values()).map((a) => ({ ...a })),
      held: this.held,
      cancelled: this.cancelled,
      cancelReason: this.cancelReason,
      batchNumber: this.batchNumber,
    });
  }

  // -------------------------------------------------------------------
  // Hold / cancel — Session 4 signal handlers drive these.
  // -------------------------------------------------------------------

  /** True after `holdPipelineSignal` arrived; the workflow body blocks
   *  at the top of each iteration via `condition(() => !dag.isHeld())`. */
  isHeld(): boolean {
    return this.held;
  }

  markHeld(): void {
    this.held = true;
  }

  markResumed(): void {
    this.held = false;
  }

  /** True after `cancelPipelineSignal` (or workflow cancellation). */
  isCancelled(): boolean {
    return this.cancelled;
  }

  getCancelReason(): string | null {
    return this.cancelReason;
  }

  markCancelled(reason: string): void {
    if (this.cancelled) return;
    this.cancelled = true;
    this.cancelReason = reason;
  }

  /** Increment the batch counter. Workflow body calls this once per
   *  loop iteration, after the hold gate clears. */
  bumpBatch(): number {
    this.batchNumber += 1;
    return this.batchNumber;
  }

  getBatchNumber(): number {
    return this.batchNumber;
  }

  // -------------------------------------------------------------------
  // Approval gates (stubs — drive Session 4 signal handlers)
  // -------------------------------------------------------------------

  /** Register a pending approval request. Idempotent — re-registering
   *  the same gate is a no-op (the original `requestedAtMs` is preserved). */
  markApprovalRequested(gateKey: string, requestedAtMs: number): void {
    if (this.approvals.has(gateKey)) return;
    this.approvals.set(gateKey, {
      gateKey,
      requestedAtMs,
      decision: null,
      resolvedAtMs: null,
    });
  }

  /** Resolve a pending approval. Throws if the gate is unknown. */
  markApprovalResolved(
    gateKey: string,
    decision: "approved" | "rejected",
    resolvedAtMs: number,
  ): void {
    const req = this.approvals.get(gateKey);
    if (!req) throw new Error(`Unknown approval gate "${gateKey}"`);
    req.decision = decision;
    req.resolvedAtMs = resolvedAtMs;
  }

  /** True when at least one approval is still awaiting decision. */
  hasPendingApproval(): boolean {
    for (const a of this.approvals.values()) {
      if (a.decision === null) return true;
    }
    return false;
  }

  // -------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------

  private bumpCounter(logKey: string, count: number): void {
    this.cycleCounters[logKey] = count;
  }
}
