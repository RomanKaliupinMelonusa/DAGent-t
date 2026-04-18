/**
 * domain/approval-sla.ts — Pure helpers for Phase 4 approval SLA policy.
 *
 * Approval gates pause the orchestrator (loop exits with `approval-pending`).
 * The watchdog/external supervisor is responsible for re-waking the pipeline
 * on a timer; these helpers resolve the SLA effective configuration and
 * decide whether a pending approval has exceeded its deadline.
 *
 * Pure — no I/O, no side effects. Consumed by the watchdog and by tests.
 */

/** Minimal shape of an approval workflow node needed for SLA resolution. */
export interface ApprovalNodeLike {
  readonly timeout_hours?: number;
  readonly on_timeout?: "salvage" | "fail" | "halt";
}

/** Minimal shape of the apm policy block needed for SLA resolution. */
export interface ApprovalPolicyLike {
  readonly approval_default_timeout_hours?: number;
  readonly approval_default_on_timeout?: "salvage" | "fail" | "halt";
}

/** Resolved SLA for a single approval node. */
export interface ResolvedApprovalSla {
  readonly timeoutHours: number | null;
  readonly onTimeout: "salvage" | "fail" | "halt";
}

/**
 * Resolve the effective SLA for an approval node.
 *
 * Resolution order:
 *   1. Per-node `timeout_hours` / `on_timeout`
 *   2. Pipeline `config.policy.approval_default_*`
 *   3. Code default: `onTimeout = "halt"`, no timeout
 */
export function resolveApprovalSla(
  node: ApprovalNodeLike | undefined,
  policy: ApprovalPolicyLike | undefined,
): ResolvedApprovalSla {
  const timeoutHours = node?.timeout_hours
    ?? policy?.approval_default_timeout_hours
    ?? null;
  const onTimeout = node?.on_timeout
    ?? policy?.approval_default_on_timeout
    ?? "halt";
  return { timeoutHours, onTimeout };
}

/** Result of an SLA expiry check. */
export interface ApprovalSlaStatus {
  readonly expired: boolean;
  readonly elapsedMs: number;
  readonly deadlineMs: number | null;
}

/**
 * Determine whether an approval-pending gate has exceeded its SLA.
 *
 * @param nowMs - Current epoch millis
 * @param requestedAtMs - Epoch millis when approval became pending
 * @param timeoutHours - Resolved SLA in hours (null = never expires)
 */
export function checkApprovalExpired(
  nowMs: number,
  requestedAtMs: number,
  timeoutHours: number | null,
): ApprovalSlaStatus {
  const elapsedMs = Math.max(0, nowMs - requestedAtMs);
  if (timeoutHours === null) {
    return { expired: false, elapsedMs, deadlineMs: null };
  }
  const deadlineMs = timeoutHours * 60 * 60 * 1000;
  return {
    expired: elapsedMs >= deadlineMs,
    elapsedMs,
    deadlineMs,
  };
}
