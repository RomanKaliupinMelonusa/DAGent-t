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
import type { BaselineProfile } from "../ports/baseline-loader.js";
import { extractPriorAttempts } from "./historian.js";
import { toHandoffEvidence, toBrowserSignals, toFailedTests } from "./handoff-evidence.js";
import { featureRelPath } from "../adapters/feature-paths.js";
import { getArtifactSchemaVersion } from "../apm/artifact-catalog.js";

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
// Debug-notes recommendation parser
// ---------------------------------------------------------------------------

/** Headings recognised in a `storefront-debug` `debug-notes.md` body that
 *  signal the agent's own diagnosis: the next failure will actually be in
 *  test code, not the component. Both currently map to the same inferred
 *  domain (`test-code`); when both are present, `Remaining Test-Code Issue`
 *  is preferred (it is the stronger "next failure will be here" signal vs.
 *  the advisory follow-up note). */
const DEBUG_RECOMMENDATION_HEADINGS: ReadonlyArray<{
  readonly pattern: RegExp;
  readonly domain: "test-code";
  readonly priority: number;
}> = [
  { pattern: /^##\s+Remaining\s+Test-Code\s+Issue\s*$/im, domain: "test-code", priority: 0 },
  { pattern: /^##\s+Unit\s+Test\s+Follow-ups\s*$/im, domain: "test-code", priority: 1 },
];

/**
 * Parse a `storefront-debug` `debug-notes.md` body for a domain
 * recommendation. Returns `null` when:
 *   - no recognised heading is found,
 *   - the body following a recognised heading is whitespace-only,
 *   - the inferred domain is not in `allowedDomains` (caller's failing-
 *     node routing table) — the recommendation cannot bias the LLM
 *     toward an unroutable verdict.
 *
 * Pure — no I/O, no shared state. The caller is expected to read the
 * `debug-notes.md` artifact via the artifact bus and pass the contents
 * here.
 */
export function parseDebugRecommendation(
  notesMarkdown: string,
  allowedDomains: readonly string[],
): { domain: string; note: string } | null {
  if (!notesMarkdown) return null;
  // Find the highest-priority recognised heading present in the body.
  let chosen: { domain: "test-code"; index: number; matchLen: number; priority: number } | null = null;
  for (const h of DEBUG_RECOMMENDATION_HEADINGS) {
    const m = h.pattern.exec(notesMarkdown);
    if (!m) continue;
    if (!chosen || h.priority < chosen.priority) {
      chosen = { domain: h.domain, index: m.index, matchLen: m[0].length, priority: h.priority };
    }
  }
  if (!chosen) return null;
  if (!allowedDomains.includes(chosen.domain)) return null;

  // Extract body from end of heading line to next `## ` heading or EOF.
  const after = notesMarkdown.slice(chosen.index + chosen.matchLen);
  const nextHeading = /^##\s+/m.exec(after);
  const body = nextHeading ? after.slice(0, nextHeading.index) : after;
  const trimmed = body.trim();
  if (trimmed.length === 0) return null;
  return { domain: chosen.domain, note: trimmed };
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
  /** The item being re-invoked after the reroute (the "route_to" target).
   *  Used as the preferred source when the failing item did not itself
   *  write any files (scripts like `e2e-runner`, `push-app`). Optional —
   *  when unset the builder still walks `pipelineSummaries` backward for
   *  any recent writer. */
  readonly routeToKey?: string;
  /** Optional per-channel counts of baseline-filtered signals. Surfaced
   *  as a provenance footer under the Browser signals block so the dev
   *  agent can confirm the filter ran. Defaults to zero / omitted when
   *  no filtering happened. */
  readonly baselineDropCounts?: { readonly console: number; readonly network: number; readonly uncaught: number };
  /** Loaded baseline profile (from `baseline-analyzer`'s
   *  `_BASELINE.json`). When present, `buildTriageHandoff` emits a
   *  `baselineRef` pointer on the returned handoff so a future debug
   *  agent can read the catalogue to filter pre-feature noise.
   *  Null / undefined → no `baselineRef` is emitted. */
  readonly baseline?: BaselineProfile | null;
  /** Feature slug — used to construct the `_BASELINE.json` path on
   *  `baselineRef`. Ignored when `baseline` is absent. */
  readonly slug?: string;
  /** Invocation id of the triage node itself. When set, `buildTriageHandoff`
   *  stamps it onto the returned handoff so a downstream `reset-for-reroute`
   *  dispatch can record it as `parentInvocationId` — giving the artifact-bus
   *  lineage a traversable chain from the original failure through every
   *  reroute (Phase 5 follow-up). Absent = legacy behaviour. */
  readonly triageInvocationId?: string;
  /** Raw `debug-notes.md` body harvested from the most recent completed
   *  `storefront-debug` invocation (if any). The handler reads the file
   *  via the artifact bus and passes the string here so this module
   *  remains pure. When `parseDebugRecommendation` returns a non-null
   *  result against `allowedDomains`, the parsed recommendation is
   *  surfaced on the handoff as `priorDebugRecommendation`. */
  readonly debugNotesText?: string;
  /** `cycleIndex` of the source `storefront-debug` invocation. Stamped
   *  onto `priorDebugRecommendation.cycleIndex` so the LLM router and
   *  the dev agent can tell how recent the diagnosis is. Ignored when
   *  `debugNotesText` is absent. */
  readonly debugNotesCycleIndex?: number;
  /** Allowed fault domains for the failing node — typically
   *  `Object.keys(failureRoutes)`. The recommendation parser refuses
   *  to surface a domain not in this list so the LLM cannot be biased
   *  toward an unroutable verdict. Ignored when `debugNotesText` is
   *  absent. */
  readonly allowedDomains?: readonly string[];
}

/**
 * Resolve `touchedFiles` with provenance.
 *
 * Priority:
 *   1. Files written by the failing item itself (source = "self").
 *   2. Files written by the route-to target's most recent summary
 *      (source = routeToKey) — this is the typical redevelopment case
 *      where an E2E script fails and we re-invoke the dev agent that
 *      last wrote the code.
 *   3. Files written by the most recent summary in `pipelineSummaries`
 *      that actually changed files (source = that key).
 *
 * Returns `{ files: [], source: undefined }` when nothing was captured.
 */
function resolveTouchedFiles(
  failingKey: string,
  routeToKey: string | undefined,
  pipelineSummaries: ReadonlyArray<Readonly<ItemSummary>>,
): { files: readonly string[]; source?: string } {
  const reversed = [...pipelineSummaries].reverse();
  const failing = reversed.find((s) => s.key === failingKey);
  if (failing && failing.filesChanged.length > 0) {
    return { files: failing.filesChanged, source: "self" };
  }
  if (routeToKey) {
    const routeTo = reversed.find((s) => s.key === routeToKey);
    if (routeTo && routeTo.filesChanged.length > 0) {
      return { files: routeTo.filesChanged, source: routeToKey };
    }
  }
  return { files: [] };
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
    routeToKey,
    baselineDropCounts,
    baseline,
    slug,
    triageInvocationId,
    debugNotesText,
    debugNotesCycleIndex,
    allowedDomains,
  } = args;

  const touched = resolveTouchedFiles(failingNodeKey, routeToKey, pipelineSummaries);
  const drops = baselineDropCounts &&
    (baselineDropCounts.console + baselineDropCounts.network + baselineDropCounts.uncaught > 0)
    ? baselineDropCounts
    : undefined;

  // Baseline pointer — compact metadata only. The full catalogue lives on
  // disk at the given path so the current dev agent doesn't pay the token
  // cost, but a future debug agent (Playwright MCP) can open the file to
  // filter pre-feature console / network / uncaught noise out of whatever
  // it harvests at runtime.
  let baselineRef: TriageHandoff["baselineRef"];
  if (baseline && slug) {
    baselineRef = {
      path: featureRelPath(slug, "baseline"),
      consolePatternCount: baseline.console_errors?.length ?? 0,
      networkPatternCount: baseline.network_failures?.length ?? 0,
      uncaughtPatternCount: baseline.uncaught_exceptions?.length ?? 0,
    };
  }

  // Prior debug-cycle recommendation — parsed from the most recent
  // storefront-debug debug-notes body if the handler supplied one and the
  // body carries a recognised heading whose inferred domain is routable.
  let priorDebugRecommendation: TriageHandoff["priorDebugRecommendation"];
  if (
    debugNotesText !== undefined
    && allowedDomains !== undefined
    && typeof debugNotesCycleIndex === "number"
  ) {
    const parsed = parseDebugRecommendation(debugNotesText, allowedDomains);
    if (parsed) {
      priorDebugRecommendation = {
        domain: parsed.domain,
        note: parsed.note,
        cycleIndex: debugNotesCycleIndex,
      };
    }
  }

  return {
    schemaVersion: getArtifactSchemaVersion("triage-handoff") as 1 | undefined,
    failingItem: failingNodeKey,
    errorExcerpt: truncateError(rawError),
    errorSignature: triageRecord.error_signature,
    triageDomain: triageResult.domain,
    triageReason: triageResult.reason,
    priorAttemptCount,
    touchedFiles: touched.files,
    touchedFilesSource: touched.source,
    advisory: buildConsecutiveDomainAdvisory(errorLog, triageResult.domain),
    evidence: toHandoffEvidence(structuredFailure),
    browserSignals: toBrowserSignals(structuredFailure),
    baselineDropCounts: drops,
    failedTests: toFailedTests(structuredFailure),
    baselineRef,
    triageInvocationId,
    priorDebugRecommendation,
  };
}
