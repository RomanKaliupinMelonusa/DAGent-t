/**
 * domain/error-classification.ts — pure SDK error classification.
 *
 * Stateless helpers used by the copilot-session-runner adapter to decide
 * whether a raised error should halt the pipeline (non-retryable) or
 * simply fail the current attempt (retryable).
 *
 * Keep this file pure: no logging, no I/O, no side effects. The set of
 * fatal patterns is always provided by the caller so the rules remain
 * configurable per-app via apm.yml (`config.fatal_sdk_errors`).
 */
/**
 * Default fatal-SDK-error substrings. Applied when apm.yml does not
 * override `config.fatal_sdk_errors`. Matched case-insensitively.
 */
export const DEFAULT_FATAL_SDK_PATTERNS = [
    "authentication info",
    "custom provider",
    "rate limit",
];
/**
 * Return true when `message` contains any of the given fatal substrings.
 * Matching is case-insensitive. An empty pattern list always returns false.
 */
export function isFatalSdkError(message, patterns = DEFAULT_FATAL_SDK_PATTERNS) {
    if (!message || patterns.length === 0)
        return false;
    const lower = message.toLowerCase();
    return patterns.some((p) => p && lower.includes(p.toLowerCase()));
}
//# sourceMappingURL=error-classification.js.map