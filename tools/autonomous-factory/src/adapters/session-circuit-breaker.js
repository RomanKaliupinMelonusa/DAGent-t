/**
 * adapters/session-circuit-breaker.ts — CognitiveBreaker implementation.
 *
 * Extracted from session-events.ts for Phase 1 clean-up. The runtime
 * behaviour is identical:
 *   - recordCall increments the category count and fires `onTrip` exactly
 *     once when the running total reaches `hard`.
 *   - `shouldWarnSoft` is a one-shot boolean that callers poll on each
 *     tool-complete event to inject a soft-limit frustration prompt.
 *
 * The soft/hard fallbacks remain exported so the agent-prompt factory
 * and handler limits resolver can keep using the same constants.
 */
/**
 * Absolute last-resort fallback thresholds. Only used when apm.yml has
 * neither per-agent toolLimits nor config.defaultToolLimits. Real
 * configuration belongs in apm.yml.
 */
export const TOOL_LIMIT_FALLBACK_SOFT = 30;
export const TOOL_LIMIT_FALLBACK_HARD = 40;
export class SessionCircuitBreaker {
    soft;
    hard;
    onTrip;
    _tripped = false;
    _totalCalls = 0;
    _softFired = false;
    constructor(soft, hard, onTrip) {
        this.soft = soft;
        this.hard = hard;
        this.onTrip = onTrip;
    }
    get tripped() { return this._tripped; }
    recordCall(category, toolCounts) {
        toolCounts[category] = (toolCounts[category] ?? 0) + 1;
        this._totalCalls = Object.values(toolCounts).reduce((a, b) => a + b, 0);
        if (this._totalCalls >= this.hard && !this._tripped) {
            this._tripped = true;
            this.onTrip(this._totalCalls);
        }
    }
    get shouldWarnSoft() {
        if (this._softFired || this._totalCalls < this.soft)
            return false;
        this._softFired = true;
        return true;
    }
}
//# sourceMappingURL=session-circuit-breaker.js.map