/**
 * triage/context-builder.ts — Context composition for failure cycles.
 *
 * Phase 6 — `composeTriageContext` and `renderTriageHandoffMarkdown` were
 * deleted. Re-entrance prose no longer flows through `pendingContext`;
 * instead the triage handler writes the structured `triage-handoff` JSON
 * artifact directly and the materialize-inputs middleware copies it into
 * the rerouted node's `inputs/` dir. The bulk of this file's narrative
 * builders (`buildRetryContext`, `buildDownstreamFailureContext`,
 * `buildDownstreamFailureContextRaw`, `buildRevertWarning`,
 * `checkRetryDedup`) became dead code with that change and were removed
 * in Phase 8 cleanup.
 *
 * Remaining exports:
 *   - buildTriageRejectionContext — triage reroute notification used by the
 *     file-triage-artifact-loader (still consumed by the
 *     `consumes_reroute → rejection-context` flow).
 *   - buildPhaseRejectionContext / buildInfraRollbackContext — deprecated
 *     aliases retained for external callers.
 *   - computeEffectiveDevAttempts — counter used by the loader to report
 *     persisted dev cycle counts.
 */
import { RESET_OPS, REDEVELOPMENT_RESET_OPS } from "../types.js";
// Direct import of the file-state I/O helpers. `context-builder` is part of
// the triage subsystem and is allowed to read state synchronously; wrapping
// it behind the StateStore port would force every caller to thread the port
// through. `readStateOrThrow` throws on missing files (catch-able below);
// the old CLI-backed `readState` would call process.exit mid-session.
import { readStateOrThrow } from "../adapters/file-state/io.js";
// ---------------------------------------------------------------------------
// Triage rejection context (reroute notification)
// ---------------------------------------------------------------------------
/**
 * Build triage-rejection context when an agent is re-invoked after a
 * triage reroute reset nodes for redevelopment.
 * Returns the rejection reason so the agent knows what to fix.
 *
 * Phase F — when `state.artifacts` contains a reachable lineage from the
 * triage reset's parent invocation, render the invocation ancestry tree
 * so the agent sees the full failure chain (triage → debug → unit-test →
 * runner[fail]) without parsing errorLog prose.
 *
 * @param slug - Feature slug
 * @param narrative - Domain-specific explanation injected into the prompt.
 *   Default: generic "previous deployment wave failed" message.
 */
export async function buildTriageRejectionContext(slug, narrative) {
    try {
        const state = readStateOrThrow(slug);
        // Check both legacy RESET_PHASES entries and new RESET_FOR_REROUTE entries
        const rejectionEntries = state.errorLog.filter((e) => e.itemKey === RESET_OPS.RESET_PHASES || e.itemKey === RESET_OPS.RESET_FOR_REROUTE);
        if (rejectionEntries.length === 0)
            return "";
        const latest = rejectionEntries[rejectionEntries.length - 1];
        const header = narrative
            ?? "A downstream failure triggered redevelopment:";
        const lineageBlock = renderTriageLineageBlock(state);
        return (`\n\n## ⚠️ TRIAGE REROUTE — REDEVELOPMENT REQUIRED\n`
            + `${header}\n\n`
            + `> ${latest.message}\n\n`
            + lineageBlock
            + `You MUST address this requirement before completing this task.`);
    }
    catch {
        return "";
    }
}
/**
 * Walk `state.artifacts` backward from the most recent triage-category
 * completed invocation to produce a newest→oldest ancestry list. Returns
 * an empty string when the ledger doesn't have enough information to
 * reconstruct a chain (e.g. very old features pre-ledger).
 */
function renderTriageLineageBlock(state) {
    const records = state.artifacts;
    if (!records)
        return "";
    const all = Object.values(records);
    if (all.length === 0)
        return "";
    // Find the latest triage invocation (by ULID order = chronological). If
    // none, fall back to the latest failed invocation — either way the walk
    // gives the agent concrete lineage.
    const sorted = all.slice().sort((a, b) => (a.invocationId < b.invocationId ? 1 : -1));
    const head = sorted.find((r) => /triage/i.test(r.nodeKey)) ??
        sorted.find((r) => r.outcome === "failed") ??
        sorted[0];
    const chain = [];
    const seen = new Set();
    let cursor = head.invocationId;
    while (cursor && !seen.has(cursor)) {
        seen.add(cursor);
        const rec = records[cursor];
        if (!rec)
            break;
        chain.push({ nodeKey: rec.nodeKey, invocationId: rec.invocationId, outcome: rec.outcome });
        cursor = rec.parentInvocationId;
    }
    if (chain.length <= 1)
        return "";
    const lines = [
        "**Invocation lineage (newest → oldest):**",
        ...chain.map((l) => {
            const outcome = l.outcome ? ` [${l.outcome}]` : "";
            return `  · ${l.nodeKey}${outcome}  (${l.invocationId.slice(0, 16)}…)`;
        }),
        "",
    ];
    return lines.join("\n") + "\n";
}
/** @deprecated Use `buildTriageRejectionContext`. */
export const buildPhaseRejectionContext = buildTriageRejectionContext;
/** @deprecated Use `buildTriageRejectionContext`. */
export const buildInfraRollbackContext = (slug) => buildTriageRejectionContext(slug, "The previous application deployment wave failed because the following infrastructure was missing or misconfigured:");
// ---------------------------------------------------------------------------
// Effective attempt counter (migrated from context-injection.ts)
// ---------------------------------------------------------------------------
/**
 * Compute the effective attempt count for items that track persisted cycles.
 * Combines in-memory attemptCounts (resets on orchestrator restart) with
 * persisted redevelopment cycle count from state (survives restarts).
 *
 * When `allowsRevertBypass` is true, persisted cycles are factored in.
 * Otherwise returns inMemoryAttempts.
 */
export async function computeEffectiveDevAttempts(itemKey, inMemoryAttempts, slug, allowsRevertBypass) {
    if (!allowsRevertBypass)
        return inMemoryAttempts;
    try {
        const pipeState = readStateOrThrow(slug);
        const persistedCycles = pipeState.errorLog.filter((e) => REDEVELOPMENT_RESET_OPS.includes(e.itemKey)).length;
        return Math.max(inMemoryAttempts, persistedCycles);
    }
    catch {
        return inMemoryAttempts;
    }
}
//# sourceMappingURL=context-builder.js.map