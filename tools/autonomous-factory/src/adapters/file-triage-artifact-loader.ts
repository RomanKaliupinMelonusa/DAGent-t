/**
 * adapters/file-triage-artifact-loader.ts — Filesystem-backed adapter
 * for the `TriageArtifactLoader` port.
 *
 * Delegates to the existing helpers in `src/triage/` and
 * `src/apm/acceptance-schema.ts`. This adapter exists purely to lift
 * the `.dagent/<slug>_*.{yml,json}` filesystem convention out of
 * `triage-handler.ts`; it does not change the underlying I/O strategy.
 */

import fs from "node:fs";

import type { TriageArtifactLoader, ContractEvidenceResult, TriageEvidenceBundle } from "../ports/triage-artifact-loader.js";
import { featurePath } from "../paths/feature-paths.js";
import type { AcceptanceContract } from "../apm/acceptance-schema.js";
import type { InvocationRecord, PipelineState, ArtifactRefSerialized } from "../types.js";
import type { ArtifactKind } from "../apm/artifact-catalog.js";
import { loadAcceptanceContract } from "../apm/acceptance-schema.js";
import { prependContractEvidence } from "../triage/contract-evidence.js";
import {
  buildTriageRejectionContext,
  computeEffectiveDevAttempts,
} from "../triage/context-builder.js";

export interface FileTriageArtifactLoaderOptions {
  /** Absolute path to the app root (contains `.dagent/`). */
  readonly appRoot: string;
}

export class FileTriageArtifactLoader implements TriageArtifactLoader {
  private readonly appRoot: string;

  constructor(opts: FileTriageArtifactLoaderOptions) {
    this.appRoot = opts.appRoot;
  }

  loadAcceptance(slug: string): AcceptanceContract | null {
    try {
      return loadAcceptanceContract(
        featurePath(this.appRoot, slug, "acceptance"),
      );
    } catch {
      return null;
    }
  }

  loadContractEvidence(slug: string, rawError: string): ContractEvidenceResult {
    return prependContractEvidence(rawError, this.appRoot, slug);
  }

  async loadRejectionContext(slug: string, narrative?: string): Promise<string> {
    return buildTriageRejectionContext(slug, narrative);
  }

  async computeEffectiveDevAttempts(
    itemKey: string,
    inMemoryAttempts: number,
    slug: string,
    allowsRevertBypass?: boolean,
  ): Promise<number> {
    return computeEffectiveDevAttempts(itemKey, inMemoryAttempts, slug, allowsRevertBypass);
  }

  /**
   * Read the slug's `_STATE.json` (flat layout) and return its
   * `state.artifacts` ledger as a chronologically ordered list. Best-
   * effort: any I/O or JSON parse failure yields `[]`.
   */
  private readLedger(slug: string): readonly InvocationRecord[] {
    const statePath = featurePath(this.appRoot, slug, "state");
    let raw: string;
    try {
      raw = fs.readFileSync(statePath, "utf8");
    } catch {
      return [];
    }
    let parsed: PipelineState;
    try {
      parsed = JSON.parse(raw) as PipelineState;
    } catch {
      return [];
    }
    const ledger = parsed.artifacts;
    if (!ledger || typeof ledger !== "object") return [];
    const records = Object.values(ledger).filter(
      (r): r is InvocationRecord =>
        !!r && typeof r === "object" && typeof (r as InvocationRecord).invocationId === "string",
    );
    records.sort((a, b) => {
      const at = a.startedAt ?? "";
      const bt = b.startedAt ?? "";
      return at < bt ? -1 : at > bt ? 1 : 0;
    });
    return records;
  }

  async listInvocations(slug: string): Promise<readonly InvocationRecord[]> {
    return this.readLedger(slug);
  }

  async listArtifacts(slug: string, kind?: ArtifactKind): Promise<readonly InvocationRecord[]> {
    const all = this.readLedger(slug);
    if (!kind) return all;
    return all.filter((rec) => {
      const outputs = rec.outputs;
      if (!outputs) return false;
      return outputs.some((ref) => ref.kind === kind);
    });
  }

  async loadEvidenceBundle(
    slug: string,
    invocationId?: string,
  ): Promise<TriageEvidenceBundle | null> {
    const ledger = this.readLedger(slug);
    if (ledger.length === 0) return null;

    // Index for O(1) parent walks.
    const byId = new Map<string, InvocationRecord>();
    for (const rec of ledger) byId.set(rec.invocationId, rec);

    // Pick the target invocation. Prefer explicit id; otherwise fall back
    // to the most recent `failed` outcome (the typical triage entry point),
    // and finally the last invocation on the ledger.
    let target: InvocationRecord | undefined;
    if (invocationId) {
      target = byId.get(invocationId);
    } else {
      const reversed = [...ledger].reverse();
      target = reversed.find((r) => r.outcome === "failed") ?? reversed[0];
    }
    if (!target) return null;

    // Walk parent chain backward, excluding the target itself.
    const ancestry: InvocationRecord[] = [];
    const seen = new Set<string>([target.invocationId]);
    let cursor: string | undefined = target.parentInvocationId;
    while (cursor && !seen.has(cursor)) {
      seen.add(cursor);
      const rec = byId.get(cursor);
      if (!rec) break;
      ancestry.push(rec);
      cursor = rec.parentInvocationId;
    }

    // Flatten every output across target + ancestry. Preserves chronological
    // order (ancestry is newest→oldest from the walk; reverse for oldest→newest
    // and append the target last).
    const artifacts: ArtifactRefSerialized[] = [];
    const chronological = [...ancestry].reverse();
    chronological.push(target);
    for (const rec of chronological) {
      for (const out of rec.outputs ?? []) artifacts.push(out);
    }

    return {
      invocation: target,
      ancestry,
      events: [],
      artifacts,
    };
  }
}
