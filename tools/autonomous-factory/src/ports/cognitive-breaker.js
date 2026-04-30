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
export {};
//# sourceMappingURL=cognitive-breaker.js.map