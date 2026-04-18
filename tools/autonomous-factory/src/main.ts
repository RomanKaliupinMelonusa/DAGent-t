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
import type { PipelineRunConfig } from "./kernel-types.js";
import type { ApmWorkflowNode } from "./apm-types.js";
import type { AvailableItem } from "./kernel-types.js";
import type { NodeHandler } from "./handlers/types.js";
import type { PipelineState } from "./types.js";
import { PipelineKernel } from "./kernel/pipeline-kernel.js";
import { DefaultKernelRules } from "./kernel/rules.js";
import { createRunState } from "./kernel/types.js";
import { JsonlTelemetry } from "./adapters/jsonl-telemetry.js";
import { JsonFileStateStore } from "./adapters/json-file-state-store.js";
import { runPipelineLoop, type HandlerResolver, type LoopResult, type LoopLifecycle } from "./loop/pipeline-loop.js";
import { resolveHandler, inferHandler } from "./handlers/registry.js";
import { getWorkflowNode } from "./session/dag-utils.js";
import { syncBranch, getCurrentBranch, pushWithRetry } from "./git-ops.js";
import { archiveFeatureFiles, commitAndPushState } from "./archive.js";
import { readState } from "./state.js";
import { loadPreviousSummary } from "./reporting.js";

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
      name: node?.handler ?? inferHandler(node?.type ?? "agent", node?.script_type) ?? "copilot-agent",
      async execute(ctx) {
        const handler = await getHandler();
        return handler.execute(ctx);
      },
      async shouldSkip(ctx) {
        const handler = await getHandler();
        return handler.shouldSkip?.(ctx) ?? null;
      },
    };
  }

  private async doResolve(item: AvailableItem, node: ApmWorkflowNode | undefined): Promise<NodeHandler> {
    const handlerRef = node?.handler
      ?? inferHandler(
        node?.type ?? "agent",
        node?.script_type,
        this.apmContext.config?.handler_defaults,
      )
      ?? "copilot-agent";

    return resolveHandler(
      handlerRef,
      this.appRoot,
      this.repoRoot,
      this.apmContext.config?.handlers,
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

  // Load initial DAG state from the persisted _STATE.json
  const initialDagState = await readState(slug) as PipelineState;

  // Load prior session telemetry for monotonic accumulation
  const baseTelemetry = loadPreviousSummary(appRoot, slug);
  const initialRunState = createRunState(baseTelemetry);

  // Instantiate kernel
  const rules = new DefaultKernelRules();
  const kernel = new PipelineKernel(slug, initialDagState, initialRunState, rules);

  // Instantiate adapters for effect execution
  const effectPorts = {
    stateStore: new JsonFileStateStore(),
    telemetry: new JsonlTelemetry(logger),
  };

  // Handler resolution
  const handlerResolver = new RegistryHandlerResolver(config);

  // Lifecycle hooks — concrete I/O wired here, injected into the loop
  const lifecycle: LoopLifecycle = {
    syncBranch() {
      syncBranch(repoRoot);
    },
    commitState(batchNumber: number) {
      const currentBranch = getCurrentBranch(repoRoot);
      commitAndPushState(repoRoot, appRoot, currentBranch, batchNumber);
    },
    async archiveAndPush(slug: string) {
      archiveFeatureFiles(slug, appRoot, repoRoot);
      try {
        await pushWithRetry(repoRoot, baseBranch, logger);
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
    apmContext: config.apmContext,
    logger,
    client,
    lifecycle,
  });

  return { loopResult };
}
