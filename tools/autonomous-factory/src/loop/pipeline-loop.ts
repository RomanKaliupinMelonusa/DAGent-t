/**
 * loop/pipeline-loop.ts — Reactive DAG loop.
 *
 * The main loop that drives the pipeline:
 *   1. Emit run.start telemetry
 *   2. Ask kernel for next batch
 *   3. Filter triage nodes (dispatched only via activation)
 *   4. Pre-batch git sync
 *   5. Build contexts, dispatch handlers in parallel
 *   6. Post-batch state commit
 *   7. Feed resulting commands to kernel
 *   8. Execute effects (persist, telemetry)
 *   9. Interpret signals (halt, create-pr, approval, triage)
 *  10. On create-pr: archive + push
 *  11. Repeat until complete/halted
 *  12. Emit run.end telemetry
 *
 * Lifecycle hooks (git sync, state commit, archive+push) are injected
 * via LoopLifecycle to keep the loop free of I/O imports.
 */

import type { PipelineKernel, ProcessResult } from "../kernel/pipeline-kernel.js";
import type { EffectPorts } from "../kernel/effect-executor.js";
import { executeEffects } from "../kernel/effect-executor.js";
import type { Command } from "../kernel/commands.js";
import type { Effect } from "../kernel/effects.js";
import type { NodeHandler, NodeContext } from "../handlers/types.js";
import type { NodeMiddleware } from "../handlers/middleware.js";
import { resolveMiddlewareChain } from "../handlers/middlewares/registry.js";
import type { AvailableItem } from "../kernel-types.js";
import type { ApmCompiledOutput, ApmWorkflowNode } from "../apm/types.js";
import type { PipelineLogger } from "../logger.js";
import type { CopilotClient } from "@github/copilot-sdk";
import type { VersionControl } from "../ports/version-control.js";
import type { StateStore } from "../ports/state-store.js";
import type { Shell } from "../ports/shell.js";
import type { FeatureFilesystem } from "../ports/feature-filesystem.js";
import type { CopilotSessionRunner } from "../ports/copilot-session-runner.js";
import { buildNodeContext, type ContextBuilderConfig } from "./dispatch/context-builder.js";
import { dispatchBatch } from "./dispatch/batch-dispatcher.js";
import { interpretSignals, type LoopDirective } from "./signal-handler.js";
import {
  snapshotProgress,
  evaluateHardening,
  type HardeningState,
} from "../domain/progress-tracker.js";

// ---------------------------------------------------------------------------
// Loop configuration
// ---------------------------------------------------------------------------

/**
 * Lifecycle hooks — injected I/O operations that the loop calls
 * at specific points in the batch cycle. Keeps the loop itself
 * free of concrete I/O imports.
 */
export interface LoopLifecycle {
  /** Sync the feature branch before dispatching a batch. */
  syncBranch(): void | Promise<void>;
  /** Commit + push state files after a batch completes. */
  commitState(batchNumber: number): void | Promise<void>;
  /** Archive feature files and push for PR creation. */
  archiveAndPush(slug: string): Promise<void>;
  /** Get the workflow node definition for an item key. */
  getWorkflowNode(itemKey: string): ApmWorkflowNode | undefined;
}

export interface PipelineLoopConfig {
  readonly slug: string;
  readonly workflowName: string;
  readonly appRoot: string;
  readonly repoRoot: string;
  readonly baseBranch: string;
  readonly apmContext: ApmCompiledOutput;
  readonly logger: PipelineLogger;
  readonly client?: CopilotClient;
  readonly lifecycle: LoopLifecycle;
  readonly vcs: VersionControl;
  readonly stateReader: Pick<StateStore, "getStatus">;
  readonly shell: Shell;
  readonly filesystem: FeatureFilesystem;
  readonly copilotSessionRunner: CopilotSessionRunner;
}

export interface HandlerResolver {
  /** Resolve a handler for a given item. */
  resolve(item: AvailableItem, node: ApmWorkflowNode | undefined): NodeHandler;
}

export interface LoopResult {
  /** How the loop terminated. */
  reason: "complete" | "halted" | "blocked" | "create-pr" | "approval-pending" | "idle-timeout" | "failure-budget";
  /** Approval-pending keys (if reason is "approval-pending"). */
  approvalPendingKeys?: string[];
}

// ---------------------------------------------------------------------------
// Pipeline loop
// ---------------------------------------------------------------------------

/**
 * Run the pipeline loop until completion, halt, or blocking.
 *
 * @param kernel - The pipeline kernel (owns all state)
 * @param handlerResolver - Resolves NodeHandler for each item
 * @param effectPorts - Ports for executing side effects
 * @param config - Pipeline configuration (includes lifecycle hooks)
 * @returns How the loop terminated
 */
export async function runPipelineLoop(
  kernel: PipelineKernel,
  handlerResolver: HandlerResolver,
  effectPorts: EffectPorts,
  config: PipelineLoopConfig,
): Promise<LoopResult> {
  const { slug, logger, lifecycle } = config;
  const ctxConfig: ContextBuilderConfig = {
    slug: config.slug,
    appRoot: config.appRoot,
    repoRoot: config.repoRoot,
    baseBranch: config.baseBranch,
    apmContext: config.apmContext,
    logger: config.logger,
    client: config.client,
    vcs: config.vcs,
    stateReader: config.stateReader,
    shell: config.shell,
    filesystem: config.filesystem,
    copilotSessionRunner: config.copilotSessionRunner,
  };

  const policy = config.apmContext.config?.policy;
  const maxIterations = policy?.max_iterations ?? 500; // Safety valve
  const hardeningPolicy = {
    maxIdleMs: policy?.max_idle_minutes ? policy.max_idle_minutes * 60_000 : undefined,
    maxTotalFailures: policy?.max_total_failures,
  };
  const runStartMs = Date.now();
  let hardeningState: HardeningState = { prevKey: null, lastProgressMs: runStartMs };

  // ── run.start telemetry ─────────────────────────────────────────
  logger.event("run.start", null, {
    slug,
    workflow_name: config.workflowName,
    base_branch: config.baseBranch,
  });

  let terminationReason: LoopResult["reason"] = "halted";
  let approvalPendingKeys: string[] | undefined;

  try {
    for (let batchNumber = 1; batchNumber <= maxIterations; batchNumber++) {
      // Step 1: Get next batch from kernel
      const batch = kernel.getNextBatch();

      if (batch.kind === "complete") {
        terminationReason = "complete";
        return { reason: "complete" };
      }
      if (batch.kind === "blocked") {
        terminationReason = "blocked";
        return { reason: "blocked" };
      }

      // Step 2: Filter triage nodes (dispatched only via activation, not scheduler)
      const runnableItems = batch.items.filter((item) => {
        const node = lifecycle.getWorkflowNode(item.key);
        return node?.type !== "triage";
      });

      // All items in batch are triage-only — skip to next iteration
      if (runnableItems.length === 0) continue;

      if (runnableItems.length > 1) {
        logger.event("batch.start", null, {
          batch_number: batchNumber,
          items: runnableItems.map((i) => i.key),
        });
      }

      // Step 3: Pre-batch git sync
      await lifecycle.syncBranch();

      // Step 4: Build handler+context pairs
      const dagSnap = kernel.dagSnapshot();
      const runSnap = kernel.runSnapshot();

      const dispatchPairs: Array<readonly [NodeHandler, NodeContext, ReadonlyArray<NodeMiddleware>]> = [];
      for (const item of runnableItems) {
        const node = lifecycle.getWorkflowNode(item.key);
        const handler = handlerResolver.resolve(item, node);
        const ctx = buildNodeContext(item, node, dagSnap, runSnap, ctxConfig);
        const middlewares = resolveMiddlewareChain(
          handler.name,
          config.apmContext.config?.node_middleware,
          node?.middleware,
        );
        dispatchPairs.push([handler, ctx, middlewares] as const);
      }

      // Step 5: Dispatch batch
      const batchResult = await dispatchBatch(dispatchPairs);

      // Step 6: Post-batch state commit
      await lifecycle.commitState(batchNumber);

      // Step 7: Feed commands to kernel, collect effects
      const allEffects: Effect[] = [];
      let haltFromKernel = false;

      for (const cmd of batchResult.commands) {
        const processResult = kernel.process(cmd);
        allEffects.push(...processResult.effects);
        if (processResult.result.halt) {
          haltFromKernel = true;
        }
      }

      // Step 8: Execute effects
      await executeEffects(allEffects, effectPorts);

      // Step 8a: Phase 4 — operational hardening checks.
      // (a) Progress tracking for max_idle_minutes.
      // (b) max_total_failures pipeline-wide halt budget.
      {
        const snap = kernel.dagSnapshot();
        const progress = snapshotProgress(snap.items);
        const verdict = evaluateHardening(
          progress,
          hardeningState,
          Date.now(),
          hardeningPolicy,
        );
        if (verdict.kind === "idle-timeout") {
          terminationReason = "idle-timeout";
          return { reason: "idle-timeout" };
        }
        if (verdict.kind === "failure-budget") {
          terminationReason = "failure-budget";
          return { reason: "failure-budget" };
        }
        hardeningState = verdict.state;
      }

      // Step 9: Interpret signals
      const directive = interpretSignals(batchResult.itemResults);

      for (const err of batchResult.errors) {
        console.error(`  ✖ Unexpected session error: ${err.message}`);
      }

      // Step 10: Handle create-pr: archive + push
      if (directive.createPr) {
        await lifecycle.archiveAndPush(slug);
        terminationReason = "create-pr";
        return { reason: "create-pr" };
      }

      if (haltFromKernel || directive.halt) {
        terminationReason = "halted";
        return { reason: "halted" };
      }

      // Step 11: Approval gate
      if (
        directive.approvalPendingKeys.length > 0 &&
        directive.approvalPendingKeys.length === runnableItems.length
      ) {
        const gateKeys = directive.approvalPendingKeys.join(", ");
        console.log(`\n${"─".repeat(70)}`);
        console.log(`  ⏸  Awaiting human approval for: ${gateKeys}`);
        console.log(`     Complete via: npm run pipeline:complete <slug> <gate-key>`);
        console.log(`${"─".repeat(70)}\n`);
        terminationReason = "approval-pending";
        approvalPendingKeys = directive.approvalPendingKeys;
        return { reason: "approval-pending", approvalPendingKeys };
      }
    }

    // Safety valve hit
    terminationReason = "halted";
    return { reason: "halted" };
  } finally {
    // ── run.end telemetry ──────────────────────────────────────────
    logger.event("run.end", null, {
      outcome: terminationReason,
      duration_ms: Date.now() - runStartMs,
    });
  }
}
