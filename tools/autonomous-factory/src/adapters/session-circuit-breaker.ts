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

import type { CognitiveBreaker } from "../ports/cognitive-breaker.js";
import {
  TOOL_LIMIT_FALLBACK_SOFT,
  TOOL_LIMIT_FALLBACK_HARD,
} from "../harness/tool-limits.js";

// Re-export for adapter consumers (worker, copilot-session-runner).
export { TOOL_LIMIT_FALLBACK_SOFT, TOOL_LIMIT_FALLBACK_HARD };

export class SessionCircuitBreaker implements CognitiveBreaker {
  private _tripped = false;
  private _totalCalls = 0;
  private _softFired = false;

  constructor(
    readonly soft: number,
    readonly hard: number,
    private onTrip: (total: number) => void,
  ) {}

  get tripped(): boolean { return this._tripped; }

  recordCall(category: string, toolCounts: Record<string, number>): void {
    toolCounts[category] = (toolCounts[category] ?? 0) + 1;
    this._totalCalls = Object.values(toolCounts).reduce((a, b) => a + b, 0);
    if (this._totalCalls >= this.hard && !this._tripped) {
      this._tripped = true;
      this.onTrip(this._totalCalls);
    }
  }

  get shouldWarnSoft(): boolean {
    if (this._softFired || this._totalCalls < this.soft) return false;
    this._softFired = true;
    return true;
  }
}
