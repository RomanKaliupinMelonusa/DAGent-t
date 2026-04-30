/**
 * types.ts — Shared TypeScript interfaces for the orchestrator.
 *
 * These types mirror the runtime shapes produced by the JsonFileStateStore
 * adapter (src/adapters/json-file-state-store.ts) and consumed by the
 * kernel, loop, and handlers.
 */
// ---------------------------------------------------------------------------
// Reset operation keys — shared protocol between the state adapter and kernel
// ---------------------------------------------------------------------------
/**
 * Synthetic `itemKey` values written to `errorLog` by the state machine's
 * reset functions. These are NOT real DAG node keys — they're operation
 * markers used for cycle counting and context injection.
 */
export const RESET_OPS = {
    /** resetNodes() for upstream dev redevelopment */
    RESET_FOR_DEV: "reset-for-dev",
    /** resetNodes() for triage reroute */
    RESET_FOR_REROUTE: "reset-for-reroute",
    /** bypassNode() — failing parent flipped to `na` to unlock a downstream
     *  triage reroute target. Cycle counter is bookkeeping-only (does NOT
     *  consume the user's `max_reroutes` budget). */
    BYPASS_FOR_REROUTE: "bypass-for-reroute",
    /** resetNodes() emitted by the seal hook when a triage-reroute target
     *  completes successfully — re-pendings the bypassed parent so the
     *  fix is validated against the gate. Has its own dedicated cycle
     *  budget (default 3) distinct from `RESET_FOR_REROUTE`. */
    RESET_AFTER_FIX: "reset-after-fix",
    /** Legacy error-log marker — kept for backward compat with old state files. */
    RESET_PHASES: "reset-phases",
    /** A4 — sentinel itemKey used by the blocked-verdict circuit breaker.
     *  Each $BLOCKED triage outcome appends one entry tagged with this
     *  itemKey + a `[failing:<nodeKey>] [domain:<domain>] reason` message.
     *  Counted per-failing-node by the triage handler to halt on repeat. */
    TRIAGE_BLOCKED: "triage-blocked",
};
/** All reset-operation keys that indicate a redevelopment cycle */
export const REDEVELOPMENT_RESET_OPS = [
    RESET_OPS.RESET_FOR_DEV,
    RESET_OPS.RESET_FOR_REROUTE,
];
/**
 * Extract `diagnostic_trace` from a JSON error message, if present.
 * Used by the circuit breaker to normalize error comparisons.
 */
export function extractDiagnosticTrace(message) {
    try {
        const parsed = JSON.parse(message);
        if (parsed && typeof parsed === "object" && typeof parsed.diagnostic_trace === "string") {
            return parsed.diagnostic_trace;
        }
    }
    catch { /* not JSON */ }
    return null;
}
//# sourceMappingURL=types.js.map