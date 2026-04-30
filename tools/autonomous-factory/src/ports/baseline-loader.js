/**
 * ports/baseline-loader.ts — Port for loading pre-feature page baselines.
 *
 * A baseline is a snapshot of console / network / uncaught errors observed
 * on the feature's target pages BEFORE any code is written. The triage
 * handler consumes the baseline (when present) to subtract pre-existing
 * platform noise from structured Playwright failures, so misclassification
 * such as "generic hydration warning → browser-runtime-error" no longer
 * reroutes development agents for errors they did not cause.
 *
 * This port is intentionally narrow:
 *   - One method (`loadBaseline`). Triage calls it once per evaluation.
 *   - Returns `null` on any failure (missing file, malformed JSON, I/O
 *     error). Triage must NEVER fail because a baseline is absent.
 *
 * Ports are pure interface declarations — this file must not import
 * adapters, filesystem modules, or concrete implementations.
 */
export {};
//# sourceMappingURL=baseline-loader.js.map