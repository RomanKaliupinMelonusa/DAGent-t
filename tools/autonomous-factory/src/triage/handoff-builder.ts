/**
 * triage/handoff-builder.ts — pure assembly of the `TriageHandoff`
 * structure consumed by the adapter's markdown renderer.
 *
 * The triage handler is a *classifier + command builder*. Rendering
 * details (truncation rules, advisory text, evidence projection) live
 * here so that:
 *   - the handler stays small and easy to reason about,
 *   - adding a new handoff field does not require editing the handler,
 *   - all pure logic can be unit-tested without a kernel / state store.
 *
 * Additionally owns the `[domain:X]` tag format shared between the
 * triage handler (producer) and the advisory builder (consumer).
 */

import type { ItemSummary, TriageHandoff, TriageRecord } from "../types.js";
import type { TriageResult } from "../types.js";
import { extractPriorAttempts } from "./historian.js";
import { toHandoffEvidence, toBrowserSignals } from "./handoff-evidence.js";

// ---------------------------------------------------------------------------
// Domain-tag format — single source of truth shared with triage-handler's
// `reset-nodes` reason line.
// ---------------------------------------------------------------------------

const DOMAIN_TAG_RE = /\[domain:([^\]]+)\]/;

/** Build the `[domain:X]` tag embedded in a reset reason. */
export function formatDomainTag(domain: string): string {
  return `[domain:${domain}]`;
}

/** Parse the `[domain:X]` tag out of a reset reason. Returns null when
 *  the reason carries no tag. */
export function parseDomainTag(reason: string): string | null {
  return DOMAIN_TAG_RE.exec(reason)?.[1] ?? null;
}

// ---------------------------------------------------------------------------
// Handoff field helpers (pure)
// ---------------------------------------------------------------------------

/** Trim a raw error trace to at most `maxLines` lines, preserving the head. */
export function truncateError(raw: string, maxLines = 40): string {
  const lines = raw.split(/\r?\n/);
  if (lines.length <= maxLines) return raw.trimEnd();
  const head = lines.slice(0, maxLines).join("\n");
  return `${head}\n… (${lines.length - maxLines} more lines)`;
}

/** Minimal error-log shape we depend on. Duplicated from
 *  `historian.ts` to keep this module state-shape-local. */
interface HandoffLogEntry {
  readonly timestamp: string;
  readonly itemKey: string;
  readonly message: string;
  readonly errorSignature?: string | null;
}

/**
 * Round-2 R3 — consecutive-domain advisory.
 *
 * When the last two reroute cycles both classified into `currentDomain`,
 * the redevelopment cycle is almost certainly looping on the same root
 * cause with incrementally mutated symptoms. Surface an advisory string
 * so the next dev agent sees the pattern explicitly and can choose a
 * `agent-branch.sh revert` clean-slate rebuild. Returns `undefined`
 * when the advisory does not apply.
 */
export function buildConsecutiveDomainAdvisory(
  errorLog: readonly HandoffLogEntry[],
  currentDomain: string,
): string | undefined {
  const prior = extractPriorAttempts(errorLog);
  if (prior.length < 2) return undefined;
  const last = prior[prior.length - 1];
  const prev = prior[prior.length - 2];
  const lastDomain = parseDomainTag(last.resetReason);
  const prevDomain = parseDomainTag(prev.resetReason);
  if (!lastDomain || !prevDomain) return undefined;
  if (lastDomain !== prevDomain || lastDomain !== currentDomain) return undefined;
  return (
    `The last two reroute cycles both classified as \`${currentDomain}\` and ` +
    `this cycle is the **third** in that domain. The pipeline is almost ` +
    `certainly looping on the same root cause. If your next fix is not ` +
    `decisively different from the prior two, stop and run ` +
    `\`bash tools/autonomous-factory/agent-branch.sh revert\` to reset this ` +
    `feature branch to the base and rebuild from scratch — the circuit ` +
    `breaker grants one bypass for exactly this case.`
  );
}

// ---------------------------------------------------------------------------
// Top-level builder
// ---------------------------------------------------------------------------

export interface BuildTriageHandoffArgs {
  readonly failingNodeKey: string;
  readonly rawError: string;
  readonly triageRecord: Pick<TriageRecord, "error_signature">;
  readonly triageResult: Pick<TriageResult, "domain" | "reason">;
  readonly priorAttemptCount: number;
  readonly pipelineSummaries: ReadonlyArray<Readonly<ItemSummary>>;
  readonly errorLog: readonly HandoffLogEntry[];
  /** Raw structured-failure payload (e.g. a Playwright `StructuredFailure`).
   *  Projected into `TriageHandoff.evidence` via `toHandoffEvidence`. */
  readonly structuredFailure: unknown;
}

/**
 * Assemble the full `TriageHandoff` structure the adapter renders into
 * markdown for the dev agent. Pure — no I/O, no state reads.
 */
export function buildTriageHandoff(args: BuildTriageHandoffArgs): TriageHandoff {
  const {
    failingNodeKey,
    rawError,
    triageRecord,
    triageResult,
    priorAttemptCount,
    pipelineSummaries,
    errorLog,
    structuredFailure,
  } = args;

  const failingSummary = [...pipelineSummaries].reverse().find((s) => s.key === failingNodeKey);

  return {
    failingItem: failingNodeKey,
    errorExcerpt: truncateError(rawError),
    errorSignature: triageRecord.error_signature,
    triageDomain: triageResult.domain,
    triageReason: triageResult.reason,
    priorAttemptCount,
    touchedFiles: failingSummary?.filesChanged ?? [],
    advisory: buildConsecutiveDomainAdvisory(errorLog, triageResult.domain),
    evidence: toHandoffEvidence(structuredFailure),
    browserSignals: toBrowserSignals(structuredFailure),
  };
}
