/**
 * handlers/copilot-agent.ts — Copilot SDK agent session handler.
 *
 * Orchestrates a pipeline item's LLM agent run:
 * 1. Build AgentContext from NodeContext + APM config (+ upstream handoff artifacts)
 * 2. Resolve tool/harness limits + sandbox with APM cascade (support/agent-limits)
 * 3. Build task prompt
 * 4. Delegate the session to `adapters/copilot-session-runner`
 * 5. Post-session: record HEAD, git-diff fallback, budget utilization
 *    (support/agent-post-session — all git I/O via ctx.vcs port)
 * 6. Classify outcome from `reportedOutcome` (Phase A: kernel-sole-writer).
 *    The agent must terminate by calling the `report_outcome` SDK tool;
 *    a missing outcome is treated as a failure.
 *
 * This handler is an OBSERVER — it does not call completeItem/failItem.
 * The kernel is the sole authority on pipeline state transitions.
 *
 * All I/O flows through ctx ports. No direct child_process / filesystem /
 * state-module imports are permitted in this file.
 */

import { getAgentConfig, buildTaskPrompt } from "../apm/agents.js";
import { extractDiagnosticTrace } from "../types.js";
import { writeChangeManifest } from "../reporting/index.js";
import { DEFAULT_FATAL_SDK_PATTERNS } from "../domain/error-classification.js";
import { isOrchestratorTimeout } from "../triage/index.js";
import { formatBaselineAdvisory } from "../triage/baseline-advisory.js";
import { formatDerivedTargetsMarkdown } from "../triage/derive-baseline-targets.js";
import { buildAgentContext } from "../activity-lib/agent-context.js";
import { resolveAgentLimits } from "../activity-lib/agent-limits.js";
import { enrichPostSessionTelemetry } from "../activity-lib/agent-post-session.js";
import type { NodeHandler, NodeContext, NodeResult } from "../activity-lib/types.js";
import type { ItemSummary } from "../types.js";
import type { ArtifactKind } from "../apm/artifact-catalog.js";
import type { NodeContractGateParams } from "../activity-lib/node-contract-gate.js";
import type { PrecompletionGate } from "../harness/index.js";
import type { FreshnessGate } from "../harness/hooks.js";
import { FileArtifactBus } from "../adapters/file-artifact-bus.js";
import { featurePath } from "../paths/feature-paths.js";
import { validateSpecCompilerOutput } from "../lifecycle/spec-compiler-validator.js";
import { SPEC_COMPILER_KEY } from "../activity-lib/acceptance-integrity.js";

// ---------------------------------------------------------------------------
// B4 — no-op-dev sanity check (pure helper, exported for tests)
// ---------------------------------------------------------------------------

/**
 * Inspect whether a reportedly-completed dev agent produced any changes.
 *
 * Returns an error message when the agent is considered a no-op (HEAD
 * unchanged, attribution dirs declared, no prior commit from earlier
 * cycles). Returns null when the completion is legitimate or the check
 * is opt-out (empty `attributionDirs`).
 *
 * Extracted as a pure helper so the guard is unit-testable without a
 * full NodeContext harness.
 */
export function detectNoOpDev(input: {
  itemKey: string;
  attributionDirs: readonly string[];
  preStepRef: string | undefined;
  headNow: string;
  pipelineSummaries: ReadonlyArray<Readonly<ItemSummary>>;
}): string | null {
  const { itemKey, attributionDirs, preStepRef, headNow, pipelineSummaries } = input;
  if (attributionDirs.length === 0) return null;   // opt-out for read-only nodes
  if (!preStepRef) return null;                     // no baseline → can't compare
  if (headNow !== preStepRef) return null;          // HEAD moved → legitimate
  const priorCommitted = pipelineSummaries.some(
    (s) => s.key === itemKey && (s.filesChanged?.length ?? 0) > 0,
  );
  if (priorCommitted) return null;
  return (
    `[no-op-dev] Agent reported completion but HEAD is unchanged ` +
    `(${headNow.slice(0, 7)}) and no prior cycle committed files in ` +
    `attribution dirs [${attributionDirs.join(", ")}]. ` +
    `Re-dispatch required with explicit must-commit directive.`
  );
}

// ---------------------------------------------------------------------------
// Workflow node helpers
// ---------------------------------------------------------------------------

function getWorkflowNode(ctx: NodeContext) {
  return ctx.apmContext.workflows?.[ctx.pipelineState.workflowName]?.nodes?.[ctx.itemKey];
}

function getTimeout(ctx: NodeContext): number {
  const node = getWorkflowNode(ctx);
  return (node?.timeout_minutes ?? 15) * 60_000;
}

/**
 * Build the optional pre-`report_outcome` validation gate (P1.2). Currently
 * scoped to `spec-compiler` only — the smallest blast radius. Generalize
 * after one validated feature run. Returns `undefined` for any other node
 * so the SDK runner falls through to the existing post-completion
 * middlewares (defense in depth).
 */
function buildPrecompletionGate(ctx: NodeContext): PrecompletionGate | undefined {
  if (ctx.itemKey !== SPEC_COMPILER_KEY) return undefined;
  const bus = new FileArtifactBus(ctx.appRoot, ctx.filesystem);
  const nodeAcceptancePath = bus.nodePath(
    ctx.slug,
    ctx.itemKey,
    ctx.executionId,
    "acceptance",
  );
  const kickoffAcceptancePath = featurePath(ctx.appRoot, ctx.slug, "acceptance");
  return {
    maxCorrectiveTurns: 1,
    validate: () =>
      validateSpecCompilerOutput({
        candidatePaths: [nodeAcceptancePath, kickoffAcceptancePath],
        existsSync: (p) => ctx.filesystem.existsSync(p),
        loadBaseline: () => {
          if (!ctx.baselineLoader) return null;
          try {
            return ctx.baselineLoader.loadBaseline(ctx.slug);
          } catch {
            return null;
          }
        },
      }),
  };
}

/**
 * Build the optional pre-tool-call freshness gate (Phase 4). Returns
 * `undefined` when the agent has no `freshnessRefreshTools` declared
 * (i.e. no enabled MCP server contributed a freshness contract) or the
 * pipeline run has no `CodeIndexer` wired. The closure captures the same
 * `CodeIndexer` instance the effect executor uses so concurrent gate hits
 * and kernel-emitted reindex effects coalesce against one in-flight refresh.
 */
function buildFreshnessGate(ctx: NodeContext): FreshnessGate | undefined {
  const indexer = ctx.codeIndexer;
  const declaredTools = ctx.apmContext.agents[ctx.itemKey]?.freshnessRefreshTools ?? [];
  // Diagnostic: log gate resolution exactly once per dispatch so we can see
  // which of the three early-returns fired when no `pre-tool-call` events
  // appear. `available` is evaluated lazily — only when an indexer exists —
  // so a missing port doesn't trigger a `roam --version` subprocess.
  let available: boolean | null = null;
  if (indexer) {
    try {
      available = indexer.isAvailable();
    } catch {
      available = false;
    }
  }
  const reason =
    !indexer ? "no-indexer"
      : available === false ? "indexer-unavailable"
        : declaredTools.length === 0 ? "no-declared-tools"
          : "active";
  ctx.logger.event("code-index.gate.resolve", ctx.itemKey, {
    agent: ctx.itemKey,
    reason,
    indexerPresent: indexer !== undefined,
    indexerAvailable: available,
    declaredToolCount: declaredTools.length,
    sampleTools: declaredTools.slice(0, 3),
  });
  if (!indexer || available === false) return undefined;
  if (declaredTools.length === 0) return undefined;
  const toolSet = new Set(declaredTools);
  return {
    tools: toolSet,
    refresh: async (toolName: string) => {
      const result = await indexer.index();
      ctx.logger.event("code-index.refresh", ctx.itemKey, {
        trigger: "pre-tool-call",
        agent: ctx.itemKey,
        tool: toolName,
        durationMs: result.durationMs,
        upToDate: result.upToDate,
      });
    },
  };
}

/** Initialize a blank ItemSummary for telemetry collection. */
function initTelemetry(itemKey: string, attempt: number): ItemSummary {
  return {
    key: itemKey,
    label: itemKey,
    agent: itemKey,
    attempt,
    outcome: "completed",
    startedAt: new Date().toISOString(),
    finishedAt: "",
    durationMs: 0,
    intents: [],
    filesChanged: [],
    filesRead: [],
    shellCommands: [],
    toolCounts: {},
    messages: [],
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
}

// ---------------------------------------------------------------------------
// Handler implementation
// ---------------------------------------------------------------------------

const copilotAgentHandler: NodeHandler = {
  name: "copilot-agent",

  async execute(ctx: NodeContext): Promise<NodeResult> {
    const { itemKey, slug, appRoot, repoRoot, apmContext, attempt, pipelineSummaries } = ctx;

    const client = ctx.client;
    if (!client) {
      return {
        outcome: "error",
        errorMessage: `BUG: copilot-agent handler requires a CopilotClient but ctx.client is undefined`,
        summary: {},
      };
    }

    // ── 1. Build agent context ──────────────────────────────────────────────
    const { agentContext, upstreamArtifacts } = await buildAgentContext(ctx);
    const hasArtifacts = Object.keys(upstreamArtifacts).length > 0;

    if (hasArtifacts) {
      ctx.logger.event("handoff.inject", itemKey, {
        injection_types: ["upstream_artifacts"],
        artifact_sources: Object.keys(upstreamArtifacts),
      });
    }

    const agentConfig = getAgentConfig(itemKey, agentContext, apmContext);
    const timeout = getTimeout(ctx);

    // ── 2. Resolve tool + harness limits + sandbox ──────────────────────────
    const limits = resolveAgentLimits(ctx);

    // ── 3. Build task prompt ───────────────────────────────────────────────
    const node = getWorkflowNode(ctx);
    const artifactBus = ctx.artifactBus;
    let taskPrompt = buildTaskPrompt(
      { key: itemKey, label: (ctx.pipelineState.items.find((i) => i.key === itemKey) as { label?: string })?.label ?? itemKey },
      slug,
      appRoot,
      apmContext,
      {
        node,
        pipelineState: ctx.pipelineState,
        artifactBus,
        invocationId: ctx.executionId,
      },
    );

    // Phase 6 — re-entrance context (e.g. triage handoff) is no longer
    // injected as prose. The triage handler writes a `triage-handoff`
    // JSON artifact, and Phase 3's materialize-inputs middleware copies
    // it into `<inv>/inputs/triage-handoff.json` for nodes that declare
    // `consumes_reroute`. The agent reads it from disk.

    // Dispatch-time target derivation for baseline-analyzer — extract
    // pages + modal triggers from ACCEPTANCE.yml deterministically and
    // inject as an authoritative list so the agent doesn't have to
    // re-interpret the YAML and potentially miss targets.
    if (itemKey === "baseline-analyzer") {
      const artifacts = ctx.triageArtifacts;
      try {
        const contract = artifacts.loadAcceptance(slug);
        if (contract) {
          const block = formatDerivedTargetsMarkdown(contract);
          if (block) {
            taskPrompt += block;
            ctx.logger.event("handoff.inject", itemKey, {
              injection_types: ["derived_baseline_targets"],
              context_length: block.length,
            });
          }
        }
      } catch { /* non-fatal — agent falls back to its own YAML reading */ }
    }

    // Dispatch-time baseline advisory — tell the agent up-front which
    // console/network/uncaught errors pre-date this feature so it doesn't
    // chase red herrings. Skipped for `baseline-analyzer` itself (the node
    // that produced the baseline) and when no baseline exists. Advisory
    // renders as empty when the profile has no entries.
    if (ctx.baselineLoader && itemKey !== "baseline-analyzer") {
      const baseline = ctx.baselineLoader.loadBaseline(slug);
      // Best-effort freshness check — resolve the base-branch sha via the
      // VCS port when available, so the advisory can warn the agent when
      // the baseline was captured against an older tree. `null` means the
      // adapter couldn't resolve it (detached, missing ref, unsupported);
      // we silently omit the staleness banner in that case.
      let currentBaseSha: string | undefined;
      if (baseline?.base_sha && typeof ctx.vcs.getRefSha === "function") {
        try {
          const resolved = await ctx.vcs.getRefSha(ctx.baseBranch);
          if (resolved) currentBaseSha = resolved;
        } catch { /* noop */ }
      }
      const advisory = formatBaselineAdvisory(baseline, slug, currentBaseSha);
      if (advisory) {
        taskPrompt += advisory;
        ctx.logger.event("handoff.inject", itemKey, {
          injection_types: ["baseline_advisory"],
          context_length: advisory.length,
          entry_counts: {
            console: baseline?.console_errors?.length ?? 0,
            network: baseline?.network_failures?.length ?? 0,
            uncaught: baseline?.uncaught_exceptions?.length ?? 0,
          },
          stale: currentBaseSha !== undefined && baseline?.base_sha !== undefined && baseline.base_sha !== currentBaseSha,
        });
      }
    }

    if (node?.generates_change_manifest) {
      await writeChangeManifest(
        slug,
        appRoot,
        repoRoot,
        pipelineSummaries as ItemSummary[],
        (s) => ctx.stateReader.getStatus(s),
      );
    }

    // ── 4. Run the SDK session via adapter ──────────────────────────────────
    const telemetry = initTelemetry(itemKey, attempt);
    const fatalPatterns = apmContext.config?.fatal_sdk_errors ?? DEFAULT_FATAL_SDK_PATTERNS;

    // Resolve `next_failure_hint` validation context for this invocation.
    // - allowedDomains: keys of the failing-node's `on_failure.routes`
    //   (falls back to an empty list when the node has none — the tool
    //   will then reject any hint with a clear "no allowed domains"
    //   error so misuse is loud rather than silent).
    // - dagNodeKeys: the full compiled workflow node set so the agent
    //   can target any node in the DAG (forward or sibling).
    const failureRoutes = (node?.on_failure?.routes ?? {}) as Record<string, unknown>;
    const workflowNodes = apmContext.workflows?.[ctx.pipelineState.workflowName]?.nodes ?? {};
    const nextFailureHintValidation = {
      allowedDomains: Object.keys(failureRoutes),
      dagNodeKeys: Object.keys(workflowNodes),
    };

    // Phase 2 — runner-internal node-contract gate. Validates after the
    // initial sendAndWait and nudges the SAME session up to 3 times when
    // `report_outcome` or declared `produces_artifacts` are missing. The
    // dispatch-level gates remain the deterministic backstop.
    const producesArtifacts = (node as { produces_artifacts?: readonly string[] } | undefined)
      ?.produces_artifacts ?? [];
    const gateMode = (node as { node_contract_gate?: NodeContractGateParams["mode"] } | undefined)
      ?.node_contract_gate ?? "full";
    const nodeContract: NodeContractGateParams = {
      mode: gateMode,
      producesArtifacts,
      slug,
      nodeKey: itemKey,
      invocationId: ctx.executionId,
      strictEnvelope: apmContext.config?.strict_artifacts === true,
      autoSkipped: false, // dispatch middleware short-circuits before reaching the runner
      bus: {
        ref: (s, kind, opts) =>
          ctx.artifactBus.ref(s, kind as ArtifactKind, opts),
      },
      fs: {
        exists: (p) => ctx.filesystem.exists(p),
        readFile: (p) => ctx.filesystem.readFile(p),
        writeFile: (p, body) => ctx.filesystem.writeFile(p, body),
      },
    };

    const { sessionError, fatalError, reportedOutcome } = await ctx.copilotSessionRunner.run(client, {
      slug, itemKey, appRoot, repoRoot,
      model: agentConfig.model,
      systemMessage: agentConfig.systemMessage,
      taskPrompt,
      timeout,
      tools: limits.filteredTools,
      mcpServers: agentConfig.mcpServers as Record<string, unknown> | undefined,
      sandbox: limits.sandbox,
      harnessLimits: limits.harnessLimits,
      toolLimits: limits.toolLimits,
      telemetry,
      pipelineSummaries,
      fatalPatterns,
      writeThreshold: limits.writeThreshold,
      preTimeoutPercent: limits.preTimeoutPercent,
      runtimeTokenBudget: limits.runtimeTokenBudget,
      logger: ctx.logger,
      nextFailureHintValidation,
      nodeContract,
      precompletionGate: buildPrecompletionGate(ctx),
      freshnessGate: buildFreshnessGate(ctx),
    });

    // ── 5. Post-session telemetry (via ctx.vcs port) ────────────────────────
    await enrichPostSessionTelemetry(ctx, {
      telemetry,
      toolLimitsHard: limits.toolLimits.hard,
      runtimeTokenBudget: limits.runtimeTokenBudget,
    });

    // ── 6. Classify outcome ─────────────────────────────────────────────────
    // Tag SDK `session.idle` timeouts with a stable marker so the triage
    // handler's pre-guard can count them across cycles via `errorLog`
    // (B2 — session.idle circuit breaker).
    const idleTagged = sessionError && isOrchestratorTimeout(sessionError)
      ? (sessionError.startsWith("[session-idle-timeout] ")
        ? sessionError
        : `[session-idle-timeout] ${sessionError}`)
      : sessionError;

    if (fatalError) {
      return {
        outcome: telemetry.outcome === "error" ? "error" : "failed",
        errorMessage: idleTagged,
        summary: telemetry,
        signal: "halt",
      };
    }

    if (sessionError) {
      return {
        outcome: telemetry.outcome === "error" ? "error" : "failed",
        errorMessage: idleTagged,
        summary: telemetry,
      };
    }

    // Phase A: the agent must report its terminal outcome via the
    // `report_outcome` SDK tool. The static guard in arch-check.mjs locks
    // every prompt onto this contract; the bash mutation verbs no longer
    // exist (Phase A.6). A missing reportedOutcome here means the agent
    // ended its session without signalling — treat as a failure.
    if (reportedOutcome) {
      const hint = reportedOutcome.nextFailureHint;
      const handlerOutput = hint ? { nextFailureHint: hint } : undefined;
      if (reportedOutcome.status === "failed") {
        const message = reportedOutcome.message;
        telemetry.outcome = "failed";
        telemetry.errorMessage = message;
        const diagTrace = extractDiagnosticTrace(message);
        ctx.logger.event("item.end", itemKey, { outcome: "failed", source: "report_outcome" });
        return {
          outcome: "failed",
          errorMessage: message,
          summary: telemetry,
          ...(diagTrace ? { diagnosticTrace: diagTrace } : {}),
          ...(handlerOutput ? { handlerOutput } : {}),
        };
      }

      // B4 — no-op-dev sanity check.
      // A dev agent that reports "completed" but never moved HEAD (and never
      // committed anything in a prior cycle for this item) is silently idle.
      // Downstream auto-skip would then falsely trust it, cascading skips
      // across the pipeline. We fail the item instead so the triage handler
      // can re-dispatch with an explicit must-commit directive.
      //
      // Opt-in via `diff_attribution_dirs` non-empty — read-only nodes
      // (publish-pr, docs-archived) are unaffected.
      const attributionDirs = node?.diff_attribution_dirs ?? [];
      if (attributionDirs.length > 0) {
        const preStepRef = ctx.handlerData["preStepRef"] as string | undefined;
        try {
          const headNow = await ctx.vcs.getHeadSha();
          const noOpMsg = detectNoOpDev({
            itemKey,
            attributionDirs,
            preStepRef,
            headNow,
            pipelineSummaries,
          });
          if (noOpMsg) {
            telemetry.outcome = "failed";
            telemetry.errorMessage = noOpMsg;
            ctx.logger.event("item.end", itemKey, {
              outcome: "failed",
              source: "no_op_dev_guard",
            });
            return {
              outcome: "failed",
              errorMessage: noOpMsg,
              summary: telemetry,
            };
          }
        } catch { /* non-fatal — fall through to normal success */ }
      }

      ctx.logger.event("item.end", itemKey, { outcome: "completed", source: "report_outcome" });
      return {
        outcome: "completed",
        summary: telemetry,
        ...(handlerOutput ? { handlerOutput } : {}),
      };
    }

    const missingOutcomeMsg =
      "Agent session ended without calling report_outcome. " +
      "Every agent prompt must terminate by invoking the report_outcome SDK tool " +
      "with status: 'completed' or 'failed'.";
    telemetry.outcome = "failed";
    telemetry.errorMessage = missingOutcomeMsg;
    ctx.logger.event("item.end", itemKey, { outcome: "failed", source: "missing_outcome" });
    return {
      outcome: "failed",
      errorMessage: missingOutcomeMsg,
      summary: telemetry,
    };
  },
};

export default copilotAgentHandler;
