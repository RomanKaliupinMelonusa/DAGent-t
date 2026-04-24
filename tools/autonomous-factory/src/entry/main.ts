/**
 * main.ts — Composition root for the Command-Sourced Pipeline Kernel.
 *
 * Wires together:
 *   - bootstrap.ts (preflight, config assembly) — unchanged
 *   - PipelineKernel (sole state owner)
 *   - DefaultKernelRules (delegates to domain/)
 *   - Adapters (wrap existing I/O modules)
 *   - HandlerResolver (wraps handlers/registry.ts)
 *   - LoopLifecycle (wraps git-ops, archive, state commit)
 *   - runPipelineLoop (reactive DAG loop)
 *
 * This module is the entry point. watchdog.ts delegates to
 * `runWithKernel()` for pipeline execution.
 */

import { CopilotClient } from "@github/copilot-sdk";
import type { PipelineRunConfig } from "../app-types.js";
import type { ApmWorkflowNode } from "../apm/types.js";
import type { AvailableItem } from "../app-types.js";
import type { NodeHandler } from "../handlers/types.js";
import type { PipelineState } from "../types.js";
import { PipelineKernel } from "../kernel/pipeline-kernel.js";
import { DefaultKernelRules } from "../kernel/rules.js";
import { createRunState } from "../kernel/types.js";
import { resolveVolatilePatternsFromApmContext } from "./resolve-volatile-patterns.js";
import { compileConsumesByNode } from "../apm/compile-node-io-contract.js";
import { JsonlTelemetry } from "../adapters/jsonl-telemetry.js";
import { JsonFileStateStore } from "../adapters/json-file-state-store.js";
import { GitShellAdapter } from "../adapters/git-shell-adapter.js";
import { LocalFilesystem } from "../adapters/local-filesystem.js";
import { FileArtifactBus } from "../adapters/file-artifact-bus.js";
import { FileInvocationFilesystem } from "../adapters/file-invocation-filesystem.js";
import { NodeShellAdapter } from "../adapters/node-shell-adapter.js";
import { NodeCopilotSessionRunner } from "../adapters/copilot-session-runner.js";
import { CopilotTriageLlm } from "../adapters/copilot-triage-llm.js";
import { FileTriageArtifactLoader } from "../adapters/file-triage-artifact-loader.js";
import { FileBaselineLoader } from "../adapters/file-baseline-loader.js";
import { runPipelineLoop, type HandlerResolver, type LoopResult, type LoopLifecycle } from "../loop/pipeline-loop.js";
import { resolveHandler, inferHandler } from "../handlers/registry.js";
import { getWorkflowNode } from "../session/dag-utils.js";

// ---------------------------------------------------------------------------
// HandlerResolver adapter — wraps the existing handler registry
// ---------------------------------------------------------------------------

class RegistryHandlerResolver implements HandlerResolver {
  private readonly appRoot: string;
  private readonly repoRoot: string;
  private readonly apmContext: PipelineRunConfig["apmContext"];
  private readonly workflowName: string;

  constructor(config: PipelineRunConfig) {
    this.appRoot = config.appRoot;
    this.repoRoot = config.repoRoot;
    this.apmContext = config.apmContext;
    this.workflowName = config.workflowName;
  }

  resolve(item: AvailableItem, node: ApmWorkflowNode | undefined): NodeHandler {
    // Handler resolution is async but the interface expects sync.
    // We return a lazy proxy that resolves on first execute() call.
    const self = this;
    let resolved: NodeHandler | null = null;
    let resolvePromise: Promise<NodeHandler> | null = null;

    const getHandler = async (): Promise<NodeHandler> => {
      if (resolved) return resolved;
      if (!resolvePromise) {
        resolvePromise = self.doResolve(item, node);
      }
      resolved = await resolvePromise;
      return resolved;
    };

    return {
      // Display-only name for the lazy proxy. The real handler is resolved in
      // doResolve(); if strict mode rejects the inference there, execute() will
      // surface the failure. We still fall back to "copilot-agent" here purely
      // for telemetry/display consistency.
      name: node?.handler ?? inferHandler(
        node?.type ?? "agent",
        node?.script_type,
        this.apmContext.config?.handler_defaults,
        this.apmContext.config?.strict_handler_inference,
      ) ?? "copilot-agent",
      async execute(ctx) {
        const handler = await getHandler();
        return handler.execute(ctx);
      },
    };
  }

  private async doResolve(item: AvailableItem, node: ApmWorkflowNode | undefined): Promise<NodeHandler> {
    const handlerRef = node?.handler
      ?? inferHandler(
        node?.type ?? "agent",
        node?.script_type,
        this.apmContext.config?.handler_defaults,
        this.apmContext.config?.strict_handler_inference,
      )
      ?? "copilot-agent";

    return resolveHandler(
      handlerRef,
      this.appRoot,
      this.repoRoot,
      this.apmContext.config?.handlers,
      this.apmContext.config?.handler_packages,
    );
  }
}

// ---------------------------------------------------------------------------
// Public API — kernel-mode pipeline execution
// ---------------------------------------------------------------------------

export interface KernelRunResult {
  /** How the pipeline terminated. */
  loopResult: LoopResult;
}

/**
 * Run the pipeline using the Command-Sourced Kernel architecture.
 *
 * Called by watchdog.ts when kernel mode is enabled.
 * Reuses the existing bootstrap result (config, client, telemetry).
 *
 * @param client - Started CopilotClient instance
 * @param config - Immutable pipeline config from bootstrap()
 * @returns How the pipeline terminated
 */
export async function runWithKernel(
  client: CopilotClient,
  config: PipelineRunConfig,
): Promise<KernelRunResult> {
  const { slug, appRoot, repoRoot, baseBranch, logger } = config;

  // Instantiate adapters
  const stateStore = new JsonFileStateStore();
  const vcs = new GitShellAdapter(repoRoot, logger);
  const filesystem = new LocalFilesystem();
  // Session A \u2014 honour `config.strict_artifacts` from the compiled APM
  // manifest. Default false keeps legacy producers working during rollout;
  // commerce-storefront (and any app that flips it) gets hard envelope
  // enforcement at the bus boundary.
  const strictArtifacts = config.apmContext.config?.strict_artifacts === true;
  const artifactBus = new FileArtifactBus(appRoot, filesystem, logger, {
    strict: strictArtifacts,
  });
  const invocation = new FileInvocationFilesystem(appRoot, filesystem, artifactBus);
  const shell = new NodeShellAdapter();
  const copilotSessionRunner = new NodeCopilotSessionRunner();
  const telemetry = new JsonlTelemetry(logger);
  const triageLlm = new CopilotTriageLlm(client);
  const triageArtifacts = new FileTriageArtifactLoader({ appRoot });
  const baselineLoader = new FileBaselineLoader({ appRoot });
  const effectPorts = { stateStore, telemetry };

  // Load initial DAG state from the persisted _STATE.json
  const initialDagState = await stateStore.getStatus(slug) as PipelineState;

  // Load prior session telemetry for monotonic accumulation
  const baseTelemetry = telemetry.loadPreviousSummary(appRoot, slug);
  const initialRunState = createRunState(baseTelemetry);

  // Instantiate kernel
  // Compile volatile-token patterns from APM config (workflow + per-node)
  // and inject into the rules so fail/reset compute stable signatures that
  // normalize framework-specific tokens (session IDs, test UUIDs, etc).
  // Resolution is extracted to a pure helper so the wiring path is testable
  // independently of the composition root.
  const { workflowPatterns, perNodePatterns } = resolveVolatilePatternsFromApmContext(
    config.apmContext,
    config.workflowName,
  );
  // Operational visibility: emit a one-shot telemetry event the first time
  // each user-supplied pattern collapses a real failure message in this run.
  // Dedupe is owned by `DefaultKernelRules` (per-instance Set). Without
  // this, the only externally visible effect of activating new patterns is
  // an unexplained `halt_on_identical` halt.
  const firedPatternKeys = new Set<string>();
  const rules = new DefaultKernelRules({
    workflowPatterns,
    perNodePatterns,
    onUserPatternFired: (event) => {
      const dedupeKey = event.scope === "workflow"
        ? `workflow:${event.patternIndex}`
        : `node:${event.itemKey ?? ""}:${event.patternIndex}`;
      if (firedPatternKeys.has(dedupeKey)) return;
      firedPatternKeys.add(dedupeKey);
      telemetry.event(
        "error_signature.user_pattern_fired",
        event.itemKey,
        {
          scope: event.scope,
          patternIndex: event.patternIndex,
          replacement: event.replacement,
        },
      );
    },
  });
  // Project per-consumer upstream artifact edges into the shape the
  // scheduler's cycle-aware producer gate needs. Closes the window where
  // a same-tick reroute reset dispatched the consumer against a stale
  // producer cycle.
  const workflowNodes =
    config.apmContext.workflows?.[config.workflowName]?.nodes ?? {};
  const consumesByNode = compileConsumesByNode(workflowNodes);
  const kernel = new PipelineKernel(
    slug,
    initialDagState,
    initialRunState,
    rules,
    consumesByNode,
  );

  // Handler resolution
  const handlerResolver = new RegistryHandlerResolver(config);

  // Lifecycle hooks — concrete I/O wired here, injected into the loop
  const lifecycle: LoopLifecycle = {
    syncBranch() {
      vcs.syncBranch(baseBranch);
    },
    async commitState(batchNumber: number) {
      // Flush the kernel's authoritative in-memory DAG snapshot to disk
      // BEFORE committing to git. Without this, only the initial state is
      // ever persisted — item statuses, errorLog, and cycleCounters never
      // reach disk, breaking `pipeline:status`, retros, and the per-domain
      // retry cap in triage-handler which scans errorLog.
      await stateStore.persistDagSnapshot(slug, kernel.dagSnapshot());
      const currentBranch = await vcs.getCurrentBranch();
      filesystem.commitAndPushState(repoRoot, appRoot, currentBranch, batchNumber);
    },
    async archiveAndPush(slug: string) {
      filesystem.archiveFeature(slug, appRoot, repoRoot);
      try {
        await vcs.pushWithRetry(baseBranch);
      } catch (err) {
        console.error(`  ✖ ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    getWorkflowNode(itemKey: string) {
      return getWorkflowNode(config.apmContext, config.workflowName, itemKey);
    },
  };

  // Run the DAG loop
  const loopResult = await runPipelineLoop(kernel, handlerResolver, effectPorts, {
    slug,
    workflowName: config.workflowName,
    appRoot,
    repoRoot,
    baseBranch,
    specFile: config.specFile,
    apmContext: config.apmContext,
    logger,
    client,
    triageLlm,
    triageArtifacts,
    baselineLoader,
    lifecycle,
    vcs,
    stateReader: stateStore,
    shell,
    filesystem,
    artifactBus,
    invocation,
    copilotSessionRunner,
    ...(config.pwaKitDriftReport ? { pwaKitDriftReport: config.pwaKitDriftReport } : {}),
  });

  return { loopResult };
}
