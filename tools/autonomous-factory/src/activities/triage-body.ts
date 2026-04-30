/**
 * handlers/triage.ts — Triage node handler for failure classification.
 *
 * A first-class DAG node handler that classifies pipeline failures using the
 * 2-layer triage engine (RAG + LLM). Dispatched by the kernel via `on_failure`
 * edges or through standard DAG scheduling (Phase 4+).
 *
 * The handler is a PURE CLASSIFIER — it returns declarative DagCommands for
 * the kernel's command executor to process. It never calls state-mutation
 * APIs directly (resetNodes, salvageForDraft, etc.).
 *
 * Read-only state access (getStatus) is permitted for observation:
 *   - Reading errorLog for cycle count estimation
 *   - Reading executionLog for attempt count derivation
 *
 * Handler output contract (`handlerOutput`):
 *   - routeToKey: string | null  — DAG node to reset (null = graceful degradation)
 *   - domain: string             — classified fault domain
 *   - reason: string             — human-readable reason
 *   - source: "contract" | "rag" | "llm" | "fallback" — which classification layer matched
 *   - triageRecord: TriageRecord — full record (serialised to the `triage-handoff` artifact after execute)
 *   - guardResult: string        — pre-triage guard outcome ("passed" | guard name)
 */

import type { NodeBudgetPolicy } from "../app-types.js";
import type { NodeHandler, NodeContext, NodeResult, DagCommand } from "../activity-lib/types.js";
import type { CompiledTriageProfile } from "../apm/types.js";
import type { TriageRecord, TriageResult, TriageHandoff, ArtifactRefSerialized } from "../types.js";
import { RESET_OPS } from "../types.js";
import { newInvocationId } from "../domain/invocation-id.js";
import { evaluateTriage } from "../triage/index.js";
import { computeErrorSignature } from "../triage/error-fingerprint.js";
import { classifyOrchestratorContractError } from "../triage/index.js";
import { evaluateProfilePatterns } from "../triage/contract-classifier.js";
import { buildTriageHandoff, formatDomainTag, buildLoopAdvisory, detectSameTestLoop } from "../triage/handoff-builder.js";
import { extractPriorAttempts } from "../triage/historian.js";import type { AcceptanceContract } from "../apm/acceptance-schema.js";
import { isEvidenceEmpty } from "../triage/llm-router.js";
import { getWorkflowNode, resolveNodeBudgetPolicy } from "../session/dag-utils.js";
import { getUpstream } from "../domain/dag-graph.js";
import { resolveIdleTimeoutLimit } from "../activity-lib/agent-limits.js";
import type { TriageArtifactLoader } from "../ports/triage-artifact-loader.js";
import { buildEnvelope } from "../apm/artifact-catalog.js";
import { filterNoise, getLastDropCounts } from "../triage/baseline-filter.js";
import { toFailedTests } from "../triage/handoff-evidence.js";
import type { BaselineProfile } from "../ports/baseline-loader.js";
// ---------------------------------------------------------------------------
// Triage handler output — typed contract for kernel consumption
// ---------------------------------------------------------------------------

export interface TriageHandlerOutput {
  /** DAG node key to reset, or null to signal graceful degradation (blocked). */
  routeToKey: string | null;
  /** Classified fault domain. */
  domain: string;
  /** Human-readable classification reason. */
  reason: string;
  /** Which classification layer produced the result. */
  source: "contract" | "rag" | "llm" | "fallback";
  /** Full triage record — kept on `handlerOutput` for telemetry / RAG /
   *  LLM observability. NOT serialised to the on-disk `triage-handoff`
   *  artifact (the rerouted dev agent receives the structured
   *  `TriageHandoff` payload below instead). */
  triageRecord: TriageRecord;
  /** Structured handoff payload built by `buildTriageHandoff`. The outer
   *  `attachTriageHandoffArtifact` wrapper serialises this to
   *  `outputs/triage-handoff.json` so the rerouted dev / debug node sees
   *  the diagnosis + evidence (not the RAG/LLM internals). Absent on
   *  guard / salvage / degradation paths where no reroute happens. */
  triageHandoff?: TriageHandoff;
  /** Pre-triage guard outcome — "passed" if guards did not intercept. */
  guardResult: TriageRecord["guard_result"];
  /** When the triage decision was a reroute, the routed-to node + the
   *  pre-allocated invocationId of the staged downstream record. Used by
   *  the outer execute wrapper to:
   *    (a) attach a `routedTo` field on the triage InvocationRecord so
   *        it self-describes its callee, and
   *    (b) emit a `triage.routed` telemetry event linking failing →
   *        triage → routed-to in a single line. */
  routedTo?: {
    readonly nodeKey: string;
    readonly invocationId: string;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve the compiled triage profile for a triage node. */
function resolveProfile(ctx: NodeContext): CompiledTriageProfile | undefined {
  const node = getWorkflowNode(ctx.apmContext, ctx.pipelineState.workflowName, ctx.itemKey);
  const profileName = node?.triage_profile;
  if (!profileName) return undefined;
  return ctx.apmContext.triage_profiles?.[`${ctx.pipelineState.workflowName}.${profileName}`];
}

/**
 * Build DagCommands for graceful degradation (salvage to Draft PR).
 * Replaces the old `executeSalvage()` helper that called state APIs directly.
 */
/**
 * Build DagCommands for graceful degradation (salvage to Draft PR).
 *
 * A4 — every $BLOCKED outcome also emits a `note-triage-blocked` entry
 * so the blocked-verdict circuit breaker can count repeats per failing
 * item across the run. The triage record carries the domain, reason,
 * and error signature; this helper threads them onto the command so the
 * kernel reducer can record them on the errorLog without re-deriving.
 */
function buildSalvageCommands(
  failingKey: string,
  errorMsg: string,
  triageRecord: TriageRecord,
): DagCommand[] {
  // The triage record itself is serialised to the `triage-handoff` artifact
  // by the outer execute wrapper; no kernel command is needed for persistence.
  return [
    { type: "salvage-draft", failedItemKey: failingKey, reason: errorMsg },
    {
      type: "note-triage-blocked",
      failedItemKey: failingKey,
      domain: triageRecord.domain,
      reason: triageRecord.reason,
      ...(triageRecord.error_signature ? { errorSignature: triageRecord.error_signature } : {}),
    },
  ];
}

/**
 * Build a minimal `TriageHandoff` for a degradation exit (no reroute).
 *
 * The triage node declares `triage-handoff` in its `produces_artifacts`,
 * so every completed invocation owes the ledger a handoff file — even
 * when the classification resolved to graceful degradation and no
 * downstream dev agent will consume it. Writing the artifact also
 * preserves the diagnosis on disk for post-mortem inspection and
 * satisfies the `missing_required_output:triage-handoff` contract
 * check in the seal path.
 *
 * The handoff is tagged `degraded: true` (via the optional field on
 * `TriageHandoff`) so any future consumer can tell apart a
 * reroute-carrying handoff from a record-only degradation handoff.
 */
function buildDegradationHandoff(args: {
  readonly failingNodeKey: string;
  readonly rawError: string;
  readonly errorSignature: string;
  readonly domain: string;
  readonly reason: string;
  readonly triageInvocationId?: string;
}): TriageHandoff {
  return {
    schemaVersion: 1,
    failingItem: args.failingNodeKey,
    errorExcerpt: truncateErrorExcerpt(args.rawError),
    errorSignature: args.errorSignature,
    triageDomain: args.domain,
    triageReason: args.reason,
    priorAttemptCount: 0,
    degraded: true,
    ...(args.triageInvocationId
      ? { triageInvocationId: args.triageInvocationId }
      : {}),
  };
}

/** Trim a raw error trace to at most 40 lines for the degradation handoff.
 *  Mirrors `triage/handoff-builder.ts#truncateError` without taking a
 *  dependency on it — the degradation path doesn't need touched-files,
 *  advisories, or evidence projection. */
function truncateErrorExcerpt(raw: string, maxLines = 40): string {
  const lines = raw.split(/\r?\n/);
  if (lines.length <= maxLines) return raw.trimEnd();
  return `${lines.slice(0, maxLines).join("\n")}\n… (${lines.length - maxLines} more lines)`;
}

// ---------------------------------------------------------------------------
// Prior debug-cycle structured-hint lookup
// ---------------------------------------------------------------------------

/**
 * Resolved hint surfaced to the LLM router and the dev-agent handoff.
 * Shape matches `TriageHandoff.priorDebugRecommendation` so the outer
 * caller can pass it through unmodified.
 */
interface LoadedDebugRecommendation {
  readonly cycleIndex: number;
  readonly recommendation: { domain: string; note: string };
}

/**
 * Walk the persisted invocation ledger for the most recent
 * completed-and-sealed invocation whose agent emitted a structured
 * `nextFailureHint` via `report_outcome`. Producer-agnostic — any
 * debug-class agent that records a hint is eligible.
 *
 * Filters out hints whose `domain` is not in `allowedDomains` so the
 * recommendation cannot bias the LLM toward an unroutable verdict.
 *
 * Picks the lex-greatest `finishedAt` (ISO timestamps are
 * lex-sortable), tiebreak by lex-greatest `invocationId` — same
 * selector as `FileArtifactBus.findLatestArtifact`.
 *
 * Pure (apart from the in-memory `artifacts` walk). Returns `null` when
 * nothing eligible is found.
 */
function loadDebugRecommendation(
  artifacts:
    | Record<string, {
        nodeKey: string;
        cycleIndex: number;
        outcome?: string;
        sealed?: boolean;
        finishedAt?: string;
        invocationId: string;
        nextFailureHint?: { domain: string; target_node: string; summary: string };
      }>
    | undefined,
  allowedDomains: readonly string[],
): LoadedDebugRecommendation | null {
  if (!artifacts) return null;
  if (allowedDomains.length === 0) return null;

  let best: { rec: NonNullable<typeof artifacts>[string] } | null = null;
  for (const rec of Object.values(artifacts)) {
    if (rec.sealed !== true) continue;
    if (rec.outcome !== "completed") continue;
    if (!rec.finishedAt) continue;
    const hint = rec.nextFailureHint;
    if (!hint) continue;
    if (!allowedDomains.includes(hint.domain)) continue;
    if (
      !best
      || (rec.finishedAt > (best.rec.finishedAt ?? ""))
      || (rec.finishedAt === best.rec.finishedAt && rec.invocationId > best.rec.invocationId)
    ) {
      best = { rec };
    }
  }
  if (!best) return null;

  const hint = best.rec.nextFailureHint!;
  return {
    cycleIndex: best.rec.cycleIndex,
    recommendation: { domain: hint.domain, note: hint.summary },
  };
}

/**
 * Result of `buildRerouteCommands` — the kernel commands to push, plus
 * the structured `TriageHandoff` payload built along the way so the
 * caller can stash it on `handlerOutput.triageHandoff` for the outer
 * `attachTriageHandoffArtifact` wrapper to serialise.
 */
interface RerouteBuildResult {
  readonly commands: DagCommand[];
  readonly handoff?: TriageHandoff;
  /** Pre-allocated invocationId of the staged downstream record. Returned
   *  so the outer execute wrapper can stamp it on `handlerOutput.routedTo`
   *  and use it for the `triage.routed` event. */
  readonly routedToInvocationId?: string;
}

/**
 * Build DagCommands for a successful reroute (reset target + downstream).
 * Assembles: reset-nodes → stage-invocation → reindex. Also builds the
 * structured `TriageHandoff` payload and returns it so the caller can
 * propagate it to `handlerOutput.triageHandoff` — the outer execute
 * wrapper serialises it to the on-disk `triage-handoff` artifact.
 */
async function buildRerouteCommands(
  ctx: NodeContext,
  routeToKey: string,
  triageRecord: TriageRecord,
  triageResult: TriageResult,
  maxReroutes: number,
  routeToPolicy: NodeBudgetPolicy,
  failingNodeKey: string,
  rawError: string,
  /** Baseline-filtered structured failure — same payload the classifier saw.
   *  Projected into the dev-agent handoff so console/network/uncaught signals
   *  travel alongside the Playwright assertion excerpt. */
  structuredFailure: unknown,
  /** Loaded baseline profile (may be null). Passed through to
   *  `composeTriageContext` so the raw-mode narrative can subtract
   *  pre-feature platform noise from the inlined failure output. */
  baseline: BaselineProfile | null,
  /** Per-channel counts of baseline-filtered signals from the
   *  `filterNoise` invocation that produced `structuredFailure`. Rendered
   *  as a provenance footer in the dev-agent handoff so the agent can
   *  confirm the filter ran. Zero / omitted when no filtering happened. */
  baselineDropCounts?: { console: number; network: number; uncaught: number },
  /** Prior debug-cycle recommendation parsed from the most recent
   *  `storefront-debug` `debug-notes.md`. Threaded into
   *  `buildTriageHandoff` so the rerouted dev agent sees the diagnosis
   *  inline. The same recommendation has already biased the LLM router
   *  upstream of this call. Absent when no eligible debug-notes exist
   *  or no recognised heading was present. */
  priorDebugRecommendation?: LoadedDebugRecommendation | null,
): Promise<RerouteBuildResult> {
  const { slug } = ctx;
  const commands: DagCommand[] = [];
  let handoff: TriageHandoff | undefined;
  let routedToInvocationId: string | undefined;

  // 1. Reset target node + all downstream dependents
  //    (the structured handoff is serialised to the `triage-handoff`
  //    artifact by the outer execute wrapper using the `handoff` value
  //    returned from this function — no persistence command needed.)
  const taggedReason = `${formatDomainTag(triageResult.domain)} [source:${triageResult.source}] ${triageResult.reason}`;

  // 0. Bypass the failing node when it is a transitive structural ancestor
  //    of the reroute target. Without this, the scheduler keeps the route
  //    target gated behind the still-failed parent and the reroute
  //    live-locks. The kernel flips the failing item from `failed` → `na`
  //    with a `bypassedFor: { routeTarget }` marker; the seal hook
  //    consumes the marker on successful completion of the route target
  //    to emit `reset-nodes` (logKey `reset-after-fix`) which re-validates
  //    the gate against the fix.
  //
  //    Skip when failing == route target (`$SELF` reroute) or when the
  //    failing node is downstream of the route target (the upstream node's
  //    `reset-nodes` cascade already handles re-running the failing one).
  if (failingNodeKey !== routeToKey) {
    const ancestors = getUpstream(ctx.pipelineState.dependencies, [routeToKey]);
    if (ancestors.includes(failingNodeKey)) {
      commands.push({
        type: "bypass-node",
        nodeKey: failingNodeKey,
        routeTarget: routeToKey,
        reason: taggedReason,
      });
    }
  }

  commands.push({
    type: "reset-nodes",
    seedKey: routeToKey,
    reason: taggedReason,
    logKey: RESET_OPS.RESET_FOR_REROUTE,
    maxCycles: maxReroutes,
  });

  // 2. Stage an unsealed `InvocationRecord` for the routed-to node.
  //    Phase 6 — the staged record carries trigger + parent lineage only.
  //    Re-entrance context flows through the `triage-handoff` JSON
  //    artifact (declared via `consumes_reroute`); Phase 3's
  //    `materializeInputsMiddleware` copies it into `<inv>/inputs/`
  //    before the dev agent runs. No prose `pendingContext` is built or
  //    persisted anymore.
  // Pre-allocate the staged invocationId outside the try so we can carry
  // it on `RerouteBuildResult.routedToInvocationId` even if the handoff
  // assembly fails (the reset-nodes + reindex path still went through).
  const stagedInvocationId = newInvocationId();
  try {
    const pipeStateForCtx = await ctx.stateReader.getStatus(slug);
    // Build the structured handoff so the outer `attachTriageHandoffArtifact`
    // wrapper can write `outputs/triage-handoff.json` for this triage
    // invocation. The `priorAttemptCount` reflects feature-level effort
    // (executionLog entries for the failing node + reset-for-reroute
    // cycles) so the rendered "Prior attempts" line tells the truth.
    const execAttempts = (pipeStateForCtx.executionLog ?? [])
      .filter((r: { nodeKey: string }) => r.nodeKey === failingNodeKey).length;
    const cycleAttempts = extractPriorAttempts(pipeStateForCtx.errorLog ?? []).length;
    const priorAttemptCount = execAttempts + cycleAttempts;
    handoff = buildTriageHandoff({
      failingNodeKey,
      rawError,
      triageRecord,
      triageResult,
      priorAttemptCount,
      pipelineSummaries: ctx.pipelineSummaries,
      errorLog: pipeStateForCtx.errorLog ?? [],
      structuredFailure,
      routeToKey,
      baselineDropCounts,
      baseline,
      slug,
      triageInvocationId: ctx.executionId,
      ...(priorDebugRecommendation
        ? {
            priorDebugRecommendation: {
              domain: priorDebugRecommendation.recommendation.domain,
              note: priorDebugRecommendation.recommendation.note,
              cycleIndex: priorDebugRecommendation.cycleIndex,
            },
          }
        : {}),
    });
    commands.push({
      type: "stage-invocation",
      itemKey: routeToKey,
      invocationId: stagedInvocationId,
      parentInvocationId: ctx.executionId,
      trigger: "triage-reroute",
      producedBy: `${ctx.itemKey}#${ctx.executionId}`,
    });
    routedToInvocationId = stagedInvocationId;
  } catch { /* non-fatal — reroute still happens via reset-nodes alone */ }

  // 3. Re-index semantic graph if target category needs it
  const targetCat = getWorkflowNode(ctx.apmContext, ctx.pipelineState.workflowName, routeToKey)?.category;
  if (targetCat) {
    commands.push({ type: "reindex", categories: [targetCat] });
  }

  return { commands, handoff, ...(routedToInvocationId ? { routedToInvocationId } : {}) };
}

// ---------------------------------------------------------------------------
// Handler implementation
// ---------------------------------------------------------------------------

/**
 * Serialise the structured `TriageHandoff` payload to the canonical
 * `triage-handoff` artifact and attach a runtime `producedArtifacts`
 * ref so the seal hook records it on the InvocationRecord. Best-effort:
 * failures are swallowed so the reroute still proceeds (the dev agent
 * will just lack the structured handoff JSON until the next cycle).
 *
 * The wire format is the `TriageHandoff` interface (see `src/types.ts`),
 * not the internal `TriageRecord` — the receiving dev / debug agent
 * needs the diagnosis + evidence, not the RAG/LLM internals.
 */
async function attachTriageHandoffArtifact(
  ctx: NodeContext,
  result: NodeResult,
): Promise<NodeResult> {
  const handoff = (result.handlerOutput as TriageHandlerOutput | undefined)?.triageHandoff;
  // Invariant: a written triage-handoff implies a completed triage. If the
  // inner handler ever attaches a handoff while also returning a non-
  // completed outcome (today unreachable — guard/salvage/error paths all
  // omit `triageHandoff`), emit telemetry so the anomaly is visible and
  // skip the write. The reroute resolver in
  // `loop/dispatch/invocation-builder.ts` no longer filters producers by
  // outcome, so a handoff written here would still be resolvable — but
  // the cleaner contract is to refuse the write and surface the bug.
  if (result.outcome !== "completed") {
    if (handoff) {
      ctx.logger.event("triage.handoff.skipped_non_completed", ctx.itemKey, {
        invocationId: ctx.executionId,
        outcome: result.outcome,
        errorMessage: result.errorMessage,
      });
    }
    return result;
  }
  if (!handoff) return result;
  try {
    const bus = ctx.artifactBus;
    const ref = bus.ref(ctx.slug, "triage-handoff", {
      nodeKey: ctx.itemKey,
      invocationId: ctx.executionId,
    });
    // Session A (Item 8) — emit envelope natively (strict-compatible).
    const envelope = buildEnvelope("triage-handoff", ctx.itemKey);
    const body = { ...envelope, ...handoff };
    await bus.write(ref, JSON.stringify(body, null, 2) + "\n");
    const serialized: ArtifactRefSerialized = {
      kind: ref.kind,
      scope: ref.scope,
      slug: ref.slug,
      ...(ref.scope === "node"
        ? { nodeKey: ref.nodeKey, invocationId: ref.invocationId }
        : {}),
      path: ref.path,
    };
    return {
      ...result,
      producedArtifacts: [...(result.producedArtifacts ?? []), serialized],
    };
  } catch {
    // non-fatal — reroute still works without the artifact
    return result;
  }
}

const triageHandlerInner: NodeHandler = {
  name: "triage",

  async execute(ctx: NodeContext): Promise<NodeResult> {
    const { slug, logger } = ctx;

    // --- Validate failure context ---
    const failingNodeKey = ctx.failingNodeKey;
    const rawError = ctx.rawError;
    if (!failingNodeKey || !rawError) {
      return {
        outcome: "error",
        errorMessage: "Triage handler invoked without failure context (failingNodeKey/rawError missing).",
        summary: {},
      };
    }

    // --- Resolve triage profile ---
    const profile = resolveProfile(ctx);
    if (!profile) {
      return {
        outcome: "error",
        errorMessage: `Triage node "${ctx.itemKey}" could not resolve triage profile.`,
        summary: {},
      };
    }

    const errorSig = ctx.errorSignature ?? computeErrorSignature(rawError);

    // --- A4 blocked-verdict circuit breaker ---
    // Count prior $BLOCKED outcomes for this same failing item from
    // errorLog. On the 2nd, halt the run instead of issuing another
    // salvage-draft. Reuses `buildLoopAdvisory` (with no current-cycle
    // test names) so the halt reason carries the existing
    // `agent-branch.sh revert` advisory text — no duplication.
    try {
      const pipeStateForCb = await ctx.stateReader.getStatus(slug);
      const blockedFailingPrefix = `[failing:${failingNodeKey}]`;
      const priorBlockedCount = (pipeStateForCb.errorLog ?? []).filter(
        (e) => e.itemKey === RESET_OPS.TRIAGE_BLOCKED && e.message?.startsWith(blockedFailingPrefix),
      ).length;
      if (priorBlockedCount >= 1) {
        // Last-blocked domain — derive from the most recent matching
        // sentinel so the advisory consults the same domain history.
        let lastDomain = "$BLOCKED";
        for (let i = (pipeStateForCb.errorLog ?? []).length - 1; i >= 0; i--) {
          const e = pipeStateForCb.errorLog[i];
          if (e.itemKey === RESET_OPS.TRIAGE_BLOCKED && e.message?.startsWith(blockedFailingPrefix)) {
            const m = /\[domain:([^\]]+)\]/.exec(e.message);
            if (m) lastDomain = m[1];
            break;
          }
        }
        const advisory = buildLoopAdvisory(
          pipeStateForCb.errorLog ?? [],
          lastDomain,
          [],
        );
        const reason =
          `blocked-verdict circuit breaker: ${priorBlockedCount + 1} consecutive $BLOCKED ` +
          `triage outcomes for "${failingNodeKey}" — halting the run instead of cascading ` +
          `another salvage. ${advisory ?? `Run \`bash tools/autonomous-factory/agent-branch.sh revert\` ` +
            `to reset the feature branch and rebuild from scratch.`}`;
        logger.event("triage.evaluate", failingNodeKey, {
          domain: "$BLOCKED-CIRCUIT-BREAKER",
          reason,
          source: "fallback",
          route_to: "$BLOCKED",
          guard_result: "blocked_repeat",
          prior_blocked_count: priorBlockedCount,
        });
        const record: TriageRecord = {
          failing_item: failingNodeKey,
          error_signature: errorSig,
          guard_result: "blocked_repeat",
          guard_detail: `priorBlockedCount=${priorBlockedCount} lastDomain=${lastDomain}`,
          rag_matches: [],
          rag_selected: null,
          llm_invoked: false,
          domain: "$BLOCKED-CIRCUIT-BREAKER",
          reason,
          source: "fallback",
          route_to: "$BLOCKED",
          cascade: [],
          cycle_count: 0,
          domain_retry_count: 0,
        };
        return {
          outcome: "completed",
          summary: { intents: [`triage: repeat $BLOCKED for ${failingNodeKey} → halt`] },
          signals: { halt: true },
          // No salvage-draft — the run is halting. Note-triage-blocked is
          // still recorded so retrospective tooling sees the second hit.
          commands: [
            {
              type: "note-triage-blocked",
              failedItemKey: failingNodeKey,
              domain: "$BLOCKED-CIRCUIT-BREAKER",
              reason,
              errorSignature: errorSig,
            },
          ],
          handlerOutput: {
            routeToKey: null,
            domain: "$BLOCKED-CIRCUIT-BREAKER",
            reason,
            source: "fallback",
            triageRecord: record,
            guardResult: "blocked_repeat",
            triageHandoff: buildDegradationHandoff({
              failingNodeKey,
              rawError,
              errorSignature: errorSig,
              domain: "$BLOCKED-CIRCUIT-BREAKER",
              reason,
              triageInvocationId: ctx.executionId,
            }),
          } satisfies TriageHandlerOutput,
        };
      }
    } catch (err) {
      // Non-fatal — a missing/corrupt state read just means we cannot
      // count prior $BLOCKED sentinels, so we fall through to normal
      // triage. Emit a warning so operators see the breaker degraded.
      console.warn(
        `  ⚠ A4 circuit-breaker state read failed for "${slug}": ${err instanceof Error ? err.message : String(err)} — falling through`,
      );
    }

    // NOTE: Pre-triage guards (timeout, unfixable, dedup, death spiral) have
    // been moved to the kernel's stepTriageGuard dispatch step. If we reach
    // here, all guards have already passed.

    // B2 pre-LLM guard — session.idle circuit breaker.
    // Count prior `[session-idle-timeout]`-tagged entries in errorLog for the
    // failing item. At/over the resolved limit, short-circuit classification
    // and salvage gracefully. Prevents the wedge class where a stuck agent
    // burns N× session.idle timeouts without ever producing a diff.
    try {
      const pipeState = await ctx.stateReader.getStatus(slug);
      const idleTimeoutLimit = resolveIdleTimeoutLimit(ctx.apmContext, failingNodeKey);
      const idleCount = (pipeState.errorLog ?? []).filter(
        (e) => e.itemKey === failingNodeKey && e.message?.includes("[session-idle-timeout]"),
      ).length;
      if (idleCount >= idleTimeoutLimit) {
        const guardReason = `session.idle circuit breaker: ${idleCount}/${idleTimeoutLimit} SDK session timeouts observed for "${failingNodeKey}" — salvaging gracefully`;
        logger.event("triage.evaluate", failingNodeKey, {
          domain: "$GUARD",
          reason: guardReason,
          source: "fallback",
          route_to: "$BLOCKED",
          guard_result: "session_idle_exhausted",
        });
        const record: TriageRecord = {
          failing_item: failingNodeKey,
          error_signature: errorSig,
          guard_result: "session_idle_exhausted",
          guard_detail: `idleCount=${idleCount} limit=${idleTimeoutLimit}`,
          rag_matches: [],
          rag_selected: null,
          llm_invoked: false,
          domain: "$GUARD",
          reason: guardReason,
          source: "fallback",
          route_to: "$BLOCKED",
          cascade: [],
          cycle_count: 0,
          domain_retry_count: 0,
        };
        return {
          outcome: "completed",
          summary: { intents: [`triage: session.idle exhausted (${idleCount}/${idleTimeoutLimit}) → degradation`] },
          signals: { halt: false },
          commands: buildSalvageCommands(failingNodeKey, rawError, record),
          handlerOutput: {
            routeToKey: null,
            domain: "$GUARD",
            reason: guardReason,
            source: "fallback",
            triageRecord: record,
            guardResult: "session_idle_exhausted",
            triageHandoff: buildDegradationHandoff({
              failingNodeKey,
              rawError,
              errorSignature: errorSig,
              domain: "$GUARD",
              reason: guardReason,
              triageInvocationId: ctx.executionId,
            }),
          } satisfies TriageHandlerOutput,
        };
      }
    } catch { /* non-fatal — fall through to classification */ }

    // --- L0 orchestrator-contract guard ---
    // Error signatures of the form `missing_required_input:<kind>` are
    // emitted by the dispatch middleware when an upstream artifact is
    // absent from the ledger at materialization time. Root cause is a
    // kernel / workflow contract bug, NOT a defect in any producing
    // agent's output. Routing these through RAG / LLM triage is actively
    // harmful — the LLM sees "missing acceptance input" and confidently
    // mis-blames the producer while the file sits on disk. Short-circuit
    // to graceful degradation with an accurate diagnosis so an operator
    // investigates the contract / ledger issue (not an agent).
    //
    // Producer-side faults (missing_required_output, invalid_envelope_output)
    // are NOT short-circuited here — they are genuine output-quality
    // failures and route via the L0 `schema-violation` patterns in
    // `triage/builtin-patterns.ts`, typically back to `$SELF` for bounded
    // self-repair via `routeProfiles.base`.
    const contractOrigin = classifyOrchestratorContractError(errorSig);
    if (contractOrigin) {
      const reason =
        `orchestrator-contract fault: node "${failingNodeKey}" reported ` +
        `${errorSig}. This is a pipeline-layer contract error (the ` +
        `consumer declared an artifact kind the ledger cannot resolve), ` +
        `not an agent output quality issue. No reroute — halting via ` +
        `graceful degradation so an operator can inspect the kernel↔` +
        `state-store artifact sync or the workflow's consumes ` +
        `declarations.`;
      logger.event("triage.evaluate", failingNodeKey, {
        domain: "orchestrator-contract",
        reason,
        source: "contract",
        route_to: "$BLOCKED",
        errorSignature: errorSig,
      });
      const record: TriageRecord = {
        failing_item: failingNodeKey,
        error_signature: errorSig,
        guard_result: "passed",
        rag_matches: [],
        rag_selected: null,
        llm_invoked: false,
        domain: "orchestrator-contract",
        reason,
        source: "contract",
        route_to: "$BLOCKED",
        cascade: [],
        cycle_count: 0,
        domain_retry_count: 0,
      };
      return {
        outcome: "completed",
        summary: { intents: [`triage: orchestrator-contract (${errorSig}) → degradation`] },
        signals: { halt: false },
        commands: buildSalvageCommands(failingNodeKey, rawError, record),
        handlerOutput: {
          routeToKey: null,
          domain: "orchestrator-contract",
          reason,
          source: "contract",
          triageRecord: record,
          guardResult: "passed",
          triageHandoff: buildDegradationHandoff({
            failingNodeKey,
            rawError,
            errorSignature: errorSig,
            domain: "orchestrator-contract",
            reason,
            triageInvocationId: ctx.executionId,
          }),
        } satisfies TriageHandlerOutput,
      };
    }

    // --- 2-layer triage classification (RAG → LLM → fallback) ---
    const triageLlm = ctx.triageLlm;
    // D3 — prepend contract evidence (ACCEPTANCE oracle + QA-REPORT) when
    // the artifacts exist. Both RAG and LLM layers then see the structured
    // verdict first, instead of a 30 KB ANSI Playwright blob. No-op when
    // no oracle artifacts are present (pre-Phase-B features).
    //
    // Profiles with `evidence_enrichment: false` opt out entirely — the
    // raw error is fed directly to the classifier without contract
    // prepend. Used by single-shot LLM profiles where structured evidence
    // adds noise rather than signal.
    const artifacts: TriageArtifactLoader = ctx.triageArtifacts;
    const evidenceEnabled = profile.evidence_enrichment !== false;
    const { trace: enrichedError, sources: evidenceSources } = evidenceEnabled
      ? artifacts.loadContractEvidence(slug, rawError)
      : { trace: rawError, sources: [] as readonly string[] };
    if (evidenceSources.length > 0) {
      logger.event("triage.evaluate", failingNodeKey, {
        source: "contract-evidence",
        artifacts: evidenceSources,
      });
    }
    // Layer 0 — structured-failure contract classifier. When the failing
    // handler produced a parsed Playwright report (or future structured
    // artifact) with unambiguous impl-defect signals, skip RAG/LLM and
    // route deterministically. The resolved domain must exist in the
    // failing node's `failureRoutes` map — otherwise we fall through.
    //
    // Round-2 R2: load the feature's ACCEPTANCE.yml (best-effort) and pass
    // it to the classifier so a Playwright timeout on a contract-declared
    // testid deterministically classifies as `frontend`. Missing/malformed
    // contract => null, classifier falls back to its uncaught-error rule.
    let acceptance: AcceptanceContract | null = null;
    try {
      acceptance = artifacts.loadAcceptance(slug);
    } catch {
      acceptance = null;
    }
    // Baseline noise filter — when `baseline-analyzer` captured a
    // pre-feature console/network/uncaught baseline for the target pages,
    // subtract those known-noise signals from the structured failure BEFORE
    // classification. This prevents the impl-defect classifier from
    // tripping on unrelated platform/legacy errors that exist regardless
    // of the feature under test. Best-effort — a missing or malformed
    // baseline is an identity no-op (filterNoise handles the null case).
    //
    // Profiles with `baseline_noise_filter: false` skip both the filter
    // pass and baseline injection into the LLM router. Use this when the
    // baseline travels directly to a downstream node via
    // `consumes_artifacts` and triage no longer needs to inspect it.
    let filteredStructuredFailure: unknown = ctx.structuredFailure;
    let baseline: Awaited<ReturnType<NonNullable<typeof ctx.baselineLoader>["loadBaseline"]>> | null = null;
    let baselineDropCounts: { console: number; network: number; uncaught: number } | undefined;
    if (profile.baseline_noise_filter !== false) {
      try {
        baseline = ctx.baselineLoader?.loadBaseline(slug) ?? null;
        filteredStructuredFailure = filterNoise(ctx.structuredFailure, baseline);
        if (baseline && filteredStructuredFailure !== ctx.structuredFailure) {
          baselineDropCounts = getLastDropCounts();
          logger.event("triage.evaluate", failingNodeKey, {
            source: "baseline-filter",
            baseline_feature: baseline.feature,
            drop_counts: baselineDropCounts,
          });
        }
      } catch { /* non-fatal — fall through with original payload */ }
    }
    // Session B (Item 3) — profile-driven L0 pre-classifier. Built-in
    // patterns (browser-uncaught, contract-testid-timeout,
    // spec-schema-violation) are prepended by the APM compiler unless the
    // profile sets `builtin_patterns: false`. Additional patterns declared
    // on the profile in apm.yml run in order after the built-ins.
    const preLlmVerdict = evaluateProfilePatterns(profile, {
      structuredFailure: filteredStructuredFailure,
      rawError,
      acceptance,
    });
    const failureRoutesForContract = ctx.failureRoutes ?? {};
    // Fetch errorLog once so the LLM router can include prior-attempt
    // classifications in its prompt (anti-misclassification context).
    // Best-effort — a failure here just means the LLM gets a slightly
    // less informed prompt, not a triage failure.
    let errorLogForRouter: readonly { timestamp: string; itemKey: string; message: string; errorSignature?: string | null }[] = [];
    let priorDebugRecommendation: LoadedDebugRecommendation | null = null;
    try {
      const ps = await ctx.stateReader.getStatus(slug);
      errorLogForRouter = ps.errorLog ?? [];
      // Surface the most recent debug-class `nextFailureHint` (emitted via
      // `report_outcome`) to the LLM router and the dev-agent handoff.
      // Allowed domains gate by what the failing node can actually reroute
      // to so we never bias the classifier toward an unroutable verdict.
      const allowedDomains = Object.keys(ctx.failureRoutes ?? {});
      priorDebugRecommendation = loadDebugRecommendation(
        ps.artifacts as Parameters<typeof loadDebugRecommendation>[0],
        allowedDomains,
      );
    } catch { /* non-fatal */ }
    let triageResult: TriageResult =
      isEvidenceEmpty(rawError, filteredStructuredFailure)
        ? (() => {
            // A2 — agent-side wedge marker AND zero post-baseline browser
            // signals/failed tests. Skip the LLM entirely; the prior cycle's
            // verdict must NOT be inherited as evidence. Route as `infra`
            // so the failing node retries instead of cascading a bogus
            // domain. If `infra` is not declared in the failing node's
            // `failureRoutes`, the existing null-route branch below
            // degrades to graceful blocked.
            logger.event("triage.evaluate", failingNodeKey, {
              source: "evidence-empty",
              domain: "infra",
              reason: "agent-side wedge marker; zero browser signals after baseline subtraction",
            });
            return {
              domain: "infra",
              reason:
                "evidence-empty agent-side failure; route to retry not domain inheritance",
              source: "fallback",
              rag_matches: [],
            } satisfies TriageResult;
          })()
      : preLlmVerdict && (preLlmVerdict.domain in failureRoutesForContract)
        ? preLlmVerdict
        : await evaluateTriage(
            enrichedError, profile, triageLlm, slug, ctx.appRoot, logger,
            undefined, baseline, errorLogForRouter, failingNodeKey,
            priorDebugRecommendation
              ? {
                  domain: priorDebugRecommendation.recommendation.domain,
                  note: priorDebugRecommendation.recommendation.note,
                  cycleIndex: priorDebugRecommendation.cycleIndex,
                }
              : undefined,
            filteredStructuredFailure,
          );

    // --- Phase D — same-test loop override ---
    // When the same failing test name has appeared in 2 consecutive prior
    // cycles AND the failing node declares a `test-data` route (typically
    // pointing at `spec-compiler` for fixture re-pick), override whatever
    // domain the LLM/RAG/contract layer produced. The motivating pattern
    // is locator-class mutation looping (e2e-author tweaks selectors
    // cycle after cycle when the real fix is to swap the fixture). We
    // only override when `test-data` is actually routable for this node;
    // otherwise the LLM verdict stands.
    {
      const currentTestNames = (toFailedTests(filteredStructuredFailure) ?? []).map((t) => t.title);
      const sharedTest = detectSameTestLoop(errorLogForRouter, currentTestNames);
      if (sharedTest) {
        const hasTestDataRoute = (ctx.failureRoutes ?? {})["test-data"] !== undefined;
        if (hasTestDataRoute) {
          const original = triageResult;
          logger.event("triage.override.same_test_loop", failingNodeKey, {
            test_name: sharedTest,
            original_domain: original.domain,
            original_reason: original.reason,
            original_source: original.source,
            overridden_domain: "test-data",
          });
          triageResult = {
            ...original,
            domain: "test-data",
            reason:
              `same-test loop override: test "${sharedTest}" failed in 2 prior ` +
              `cycles → routing to spec-compiler for fixture re-pick ` +
              `(was: ${original.domain})`,
          };
        } else {
          logger.event("triage.override.same_test_loop_skipped", failingNodeKey, {
            test_name: sharedTest,
            reason: "no test-data route declared on failing node",
            original_domain: triageResult.domain,
          });
        }
      }
    }

    // --- Resolve route_to from failing node's on_failure.routes (graph-level) ---
    // Fallback: profile.routing[domain].route_to (backward compat)
    let routeToKey: string | null;
    let domainRetryCount = 0;
    const failureRoutes = ctx.failureRoutes ?? {};

    if (triageResult.domain === "$SELF") {
      routeToKey = failingNodeKey;
    } else {
      // Primary: on_failure.routes from the failing node
      const routeFromGraph = failureRoutes[triageResult.domain];
      // Fallback: profile routing table (backward compat for compiled contexts without on_failure.routes)
      const routeEntry = profile.routing[triageResult.domain];
      const resolvedRoute = routeFromGraph !== undefined ? routeFromGraph : (routeEntry?.route_to ?? undefined);

      if (resolvedRoute === null || resolvedRoute === undefined) {
        logger.event("triage.evaluate", failingNodeKey, {
          domain: triageResult.domain,
          reason: triageResult.reason,
          source: triageResult.source,
          route_to: null,
        });
        // No valid route → graceful degradation
        const record: TriageRecord = {
          failing_item: failingNodeKey,
          error_signature: errorSig,
          guard_result: "passed",
          rag_matches: triageResult.rag_matches ?? [],
          rag_selected: triageResult.source === "rag" ? (triageResult.rag_matches?.[0]?.snippet ?? null) : null,
          llm_invoked: triageResult.source === "llm",
          llm_domain: triageResult.source === "llm" ? triageResult.domain : undefined,
          llm_reason: triageResult.source === "llm" ? triageResult.reason : undefined,
          llm_response_ms: triageResult.llm_response_ms,
          domain: triageResult.domain,
          reason: triageResult.reason,
          source: triageResult.source,
          route_to: "$BLOCKED",
          cascade: [],
          cycle_count: 0,
          domain_retry_count: 0,
        };
        return {
          outcome: "completed",
          summary: { intents: [`triage: ${triageResult.domain} → route_to null → degradation`] },
          signals: { halt: false },
          commands: buildSalvageCommands(failingNodeKey, rawError, record),
          handlerOutput: {
            routeToKey: null,
            domain: triageResult.domain,
            reason: triageResult.reason,
            source: triageResult.source,
            triageRecord: record,
            guardResult: "passed",
            triageHandoff: buildDegradationHandoff({
              failingNodeKey,
              rawError,
              errorSignature: errorSig,
              domain: triageResult.domain,
              reason: triageResult.reason,
              triageInvocationId: ctx.executionId,
            }),
          } satisfies TriageHandlerOutput,
        };
      }
      routeToKey = resolvedRoute === "$SELF" ? failingNodeKey : resolvedRoute;

      // Sticky salvage guard — if the target has already been salvaged in a
      // prior cycle, refuse to resurrect it and degrade gracefully instead.
      // Keeps the `salvage-draft` guarantee even when a new failure later
      // classifies into the same domain.
      try {
        const pipeState = await ctx.stateReader.getStatus(slug);
        const routeItem = pipeState.items.find((i) => i.key === routeToKey);
        if (routeItem?.salvaged) {
          logger.event("triage.evaluate", failingNodeKey, {
            domain: triageResult.domain,
            reason: `route_to "${routeToKey}" is salvaged — escalating to graceful degradation`,
            source: triageResult.source,
            route_to: "$BLOCKED",
          });
          const record: TriageRecord = {
            failing_item: failingNodeKey,
            error_signature: errorSig,
            guard_result: "passed",
            rag_matches: triageResult.rag_matches ?? [],
            rag_selected: triageResult.source === "rag" ? (triageResult.rag_matches?.[0]?.snippet ?? null) : null,
            llm_invoked: triageResult.source === "llm",
            llm_domain: triageResult.source === "llm" ? triageResult.domain : undefined,
            llm_reason: triageResult.source === "llm" ? triageResult.reason : undefined,
            llm_response_ms: triageResult.llm_response_ms,
            domain: triageResult.domain,
            reason: `route_to "${routeToKey}" is salvaged`,
            source: triageResult.source,
            route_to: "$BLOCKED",
            cascade: [],
            cycle_count: 0,
            domain_retry_count: 0,
          };
          return {
            outcome: "completed",
            summary: { intents: [`triage: ${triageResult.domain} → ${routeToKey} salvaged → degradation`] },
            signals: { halt: false },
            commands: buildSalvageCommands(failingNodeKey, rawError, record),
            handlerOutput: {
              routeToKey: null,
              domain: triageResult.domain,
              reason: `route_to "${routeToKey}" is salvaged`,
              source: triageResult.source,
              triageRecord: record,
              guardResult: "passed",
              triageHandoff: buildDegradationHandoff({
                failingNodeKey,
                rawError,
                errorSignature: errorSig,
                domain: triageResult.domain,
                reason: `route_to "${routeToKey}" is salvaged`,
                triageInvocationId: ctx.executionId,
              }),
            } satisfies TriageHandlerOutput,
          };
        }
      } catch { /* continue with reroute; kernel reducer will also refuse */ }

      // Per-domain retry cap (from profile routing table)
      if (routeEntry?.retries) {
        try {
          const pipeState = await ctx.stateReader.getStatus(slug);
          const domainTag = `[domain:${triageResult.domain}]`;
          let consecutiveCount = 0;
          for (let i = (pipeState.errorLog ?? []).length - 1; i >= 0; i--) {
            const entry = pipeState.errorLog[i];
            if (entry.itemKey === RESET_OPS.RESET_FOR_REROUTE && entry.message?.includes(domainTag)) {
              consecutiveCount++;
            } else if (entry.itemKey === RESET_OPS.RESET_FOR_REROUTE) {
              break;
            }
          }
          domainRetryCount = consecutiveCount;
          if (consecutiveCount >= routeEntry.retries) {
            logger.event("triage.evaluate", failingNodeKey, {
              domain: triageResult.domain,
              reason: `domain retry cap reached (${consecutiveCount}/${routeEntry.retries})`,
              source: triageResult.source,
            });
            const record: TriageRecord = {
              failing_item: failingNodeKey,
              error_signature: errorSig,
              guard_result: "passed",
              rag_matches: triageResult.rag_matches ?? [],
              rag_selected: triageResult.source === "rag" ? (triageResult.rag_matches?.[0]?.snippet ?? null) : null,
              llm_invoked: triageResult.source === "llm",
              domain: triageResult.domain,
              reason: `domain retry cap reached (${consecutiveCount}/${routeEntry.retries})`,
              source: triageResult.source,
              route_to: "$BLOCKED",
              cascade: [],
              cycle_count: 0,
              domain_retry_count: domainRetryCount,
            };
            return {
              outcome: "completed",
              summary: { intents: [`triage: ${triageResult.domain} retry cap (${consecutiveCount}/${routeEntry.retries}) → degradation`] },
              signals: { halt: false },
              commands: buildSalvageCommands(failingNodeKey, rawError, record),
              handlerOutput: {
                routeToKey: null,
                domain: triageResult.domain,
                reason: `domain retry cap reached (${consecutiveCount}/${routeEntry.retries})`,
                source: triageResult.source,
                triageRecord: record,
                guardResult: "passed",
                triageHandoff: buildDegradationHandoff({
                  failingNodeKey,
                  rawError,
                  errorSignature: errorSig,
                  domain: triageResult.domain,
                  reason: `domain retry cap reached (${consecutiveCount}/${routeEntry.retries})`,
                  triageInvocationId: ctx.executionId,
                }),
              } satisfies TriageHandlerOutput,
            };
          }
        } catch { /* continue with reroute */ }
      }
    }

    // --- Build full triage record ---
    // Pre-compute cycle_count from errorLog (handler is read-only, executor is generic)
    let estimatedCycleCount = 0;
    try {
      const pipeState = await ctx.stateReader.getStatus(slug);
      estimatedCycleCount = pipeState.errorLog.filter(
        (e) => e.itemKey === RESET_OPS.RESET_FOR_REROUTE,
      ).length;
    } catch { /* best effort — defaults to 0 */ }

    const record: TriageRecord = {
      failing_item: failingNodeKey,
      error_signature: errorSig,
      guard_result: "passed",
      rag_matches: triageResult.rag_matches ?? [],
      rag_selected: triageResult.source === "rag" ? (triageResult.rag_matches?.[0]?.snippet ?? null) : null,
      llm_invoked: triageResult.source === "llm",
      llm_domain: triageResult.source === "llm" ? triageResult.domain : undefined,
      llm_reason: triageResult.source === "llm" ? triageResult.reason : undefined,
      llm_response_ms: triageResult.llm_response_ms,
      domain: triageResult.domain,
      reason: triageResult.reason,
      source: triageResult.source,
      route_to: routeToKey,
      cascade: [],
      cycle_count: estimatedCycleCount + 1,
      domain_retry_count: domainRetryCount,
    };
    const evId = logger.event("triage.evaluate", failingNodeKey, { ...record });
    logger.blob(evId, "error_trace", rawError);

    // --- Build reroute commands: triage-record → reset-nodes → pending-context → reindex ---
    const triageNodeKey = ctx.itemKey;
    const triageNode = getWorkflowNode(ctx.apmContext, ctx.pipelineState.workflowName, triageNodeKey);
    const profileName2 = triageNode?.triage_profile;
    const profileForCap = profileName2
      ? ctx.apmContext.triage_profiles?.[`${ctx.pipelineState.workflowName}.${profileName2}`]
      : undefined;
    // Budget policy for the route-to (failing) node determines max reroute cycles.
    // Falls back to the triage profile's max_reroutes, then code default (5).
    const routeToNode = getWorkflowNode(ctx.apmContext, ctx.pipelineState.workflowName, routeToKey);
    const routeToPolicy = resolveNodeBudgetPolicy(routeToNode, ctx.apmContext);
    const maxReroutes = profileForCap?.max_reroutes ?? routeToPolicy.maxRerouteCycles;

    const { commands, handoff, routedToInvocationId } = await buildRerouteCommands(ctx, routeToKey, record, triageResult, maxReroutes, routeToPolicy, failingNodeKey, rawError, filteredStructuredFailure, baseline, baselineDropCounts, priorDebugRecommendation);

    return {
      outcome: "completed",
      summary: { intents: [`triage: ${triageResult.domain} (${triageResult.source}) → route to ${routeToKey}`] },
      commands,
      handlerOutput: {
        routeToKey,
        domain: triageResult.domain,
        reason: triageResult.reason,
        source: triageResult.source,
        triageRecord: record,
        ...(handoff ? { triageHandoff: handoff } : {}),
        ...(routedToInvocationId
          ? { routedTo: { nodeKey: routeToKey, invocationId: routedToInvocationId } }
          : {}),
        guardResult: "passed",
      } satisfies TriageHandlerOutput,
    };
  },
};

const triageHandler: NodeHandler = {
  name: "triage",
  async execute(ctx: NodeContext): Promise<NodeResult> {
    const result = await triageHandlerInner.execute(ctx);
    const stamped = await attachTriageHandoffArtifact(ctx, result);
    const out = stamped.handlerOutput as TriageHandlerOutput | undefined;
    // Lineage: when triage decided a reroute, attach `routedTo` on the
    // triage InvocationRecord and emit a single `triage.routed` event
    // describing failing → triage → routed-to. Both are best-effort —
    // a failure here must not undo the reroute itself.
    if (stamped.outcome === "completed" && out?.routedTo) {
      try {
        await ctx.ledger.attachInvocationRoutedTo(
          ctx.slug,
          ctx.executionId,
          out.routedTo,
        );
      } catch (err) {
        ctx.logger.event("invocation.attach_routed_to_failed", ctx.itemKey, {
          invocationId: ctx.executionId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      const handoffPath = (stamped.producedArtifacts ?? []).find(
        (r) => r.kind === "triage-handoff",
      )?.path;
      ctx.logger.event("triage.routed", ctx.itemKey, {
        triageInvocationId: ctx.executionId,
        triageNodeKey: ctx.itemKey,
        ...(ctx.failingNodeKey ? { failingNodeKey: ctx.failingNodeKey } : {}),
        ...(ctx.failingInvocationId
          ? { failingInvocationId: ctx.failingInvocationId }
          : {}),
        routedToNodeKey: out.routedTo.nodeKey,
        routedToInvocationId: out.routedTo.invocationId,
        domain: out.domain,
        source: out.source,
        ...(handoffPath ? { handoffPath } : {}),
      });
    }
    // Stamp `handlerName` on every outcome path (guard, reroute,
    // degradation, error) so the synthesized node-report writes
    // `handler: "triage"` instead of falling through to "unknown".
    // The field is read structurally in `loop/dispatch/invocation-ledger-hooks.ts`;
    // it is not part of the typed `NodeResult` shape.
    return { ...stamped, handlerName: "triage" } as NodeResult;
  },
};

export default triageHandler;
