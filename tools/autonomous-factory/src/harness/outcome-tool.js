/**
 * harness/outcome-tool.ts — Custom `report_outcome` SDK tool.
 *
 * Phase A migration: replaces the agent-facing bash CLI verbs
 * `pipeline:complete | pipeline:fail`
 * with a single typed SDK tool. The session runner observes the latest
 * call via `telemetry.reportedOutcome` and the `copilot-agent` handler
 * translates it into a kernel Command — making the kernel the sole
 * writer of pipeline state.
 *
 * Phase 5 cutover: the optional `docNote` / `deployedUrl` / `projectNote`
 * fields have been removed. Their replacements are declared artifacts:
 *   - `docNote` (and `projectNote`) → `summary` artifact written to
 *     `outputs/summary.md` (declared via `produces_artifacts: ["summary"]`).
 *   - `deployedUrl` → `deployment-url` artifact written to
 *     `outputs/deployment-url.json` (declared via
 *     `produces_artifacts: ["deployment-url"]`).
 *
 * Phase B (next-failure-hint): an optional `next_failure_hint` field
 * lets a debug-class agent flag the most likely next failure domain +
 * target node. Replaces the markdown heading parser the triage handoff
 * builder used to apply to `debug-notes.md`. Validation runs at submit
 * time against the failing node's allowed domains and the compiled DAG
 * node set; an unknown domain or target_node is rejected so the agent
 * sees the error inline and can retry.
 *
 * The tool is idempotent — only the LAST call wins. Agents are expected
 * to call it exactly once at the end of their session.
 */
import { defineTool } from "@github/copilot-sdk";
/** Default cap on `next_failure_hint.summary` length. */
export const DEFAULT_NEXT_FAILURE_HINT_SUMMARY_MAX = 500;
/**
 * Validate a candidate `next_failure_hint` payload. Returns the cleaned
 * hint on success or a tool-error string the SDK handler returns inline
 * so the agent sees the rejection and can retry. Pure — exported for tests.
 */
export function validateNextFailureHint(raw, validation) {
    if (typeof raw !== "object" || raw === null) {
        return { ok: false, error: "ERROR: next_failure_hint must be an object." };
    }
    const obj = raw;
    const domain = obj.domain;
    const target_node = obj.target_node;
    const summary = obj.summary;
    const evidence_paths = obj.evidence_paths;
    if (typeof domain !== "string" || domain.length === 0) {
        return { ok: false, error: "ERROR: next_failure_hint.domain must be a non-empty string." };
    }
    if (typeof target_node !== "string" || target_node.length === 0) {
        return { ok: false, error: "ERROR: next_failure_hint.target_node must be a non-empty string." };
    }
    if (typeof summary !== "string" || summary.length === 0) {
        return { ok: false, error: "ERROR: next_failure_hint.summary must be a non-empty string." };
    }
    if (!validation) {
        return {
            ok: false,
            error: "ERROR: next_failure_hint validation context is unavailable for this " +
                "invocation. Drop the field or retry from a node whose failure routes " +
                "are declared in workflows.yml.",
        };
    }
    const cap = validation.summaryMaxChars ?? DEFAULT_NEXT_FAILURE_HINT_SUMMARY_MAX;
    if (summary.length > cap) {
        return {
            ok: false,
            error: `ERROR: next_failure_hint.summary length ${summary.length} exceeds ` +
                `the ${cap}-char cap. Trim the summary and retry.`,
        };
    }
    if (!validation.allowedDomains.includes(domain)) {
        const allowed = validation.allowedDomains.length > 0
            ? validation.allowedDomains.join(", ")
            : "(none — failing node declares no on_failure.routes)";
        return {
            ok: false,
            error: `ERROR: next_failure_hint.domain '${domain}' is not in the failing ` +
                `node's allowed domains: [${allowed}]. Choose one of those domains ` +
                `or drop the hint.`,
        };
    }
    if (!validation.dagNodeKeys.includes(target_node)) {
        const sample = validation.dagNodeKeys.slice(0, 8).join(", ");
        return {
            ok: false,
            error: `ERROR: next_failure_hint.target_node '${target_node}' is not a DAG ` +
                `node in this workflow. Known nodes (first 8): [${sample}]. Use a ` +
                `valid node key or drop the hint.`,
        };
    }
    let evidenceClean;
    if (evidence_paths !== undefined) {
        if (!Array.isArray(evidence_paths)) {
            return { ok: false, error: "ERROR: next_failure_hint.evidence_paths must be an array of strings." };
        }
        const cleaned = [];
        for (let i = 0; i < evidence_paths.length; i++) {
            const p = evidence_paths[i];
            if (typeof p !== "string" || p.length === 0) {
                return {
                    ok: false,
                    error: `ERROR: next_failure_hint.evidence_paths[${i}] must be a non-empty string.`,
                };
            }
            if (p.startsWith("/") || p.startsWith("\\")) {
                return {
                    ok: false,
                    error: `ERROR: next_failure_hint.evidence_paths[${i}] '${p}' must be a ` +
                        `workspace-relative path (no leading '/').`,
                };
            }
            if (p.split(/[\\/]/).includes("..")) {
                return {
                    ok: false,
                    error: `ERROR: next_failure_hint.evidence_paths[${i}] '${p}' must not ` +
                        `contain '..' segments.`,
                };
            }
            cleaned.push(p);
        }
        if (cleaned.length > 0)
            evidenceClean = cleaned;
    }
    const hint = {
        domain,
        target_node,
        summary,
        ...(evidenceClean ? { evidence_paths: evidenceClean } : {}),
    };
    return { ok: true, hint };
}
/**
 * Build the `report_outcome` tool. The handler writes the latest call into
 * `telemetry.reportedOutcome`; later calls overwrite earlier ones.
 *
 * `validation`, when supplied, gates `next_failure_hint` submission. When
 * the agent supplies the field without a validation context, the tool
 * rejects the call so the failure mode is explicit.
 */
export function buildReportOutcomeTool(telemetry, validation, precompletionGate) {
    return defineTool("report_outcome", {
        description: "Report the final outcome of this session. Call exactly once, " +
            "as the LAST action before you stop. The orchestrator uses this " +
            "to mutate pipeline state — do NOT also call any `pipeline:*` " +
            "bash command. Set status='completed' on success, status='failed' " +
            "with a diagnostic `message` on failure. " +
            "Notes, URLs, and other rich content go in declared artifacts " +
            "(write `outputs/summary.md` or `outputs/deployment-url.json` " +
            "instead of passing them here). " +
            "Optional `next_failure_hint` lets a debug-class agent flag the " +
            "most likely next failure for downstream triage; `domain` must be " +
            "one of the failing node's allowed routing domains and " +
            "`target_node` must be a DAG node key in this workflow.",
        parameters: {
            type: "object",
            properties: {
                status: {
                    type: "string",
                    enum: ["completed", "failed"],
                    description: "Final status of this work item.",
                },
                message: {
                    type: "string",
                    description: "REQUIRED when status='failed'. Diagnostic message — preferably " +
                        "a TriageDiagnostic JSON object describing root cause, blame, " +
                        "and suggested next agent.",
                },
                next_failure_hint: {
                    type: "object",
                    description: "OPTIONAL forward-looking diagnosis. Replaces the legacy markdown " +
                        "heading parser on debug-notes.md with a structured pointer to " +
                        "the most likely next failure.",
                    properties: {
                        domain: {
                            type: "string",
                            description: "Fault domain — must be one of the failing node's allowed " +
                                "routing domains (declared via on_failure.routes).",
                        },
                        target_node: {
                            type: "string",
                            description: "DAG node key the hint targets — must exist in the compiled " +
                                "workflow.",
                        },
                        summary: {
                            type: "string",
                            description: "Short summary of the diagnosis. <= 500 chars.",
                        },
                        evidence_paths: {
                            type: "array",
                            items: { type: "string" },
                            description: "Optional workspace-relative file:line refs supporting the " +
                                "diagnosis. No absolute paths, no '..' segments.",
                        },
                    },
                    required: ["domain", "target_node", "summary"],
                },
            },
            required: ["status"],
        },
        handler: (args) => {
            let nextFailureHint;
            if (args.next_failure_hint !== undefined && args.next_failure_hint !== null) {
                const v = validateNextFailureHint(args.next_failure_hint, validation ?? null);
                if (!v.ok)
                    return v.error;
                nextFailureHint = v.hint;
            }
            if (args.status === "failed") {
                const message = (args.message ?? "").trim();
                if (!message) {
                    return ("ERROR: report_outcome with status='failed' requires a non-empty " +
                        "`message` (preferably a TriageDiagnostic JSON). Outcome NOT recorded — " +
                        "call again with a diagnostic message.");
                }
                telemetry.reportedOutcome = {
                    status: "failed",
                    message,
                    ...(nextFailureHint ? { nextFailureHint } : {}),
                };
                const hintTag = nextFailureHint
                    ? ` (hint: ${nextFailureHint.domain} → ${nextFailureHint.target_node})`
                    : "";
                telemetry.reportOutcomeTerminal = true;
                return `Outcome recorded: failed${hintTag}. ${message.length > 120 ? message.slice(0, 117) + "..." : message}`;
            }
            // Pre-completion validation gate (P1.2). Runs ONLY for
            // status='completed' so a `failed` outcome can always be recorded
            // (failures are themselves a terminal signal). When the gate
            // rejects, the outcome is NOT recorded — the agent reads the
            // error inline and gets one corrective turn before we hard-fail.
            //
            // Invariant — "exactly one corrective turn" (with default cap=1):
            //   call #1 (prior=0, prior < cap)  → reject, increment to 1
            //   call #2 (prior=1, prior >= cap) → hard-fail with `failed` outcome
            // i.e. the AGENT gets one repair attempt; the SECOND rejection is
            // the trip-wire. Increase `maxCorrectiveTurns` to allow more.
            if (precompletionGate) {
                const verdict = precompletionGate.validate();
                if (!verdict.ok) {
                    const cap = precompletionGate.maxCorrectiveTurns ?? 1;
                    const prior = telemetry.precompletionGateRejections ?? 0;
                    telemetry.precompletionGateRejections = prior + 1;
                    if (prior >= cap) {
                        const summary = `Pre-completion gate exhausted after ${prior + 1} rejection(s). ` +
                            `Latest [${verdict.code}]: ${verdict.error}`;
                        telemetry.reportedOutcome = { status: "failed", message: summary };
                        telemetry.reportOutcomeTerminal = true;
                        return (`Outcome recorded: failed (gate exhausted). ${summary.length > 200 ? summary.slice(0, 197) + "..." : summary}`);
                    }
                    // First rejection: re-arm the watchdog and tell the agent
                    // exactly what to fix. DO NOT mutate `telemetry.reportedOutcome`.
                    return (`ERROR: report_outcome rejected by pre-completion gate ` +
                        `[code=${verdict.code}]. Outcome NOT recorded. ` +
                        `You have ONE corrective turn — patch the artifact then call ` +
                        `report_outcome({status: "completed"}) again.\n\n` +
                        verdict.error);
                }
            }
            telemetry.reportedOutcome = {
                status: "completed",
                ...(nextFailureHint ? { nextFailureHint } : {}),
            };
            const hintTag = nextFailureHint
                ? ` (hint: ${nextFailureHint.domain} → ${nextFailureHint.target_node})`
                : "";
            telemetry.reportOutcomeTerminal = true;
            return `Outcome recorded: completed${hintTag}.`;
        },
    });
}
//# sourceMappingURL=outcome-tool.js.map