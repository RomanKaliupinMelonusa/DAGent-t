/**
 * reporting/format.ts — Formatting helpers for durations, outcomes, and USD.
 */
/** Format milliseconds as human-readable duration */
export function formatDuration(ms) {
    if (ms < 1000)
        return `${ms}ms`;
    const secs = Math.round(ms / 1000);
    if (secs < 60)
        return `${secs}s`;
    const mins = Math.floor(secs / 60);
    const remSecs = secs % 60;
    return remSecs > 0 ? `${mins}m ${remSecs}s` : `${mins}m`;
}
/** Emoji for outcome */
export function outcomeIcon(outcome) {
    return outcome === "completed" ? "✅" : outcome === "failed" ? "❌" : "💥";
}
/** Check if a step was a barrier sync point (zero-execution DAG join) */
export function isBarrierStep(item) {
    return item.intents.some((i) => i.startsWith("barrier-sync"));
}
/** Icon for a step, with barrier override */
export function stepIcon(item) {
    if (isBarrierStep(item))
        return "⊕";
    return outcomeIcon(item.outcome);
}
/** Format a number as a USD string with 4 decimal places */
export function formatUsd(amount) {
    return `$${amount.toFixed(4)}`;
}
//# sourceMappingURL=format.js.map