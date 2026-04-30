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
import { featurePath } from "./feature-paths.js";
import { loadAcceptanceContract } from "../apm/acceptance-schema.js";
import { prependContractEvidence } from "../triage/contract-evidence.js";
import { buildTriageRejectionContext, computeEffectiveDevAttempts, } from "../triage/context-builder.js";
export class FileTriageArtifactLoader {
    appRoot;
    constructor(opts) {
        this.appRoot = opts.appRoot;
    }
    loadAcceptance(slug) {
        try {
            return loadAcceptanceContract(featurePath(this.appRoot, slug, "acceptance"));
        }
        catch {
            return null;
        }
    }
    loadContractEvidence(slug, rawError) {
        return prependContractEvidence(rawError, this.appRoot, slug);
    }
    async loadRejectionContext(slug, narrative) {
        return buildTriageRejectionContext(slug, narrative);
    }
    async computeEffectiveDevAttempts(itemKey, inMemoryAttempts, slug, allowsRevertBypass) {
        return computeEffectiveDevAttempts(itemKey, inMemoryAttempts, slug, allowsRevertBypass);
    }
    /**
     * Read the slug's `_STATE.json` (flat layout) and return its
     * `state.artifacts` ledger as a chronologically ordered list. Best-
     * effort: any I/O or JSON parse failure yields `[]`.
     */
    readLedger(slug) {
        const statePath = featurePath(this.appRoot, slug, "state");
        let raw;
        try {
            raw = fs.readFileSync(statePath, "utf8");
        }
        catch {
            return [];
        }
        let parsed;
        try {
            parsed = JSON.parse(raw);
        }
        catch {
            return [];
        }
        const ledger = parsed.artifacts;
        if (!ledger || typeof ledger !== "object")
            return [];
        const records = Object.values(ledger).filter((r) => !!r && typeof r === "object" && typeof r.invocationId === "string");
        records.sort((a, b) => {
            const at = a.startedAt ?? "";
            const bt = b.startedAt ?? "";
            return at < bt ? -1 : at > bt ? 1 : 0;
        });
        return records;
    }
    async listInvocations(slug) {
        return this.readLedger(slug);
    }
    async listArtifacts(slug, kind) {
        const all = this.readLedger(slug);
        if (!kind)
            return all;
        return all.filter((rec) => {
            const outputs = rec.outputs;
            if (!outputs)
                return false;
            return outputs.some((ref) => ref.kind === kind);
        });
    }
    async loadEvidenceBundle(slug, invocationId) {
        const ledger = this.readLedger(slug);
        if (ledger.length === 0)
            return null;
        // Index for O(1) parent walks.
        const byId = new Map();
        for (const rec of ledger)
            byId.set(rec.invocationId, rec);
        // Pick the target invocation. Prefer explicit id; otherwise fall back
        // to the most recent `failed` outcome (the typical triage entry point),
        // and finally the last invocation on the ledger.
        let target;
        if (invocationId) {
            target = byId.get(invocationId);
        }
        else {
            const reversed = [...ledger].reverse();
            target = reversed.find((r) => r.outcome === "failed") ?? reversed[0];
        }
        if (!target)
            return null;
        // Walk parent chain backward, excluding the target itself.
        const ancestry = [];
        const seen = new Set([target.invocationId]);
        let cursor = target.parentInvocationId;
        while (cursor && !seen.has(cursor)) {
            seen.add(cursor);
            const rec = byId.get(cursor);
            if (!rec)
                break;
            ancestry.push(rec);
            cursor = rec.parentInvocationId;
        }
        // Flatten every output across target + ancestry. Preserves chronological
        // order (ancestry is newest→oldest from the walk; reverse for oldest→newest
        // and append the target last).
        const artifacts = [];
        const chronological = [...ancestry].reverse();
        chronological.push(target);
        for (const rec of chronological) {
            for (const out of rec.outputs ?? [])
                artifacts.push(out);
        }
        return {
            invocation: target,
            ancestry,
            events: [],
            artifacts,
        };
    }
}
//# sourceMappingURL=file-triage-artifact-loader.js.map