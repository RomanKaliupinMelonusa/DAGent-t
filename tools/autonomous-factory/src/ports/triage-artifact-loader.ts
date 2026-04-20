/**
 * ports/triage-artifact-loader.ts — Triage-specific artifact loader port.
 *
 * Decouples `triage-handler.ts` from the `in-progress/<slug>_*.{yml,json}`
 * filesystem convention. The triage handler must not know where
 * acceptance contracts, validation verdicts, or rejection-context logs
 * live on disk — it asks this port.
 *
 * Ports are pure interface declarations — this file must not import
 * adapters, filesystem modules, or concrete implementations.
 */

import type { AcceptanceContract } from "../apm/acceptance-schema.js";

export interface ContractEvidenceResult {
  /** Raw error trace with the oracle evidence block prepended. */
  readonly trace: string;
  /** Relative paths of the artifacts that were found and inlined. */
  readonly sources: readonly string[];
}

export interface TriageArtifactLoader {
  /**
   * Load the compiled acceptance contract for a feature, when present.
   * Returns null for pre-Phase-B features, missing/malformed files, or
   * any I/O error — triage must never fail because of a missing
   * contract.
   */
  loadAcceptance(slug: string): AcceptanceContract | null;

  /**
   * Prepend contract-evidence artifacts (validation oracle verdict, QA
   * adversary report, Playwright primary-cause fallback) to a raw error
   * trace. Returns the enriched trace plus the list of artifact paths
   * that were successfully inlined.
   *
   * Must never throw — returns `{ trace: rawError, sources: [] }` when
   * no evidence is available.
   */
  loadContractEvidence(slug: string, rawError: string): ContractEvidenceResult;

  /**
   * Build the redevelopment-rejection context block for a feature by
   * walking its persisted errorLog for the most recent reroute/reset
   * entry. Returns "" when no such entry exists.
   */
  loadRejectionContext(slug: string, narrative?: string): Promise<string>;

  /**
   * Compute the effective redevelopment-attempt count for a dev item.
   * When `allowsRevertBypass` is true the count includes persisted
   * cycles observed in the feature's errorLog; otherwise returns
   * `inMemoryAttempts` verbatim.
   */
  computeEffectiveDevAttempts(
    itemKey: string,
    inMemoryAttempts: number,
    slug: string,
    allowsRevertBypass?: boolean,
  ): Promise<number>;
}
