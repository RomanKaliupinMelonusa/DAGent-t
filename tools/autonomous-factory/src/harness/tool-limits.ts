/**
 * harness/tool-limits.ts — Absolute fallback thresholds for the
 * cognitive circuit breaker.
 *
 * Only used when neither per-agent `toolLimits` nor
 * `config.defaultToolLimits` are declared in `apm.yml`. Real
 * configuration belongs in the manifest; these constants exist so the
 * engine cannot crash on missing values.
 */

export const TOOL_LIMIT_FALLBACK_SOFT = 30;
export const TOOL_LIMIT_FALLBACK_HARD = 40;
