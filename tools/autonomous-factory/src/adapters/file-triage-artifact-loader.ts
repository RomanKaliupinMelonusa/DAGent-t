/**
 * adapters/file-triage-artifact-loader.ts — Filesystem-backed adapter
 * for the `TriageArtifactLoader` port.
 *
 * Delegates to the existing helpers in `src/triage/` and
 * `src/apm/acceptance-schema.ts`. This adapter exists purely to lift
 * the `in-progress/<slug>_*.{yml,json}` filesystem convention out of
 * `triage-handler.ts`; it does not change the underlying I/O strategy.
 */

import path from "node:path";

import type { TriageArtifactLoader, ContractEvidenceResult } from "../ports/triage-artifact-loader.js";
import type { AcceptanceContract } from "../apm/acceptance-schema.js";
import { loadAcceptanceContract } from "../apm/acceptance-schema.js";
import { prependContractEvidence } from "../triage/contract-evidence.js";
import {
  buildTriageRejectionContext,
  computeEffectiveDevAttempts,
} from "../triage/context-builder.js";

export interface FileTriageArtifactLoaderOptions {
  /** Absolute path to the app root (contains `in-progress/`). */
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
        path.join(this.appRoot, "in-progress", `${slug}_ACCEPTANCE.yml`),
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
}
