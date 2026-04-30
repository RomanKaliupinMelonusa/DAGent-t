/**
 * src/temporal/workflow/approval-pattern.ts — `awaitApproval` helper.
 *
 * Replaces the legacy `signal: "approval-pending"` handler protocol
 * with native Temporal primitives. The workflow body calls
 * `awaitApproval(gateKey)`; external clients drive resolution via the
 * `approveGateSignal` / `rejectGateSignal` signals defined in
 * [signals.ts](./signals.ts).
 *
 * Architecture
 * ------------
 *
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  Workflow body                                               │
 *   │                                                              │
 *   │   const reg = installApprovalRegistry();                     │
 *   │   …                                                          │
 *   │   await awaitApproval(reg, "await-infra-approval");          │
 *   │   // throws ApprovalRejectedError if the gate is rejected.   │
 *   └─────────────────────────────────────────────────────────────┘
 *           │                                  ▲
 *           │ register(gateKey)                │ resolve(gateKey)
 *           ▼                                  │
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  ApprovalRegistry (pure, replay-safe state)                  │
 *   │  - tracks pending gateKeys                                   │
 *   │  - holds resolution decisions until awaitApproval reads them │
 *   └─────────────────────────────────────────────────────────────┘
 *           ▲                                  ▲
 *           │ snapshot() — bound to            │ resolve / reject —
 *           │ pendingApprovalsQuery            │ bound to signals
 *           │                                  │
 *   external query                       external signal
 *
 * Why a registry rather than per-call closure state
 * --------------------------------------------------
 *
 * Multiple `awaitApproval` calls can be interleaved by the same
 * workflow (e.g. infra-approval AND deploy-approval). Signals carry a
 * `gateKey` argument so a single signal handler routes to the right
 * waiter. Centralising the state in a registry means:
 *
 *   1. The query handler returns a coherent snapshot of ALL waiters.
 *   2. Signals delivered before `awaitApproval` is called are buffered
 *      (idempotent resolution — the registry remembers the verdict
 *      and `awaitApproval` returns immediately on the next replay).
 *   3. Replay determinism is preserved: every state change is driven
 *      by an event the SDK records (signal delivery), so the replayer
 *      reproduces the same `condition()` resolution order.
 *
 * Workflow scope discipline
 * -------------------------
 *
 * Anything in this file may run during replay. The lint rule bans the
 * `Date` global, `Math.random`, `setTimeout`, and the entire fs /
 * network module surface. We avoid wall-clock timestamps entirely —
 * registrations are ordered by a monotonic counter the registry
 * itself manages, which Temporal replay reproduces deterministically.
 */

import { condition, setHandler } from "@temporalio/workflow";
import { approveGateSignal, rejectGateSignal } from "./signals.js";
import { pendingApprovalsQuery, type PendingApproval } from "./queries.js";

/**
 * Thrown by `awaitApproval` when the gate is rejected via
 * `rejectGateSignal`. The workflow body decides whether to halt the
 * pipeline, route to triage, or retry — Temporal failure handling is
 * the workflow's concern, not the helper's.
 */
export class ApprovalRejectedError extends Error {
  constructor(
    public readonly gateKey: string,
    public readonly rejectionReason: string,
  ) {
    super(`approval gate '${gateKey}' rejected: ${rejectionReason}`);
    this.name = "ApprovalRejectedError";
  }
}

type ResolutionState =
  | { readonly kind: "pending"; readonly registeredSeq: number }
  | { readonly kind: "approved" }
  | { readonly kind: "rejected"; readonly reason: string };

/**
 * Pure in-memory registry. Exported so the workflow body can install
 * exactly one instance and bind both the signals and the query
 * handlers to it. Also re-exported for unit tests — the registry has
 * no Temporal dependency, so its semantics can be exercised without
 * a workflow context.
 */
export class ApprovalRegistry {
  private readonly state = new Map<string, ResolutionState>();
  private nextSeq = 0;

  /** Mark a gate as awaited. Idempotent — repeated registration with
   *  the same key keeps the original `registeredSeq` so query results
   *  are stable across `awaitApproval` retries. */
  register(gateKey: string): void {
    const existing = this.state.get(gateKey);
    if (existing) return;
    this.state.set(gateKey, { kind: "pending", registeredSeq: this.nextSeq++ });
  }

  /** Apply an approval verdict. No-op if the gate is already
   *  resolved — the first verdict wins. Approval can also arrive
   *  BEFORE the workflow registers the gate (signals are buffered
   *  by Temporal); we record the verdict so the eventual
   *  `awaitApproval` call reads it without blocking. */
  approve(gateKey: string): void {
    const existing = this.state.get(gateKey);
    if (existing && existing.kind !== "pending") return;
    this.state.set(gateKey, { kind: "approved" });
  }

  /** Apply a rejection verdict. First verdict wins. Same buffering
   *  semantics as `approve`. */
  reject(gateKey: string, reason: string): void {
    const existing = this.state.get(gateKey);
    if (existing && existing.kind !== "pending") return;
    this.state.set(gateKey, { kind: "rejected", reason });
  }

  /** True iff a verdict has been applied for `gateKey`. */
  isResolved(gateKey: string): boolean {
    const s = this.state.get(gateKey);
    return s !== undefined && s.kind !== "pending";
  }

  /** Drain a resolved verdict. Throws `ApprovalRejectedError` on
   *  rejection. Returns void on approve. Calling `take` while the
   *  gate is still pending is a programmer error. */
  take(gateKey: string): void {
    const s = this.state.get(gateKey);
    if (!s) throw new Error(`approval registry: unknown gate '${gateKey}'`);
    if (s.kind === "pending") {
      throw new Error(
        `approval registry: take('${gateKey}') called while pending`,
      );
    }
    if (s.kind === "rejected") {
      // Drop the entry: future `awaitApproval(gateKey)` calls re-register
      // and re-await, matching the legacy "operator can retry the gate"
      // ergonomics. The thrown error short-circuits the current call.
      this.state.delete(gateKey);
      throw new ApprovalRejectedError(gateKey, s.reason);
    }
    // Drop the entry so subsequent queries don't surface a satisfied
    // gate. Keeps `pendingApprovals` queries lean across the workflow
    // lifetime.
    this.state.delete(gateKey);
  }

  /** Snapshot for the `pendingApprovalsQuery` handler. Stable order
   *  (insertion order — Map's spec guarantee) so query consumers
   *  observe a deterministic listing. */
  snapshot(): readonly PendingApproval[] {
    const out: PendingApproval[] = [];
    for (const [gateKey, s] of this.state.entries()) {
      if (s.kind === "pending") {
        out.push({ gateKey, registeredSeq: s.registeredSeq });
      }
    }
    return out;
  }
}

/**
 * Install signal + query handlers backed by a fresh registry. Call
 * once at workflow entry, BEFORE the first `awaitApproval`. The
 * returned registry is the handle the workflow body passes to
 * `awaitApproval`.
 *
 * Wiring shape:
 *   - `approveGateSignal(gateKey)`            → registry.approve
 *   - `rejectGateSignal(gateKey, reason)`     → registry.reject
 *   - `pendingApprovalsQuery()`               → registry.snapshot
 */
export function installApprovalRegistry(): ApprovalRegistry {
  const registry = new ApprovalRegistry();
  setHandler(approveGateSignal, (gateKey: string) => registry.approve(gateKey));
  setHandler(rejectGateSignal, (gateKey: string, reason: string) =>
    registry.reject(gateKey, reason),
  );
  setHandler(pendingApprovalsQuery, () => registry.snapshot());
  return registry;
}

/**
 * Block the workflow until an external client signals approval (or
 * rejection) for `gateKey`. Returns when approved; throws
 * `ApprovalRejectedError` when rejected.
 *
 * Buffer-safe: a signal delivered BEFORE the workflow reaches this
 * line is still respected — `condition` checks the predicate
 * immediately and only suspends if it's false.
 */
export async function awaitApproval(
  registry: ApprovalRegistry,
  gateKey: string,
): Promise<void> {
  registry.register(gateKey);
  await condition(() => registry.isResolved(gateKey));
  registry.take(gateKey); // throws on rejection
}
