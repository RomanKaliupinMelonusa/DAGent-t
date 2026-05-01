/**
 * ports/triage-artifact-loader.ts — Triage-specific artifact loader port.
 *
 * Decouples `triage-handler.ts` from the `.dagent/<slug>_*.{yml,json}`
 * filesystem convention. The triage handler must not know where
 * acceptance contracts, validation verdicts, or rejection-context logs
 * live on disk — it asks this port.
 *
 * Ports are pure interface declarations — this file must not import
 * adapters, filesystem modules, or concrete implementations.
 */

import type { AcceptanceContract } from "../apm/index.js";
import type { InvocationRecord, ArtifactRefSerialized } from "../types.js";
import type { ArtifactKind } from "../apm/index.js";

export interface ContractEvidenceResult {
  /** Raw error trace with the oracle evidence block prepended. */
  readonly trace: string;
  /** Relative paths of the artifacts that were found and inlined. */
  readonly sources: readonly string[];
}

/**
 * Structured triage evidence bundle (Phase F) — replaces the pre-artifact-bus
 * scroll of concatenated file contents that triage used to assemble by hand.
 *
 * `invocation` is the failing invocation under investigation. `ancestry` walks
 * `parentInvocationId` backward from it (newest → oldest), giving the triage
 * agent the full cycle trail (triage ← runner[fail] ← unit-test ← debug ← triage).
 * `artifacts` is the flattened union of all `outputs` across the lineage, so a
 * triage agent can reach any prior artifact by kind without re-walking the chain.
 * `events` — reserved for invocation-filtered event streams once the telemetry
 * logger grows `listEventsForInvocation(inv)` (Phase B follow-up); today it is
 * always `[]`, which is the explicit "ledger present, no event filter yet"
 * contract.
 */
export interface TriageEvidenceBundle {
  readonly invocation: InvocationRecord;
  readonly ancestry: readonly InvocationRecord[];
  readonly events: readonly unknown[];
  readonly artifacts: readonly ArtifactRefSerialized[];
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

  /**
   * List every invocation record for a slug, ordered by `startedAt`
   * ascending. Returns `[]` when the artifact ledger is empty or
   * unavailable (pre-Phase-2 features, missing state, etc.). Never
   * throws — triage must degrade gracefully.
   */
  listInvocations(slug: string): Promise<readonly InvocationRecord[]>;

  /**
   * List invocation records that produced an artifact of `kind`,
   * ordered by `startedAt` ascending. Pass `kind = undefined` to match
   * any kind. Returns `[]` on I/O failures or missing ledger.
   *
   * Consumers: triage routing, redevelopment-cycle counters, lineage
   * CLI — anywhere a chronological per-kind view is needed.
   */
  listArtifacts(slug: string, kind?: ArtifactKind): Promise<readonly InvocationRecord[]>;

  /**
   * Build the structured triage-evidence bundle for a feature. When
   * `invocationId` is omitted, the adapter picks the most recent failed
   * invocation (the conventional target of a triage reroute). Returns `null`
   * when the ledger is empty or `invocationId` cannot be located — triage
   * must degrade gracefully to the legacy prose path.
   */
  loadEvidenceBundle(
    slug: string,
    invocationId?: string,
  ): Promise<TriageEvidenceBundle | null>;
}
