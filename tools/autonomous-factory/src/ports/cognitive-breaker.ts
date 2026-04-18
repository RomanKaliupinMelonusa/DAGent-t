/**
 * ports/cognitive-breaker.ts — Port interface for the cognitive circuit breaker.
 *
 * A "cognitive breaker" tracks per-category tool-call counts during an
 * agent session and fires a one-shot `onTrip` callback when a hard ceiling
 * is crossed. It also surfaces a one-shot `shouldWarnSoft` signal so
 * callers can inject a frustration prompt into the next tool result.
 *
 * The production implementation lives at
 * `adapters/session-circuit-breaker.ts`. Tests may supply a stub impl.
 */

export interface CognitiveBreaker {
  /** Soft warning threshold — drives `shouldWarnSoft`. */
  readonly soft: number;
  /** Hard ceiling — crossing fires `onTrip` exactly once. */
  readonly hard: number;
  /** True after `onTrip` has fired. Callers should ignore further events. */
  readonly tripped: boolean;

  /**
   * Record a single tool call under `category`. Mutates the shared
   * `toolCounts` map in place (keyed by category). Fires `onTrip` the
   * first time the running total reaches `hard`.
   */
  recordCall(category: string, toolCounts: Record<string, number>): void;

  /**
   * One-shot signal: true exactly once, the first time the running total
   * has reached `soft`. Callers use this to inject a soft-limit prompt.
   */
  readonly shouldWarnSoft: boolean;
}

/** Factory signature for constructing a breaker with a late-bound onTrip. */
export type CognitiveBreakerFactory = (opts: {
  soft: number;
  hard: number;
  onTrip: (totalCalls: number) => void;
}) => CognitiveBreaker;
