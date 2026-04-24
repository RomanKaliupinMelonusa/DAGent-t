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
import type { NodeHandler, NodeContext, NodeResult, DagCommand } from "./types.js";
import type { CompiledTriageProfile } from "../apm/types.js";
import type { TriageRecord, TriageResult, TriageHandoff, ArtifactRefSerialized } from "../types.js";
import { RESET_OPS } from "../types.js";
import { newInvocationId } from "../kernel/invocation-id.js";
import { evaluateTriage } from "../triage/index.js";
import { computeErrorSignature } from "../triage/error-fingerprint.js";
import { evaluateProfilePatterns } from "../triage/contract-classifier.js";
import { buildTriageHandoff, formatDomainTag } from "../triage/handoff-builder.js";
import { extractPriorAttempts } from "../triage/historian.js";import type { AcceptanceContract } from "../apm/acceptance-schema.js";
import { getWorkflowNode, resolveNodeBudgetPolicy } from "../session/dag-utils.js";
import { resolveIdleTimeoutLimit } from "./support/agent-limits.js";
import type { TriageArtifactLoader } from "../ports/triage-artifact-loader.js";
import { buildEnvelope } from "../apm/artifact-catalog.js";
import { filterNoise, getLastDropCounts } from "../triage/baseline-filter.js";
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
function buildSalvageCommands(
  failingKey: string,
  errorMsg: string,
  triageRecord: TriageRecord,
): DagCommand[] {
  // The triage record itself is serialised to the `triage-handoff` artifact
  // by the outer execute wrapper; no kernel command is needed for persistence.
  void triageRecord;
  return [
    { type: "salvage-draft", failedItemKey: failingKey, reason: errorMsg },
  ];
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
): Promise<RerouteBuildResult> {
  const { slug } = ctx;
  const commands: DagCommand[] = [];
  let handoff: TriageHandoff | undefined;

  // 1. Reset target node + all downstream dependents
  //    (the structured handoff is serialised to the `triage-handoff`
  //    artifact by the outer execute wrapper using the `handoff` value
  //    returned from this function — no persistence command needed.)
  const taggedReason = `${formatDomainTag(triageResult.domain)} [source:${triageResult.source}] ${triageResult.reason}`;
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
    });
    commands.push({
      type: "stage-invocation",
      itemKey: routeToKey,
      invocationId: newInvocationId(),
      parentInvocationId: ctx.executionId,
      trigger: "triage-reroute",
      producedBy: `${ctx.itemKey}#${ctx.executionId}`,
    });
  } catch { /* non-fatal — reroute still happens via reset-nodes alone */ }

  // 3. Re-index semantic graph if target category needs it
  const targetCat = getWorkflowNode(ctx.apmContext, ctx.pipelineState.workflowName, routeToKey)?.category;
  if (targetCat) {
    commands.push({ type: "reindex", categories: [targetCat] });
  }

  return { commands, handoff };
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
          } satisfies TriageHandlerOutput,
        };
      }
    } catch { /* non-fatal — fall through to classification */ }

    // --- 2-layer triage classification (RAG → LLM → fallback) ---
    const triageLlm = ctx.triageLlm;
    // D3 — prepend contract evidence (ACCEPTANCE oracle + QA-REPORT) when
    // the artifacts exist. Both RAG and LLM layers then see the structured
    // verdict first, instead of a 30 KB ANSI Playwright blob. No-op when
    // no oracle artifacts are present (pre-Phase-B features).
    const artifacts: TriageArtifactLoader = ctx.triageArtifacts;
    const { trace: enrichedError, sources: evidenceSources } =
      artifacts.loadContractEvidence(slug, rawError);
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
    let filteredStructuredFailure: unknown = ctx.structuredFailure;
    let baseline: Awaited<ReturnType<NonNullable<typeof ctx.baselineLoader>["loadBaseline"]>> | null = null;
    let baselineDropCounts: { console: number; network: number; uncaught: number } | undefined;
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
    const triageResult: TriageResult =
      preLlmVerdict && (preLlmVerdict.domain in failureRoutesForContract)
        ? preLlmVerdict
        : await evaluateTriage(
            enrichedError, profile, triageLlm, slug, ctx.appRoot, logger,
          );

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

    const { commands, handoff } = await buildRerouteCommands(ctx, routeToKey, record, triageResult, maxReroutes, routeToPolicy, failingNodeKey, rawError, filteredStructuredFailure, baseline, baselineDropCounts);

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
        guardResult: "passed",
      } satisfies TriageHandlerOutput,
    };
  },
};

const triageHandler: NodeHandler = {
  name: "triage",
  async execute(ctx: NodeContext): Promise<NodeResult> {
    const result = await triageHandlerInner.execute(ctx);
    return attachTriageHandoffArtifact(ctx, result);
  },
};

export default triageHandler;
