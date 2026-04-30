/**
 * handlers/support/node-contract-gate.ts — Pure node-contract validator.
 *
 * Validates that an LLM agent's session terminated by honouring the node's
 * declared output contract:
 *   1. `report_outcome` was called — `reportedOutcome` is populated.
 *   2. Every kind declared in `produces_artifacts` materialised at its
 *      canonical invocation path (or was surfaced via runtime refs).
 *   3. Under `strict_artifacts`, every materialised body / sidecar parses
 *      and carries the envelope.
 *
 * This is the *runner-internal* in-session recovery gate. It mirrors the
 * dispatch-layer presence + envelope gates in `loop/dispatch/item-dispatch.ts`
 * but runs BEFORE the runner returns, so the orchestrator can nudge the
 * SAME session to fix the gap rather than failing the node.
 *
 * Pure: filesystem and path resolution are injected as ports so the gate
 * is trivially unit-testable.
 */
import { ArtifactValidationError, getArtifactKind, isArtifactKind, sidecarPath, stampSidecarEnvelope, validateEnvelope, } from "../../apm/artifact-catalog.js";
// ---------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------
/**
 * Pure node-contract validator. Returns `{ ok: true }` whenever the node
 * has nothing to enforce (failed outcome, auto-skipped, no produces) so
 * the caller can treat the gate as a single yes/no decision.
 */
export async function validateNodeContract(input) {
    // Skip 1 — auto-skipped invocations never wrote their declared outputs.
    if (input.autoSkipped)
        return { ok: true };
    // Skip 2 — a genuinely-failed agent should NOT be force-prompted to
    // produce artifacts. Failure flows straight to triage.
    if (input.reportedOutcome?.status === "failed")
        return { ok: true };
    const missing = [];
    if (!input.reportedOutcome) {
        missing.push({ kind: "report_outcome" });
    }
    const runtimeKinds = input.runtimeKinds ?? new Set();
    for (const kindStr of input.producesArtifacts) {
        if (!isArtifactKind(kindStr))
            continue;
        if (runtimeKinds.has(kindStr))
            continue;
        let ref;
        try {
            ref = input.bus.ref(input.slug, kindStr, {
                nodeKey: input.nodeKey,
                invocationId: input.invocationId,
            });
        }
        catch {
            // ref resolution failed — treat as missing so the agent gets a
            // path-shaped nudge.
            missing.push({
                kind: "artifact-missing",
                declaredKind: kindStr,
                expectedPath: `<unresolvable canonical path for ${kindStr}>`,
            });
            continue;
        }
        const present = await input.fs.exists(ref.path);
        if (!present) {
            missing.push({
                kind: "artifact-missing",
                declaredKind: kindStr,
                expectedPath: ref.path,
            });
            continue;
        }
        if (!input.strictEnvelope)
            continue;
        // Envelope check — only when strict_artifacts is enabled.
        const def = getArtifactKind(kindStr);
        if (!def.envelope)
            continue;
        try {
            if (def.envelope === "sidecar") {
                const sidecar = sidecarPath(ref.path);
                let sidecarBody;
                try {
                    sidecarBody = await input.fs.readFile(sidecar);
                }
                catch {
                    // Auto-stamp missing sidecar — only for `policy: "envelope-only"`
                    // kinds. STRICT-policy sidecar kinds would hard-fail here, but
                    // no kind currently combines `policy: "strict"` with
                    // `envelope: "sidecar"` (the catalog deliberately keeps the
                    // STRICT bucket on inline-envelope kinds). This branch is
                    // therefore dead-code-by-policy today; it remains as a guard
                    // for future STRICT+sidecar kinds. Mirrors the dispatch-layer
                    // auto-stamp in `loop/dispatch/item-dispatch.ts`.
                    if (def.policy !== "envelope-only") {
                        missing.push({
                            kind: "artifact-malformed",
                            declaredKind: kindStr,
                            expectedPath: ref.path,
                            reason: `sidecar not found at ${sidecar}`,
                        });
                        continue;
                    }
                    try {
                        sidecarBody = stampSidecarEnvelope(kindStr, input.nodeKey);
                        await input.fs.writeFile(sidecar, sidecarBody);
                    }
                    catch (writeErr) {
                        missing.push({
                            kind: "artifact-malformed",
                            declaredKind: kindStr,
                            expectedPath: ref.path,
                            reason: `sidecar not found at ${sidecar} and auto-stamp failed: ` +
                                `${writeErr.message}`,
                        });
                        continue;
                    }
                }
                validateEnvelope(kindStr, "", { path: ref.path, sidecarBody });
            }
            else {
                const body = await input.fs.readFile(ref.path);
                validateEnvelope(kindStr, body, { path: ref.path });
            }
        }
        catch (err) {
            const reason = err instanceof ArtifactValidationError
                ? err.message
                : `envelope check threw: ${err.message}`;
            missing.push({
                kind: "artifact-malformed",
                declaredKind: kindStr,
                expectedPath: ref.path,
                reason,
            });
        }
    }
    if (missing.length === 0)
        return { ok: true };
    return { ok: false, missing };
}
/**
 * Render a one-line human-readable summary of a `ValidationResult` for
 * embedding in error messages / telemetry. Empty string when `ok`.
 */
export function summarizeMissing(missing) {
    if (missing.length === 0)
        return "";
    const parts = missing.map((m) => {
        if (m.kind === "report_outcome")
            return "report_outcome not called";
        if (m.kind === "artifact-missing") {
            return `missing artifact \`${m.declaredKind}\` at ${m.expectedPath}`;
        }
        return `malformed artifact \`${m.declaredKind}\` at ${m.expectedPath} (${m.reason})`;
    });
    return parts.join("; ");
}
//# sourceMappingURL=node-contract-gate.js.map