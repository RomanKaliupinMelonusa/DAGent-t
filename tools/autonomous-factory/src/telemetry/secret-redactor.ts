/**
 * telemetry/secret-redactor.ts — Track B3 log redactor.
 *
 * Builds a redactor function `(text: string) => string` seeded from the
 * compiled APM `config.environment` dictionary. Any env entry whose
 * **key** matches /key|secret|token|password|connection|credential/i
 * is treated as a secret; its **value** is literal-replaced with
 * `[REDACTED:KEY_NAME]` wherever it appears in a log chunk.
 *
 * Design notes:
 *   - Keyed by env var NAME — we do not heuristically classify values.
 *     The apm.yml author controls the denylist via key naming.
 *   - Values shorter than `minValueLength` (default 8) are skipped to
 *     avoid wiping legitimate tokens like "yes" / "on" that happen to
 *     live under a "KEY_ENABLED" name.
 *   - The redactor is a plain string replacer (no regex compiled from
 *     user input) — safe against regex-injection if a value contains
 *     special characters.
 *   - When no secrets are present, returns an identity function. Call
 *     sites should NOT wrap identity redaction in try/catch (there's
 *     nothing to fail).
 */

const SECRET_KEY_PATTERN = /key|secret|token|password|connection|credential/i;
const DEFAULT_MIN_VALUE_LENGTH = 8;

export type SecretRedactor = (text: string) => string;

export interface BuildSecretRedactorOptions {
  /** Minimum value length considered "secret-like". Defaults to 8. */
  minValueLength?: number;
  /** Override the default secret key pattern. Must be a RegExp. */
  keyPattern?: RegExp;
}

/**
 * Build a redactor from a `config.environment` dictionary.
 *
 * Returns an identity function if nothing looks secret-like, so call
 * sites pay zero allocation cost when the feature is off.
 */
export function buildSecretRedactor(
  env: Readonly<Record<string, string>> | undefined,
  opts: BuildSecretRedactorOptions = {},
): SecretRedactor {
  if (!env) return identity;
  const minLen = opts.minValueLength ?? DEFAULT_MIN_VALUE_LENGTH;
  const keyPat = opts.keyPattern ?? SECRET_KEY_PATTERN;

  // Sort by descending length so longer secrets are replaced first —
  // prevents a short secret that is a prefix of a longer one from
  // masking the longer replacement. (Unlikely in practice, but cheap
  // to guarantee.)
  const entries: Array<{ key: string; value: string }> = [];
  for (const [key, value] of Object.entries(env)) {
    if (!keyPat.test(key)) continue;
    if (typeof value !== "string") continue;
    if (value.length < minLen) continue;
    entries.push({ key, value });
  }
  if (entries.length === 0) return identity;
  entries.sort((a, b) => b.value.length - a.value.length);

  return (text: string): string => {
    if (!text) return text;
    let out = text;
    for (const { key, value } of entries) {
      if (!out.includes(value)) continue;
      // Use split/join for literal replacement (no regex escaping needed).
      out = out.split(value).join(`[REDACTED:${key}]`);
    }
    return out;
  };
}

function identity(text: string): string {
  return text;
}

/**
 * Test-only helper: expose the default pattern so unit tests can
 * assert the documented contract without depending on internal
 * constants.
 */
export const __INTERNAL__ = Object.freeze({
  SECRET_KEY_PATTERN,
  DEFAULT_MIN_VALUE_LENGTH,
});
