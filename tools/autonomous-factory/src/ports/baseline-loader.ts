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

/**
 * A single entry captured during baseline analysis. Matches are performed
 * by the `baseline-filter` pure function against fields produced by the
 * Playwright structured-failure parser.
 */
export interface BaselineEntry {
  /**
   * Substring or normalized message used for matching against
   * `StructuredFailure.consoleErrors[]`, `uncaughtErrors[].message`, or
   * `failedRequests[]`. Matching is case-sensitive substring on the
   * normalized (ANSI-stripped, fingerprinted) payload.
   */
  readonly pattern: string;
  /** Logical source page label (e.g. "HomePage", "CheckoutModal"). */
  readonly source_page?: string;
  /**
   * Kind of signal this entry matches. When absent the filter matches
   * across all three channels, which is the conservative default.
   */
  readonly kind?: "console" | "uncaught" | "network";
  /**
   * Optional URL fragment further scoping the match. When present, the
   * runtime message must *also* contain this substring for the entry
   * to apply — useful for distinguishing a noisy warning from vendor
   * code vs the same string appearing in feature code. Substring,
   * case-sensitive, applied before the volatile-token normaliser.
   * Backward-compatible: entries without `source_url` behave as before.
   */
  readonly source_url?: string;
  /**
   * Volatility classification for this entry.
   *
   *   - `persistent` — known-permanent platform/legacy warning that will
   *     not be fixed by this feature (e.g. React `getServerSnapshot`
   *     warning, deprecated `defaultProps`, sandbox-only network 403s).
   *     Rendering surfaces flag persistent entries in a dedicated
   *     "DO NOT investigate" sub-block, and the LLM router appends a
   *     hard rule when post-subtraction surviving evidence is fully
   *     covered by persistent patterns.
   *   - `transient` — pre-feature noise that may legitimately disappear
   *     once application state changes, but still does not justify a
   *     code-defect verdict on its own.
   *
   * Optional. Absent → entry behaves like `transient` (existing
   * behaviour, fully back-compatible).
   *
   * TODO(phase-A4): tagging is performed by the `baseline-analyzer`
   * agent via APM instruction. The current phase only delivers the
   * schema + rendering + LLM weighting; the agent does not yet emit
   * these fields.
   */
  readonly volatility?: "persistent" | "transient";
  /**
   * Optional taxonomy hint for human triage / dashboards. Not consumed
   * by the rendering or filter logic. See `volatility` for the
   * tagging-deferral note.
   */
  readonly category?:
    | "framework-warning"
    | "network-sandbox"
    | "legacy-deprecation"
    | "app-specific";
}

export interface BaselineProfile {
  readonly feature: string;
  readonly captured_at?: string;
  readonly base_sha?: string;
  readonly targets?: ReadonlyArray<{
    readonly name: string;
    readonly url?: string;
    readonly trigger_testid?: string;
    readonly kind?: "page" | "modal" | string;
  }>;
  readonly console_errors?: ReadonlyArray<BaselineEntry>;
  readonly network_failures?: ReadonlyArray<BaselineEntry>;
  readonly uncaught_exceptions?: ReadonlyArray<BaselineEntry>;
  readonly notes?: string;
}

export interface BaselineLoader {
  /**
   * Load the baseline profile for a feature, when present.
   *
   * Returns `null` for features without a baseline, missing/malformed
   * files, or any I/O error — triage must never fail because of a
   * missing baseline. Implementations MUST NOT throw.
   */
  loadBaseline(slug: string): BaselineProfile | null;
}
