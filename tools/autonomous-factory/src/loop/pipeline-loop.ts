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
import type { AvailableItem } from "../app-types.js";
import type { ApmCompiledOutput, ApmWorkflowNode } from "../apm/types.js";
import type { PipelineLogger } from "../telemetry/index.js";
import type { CopilotClient } from "@github/copilot-sdk";
import type { VersionControl } from "../ports/version-control.js";
import type { StateStore } from "../ports/state-store.js";
import type { Shell } from "../ports/shell.js";
import type { FeatureFilesystem } from "../ports/feature-filesystem.js";
import type { InvocationFilesystem } from "../ports/invocation-filesystem.js";
import type { CopilotSessionRunner } from "../ports/copilot-session-runner.js";
import type { TriageLlm } from "../ports/triage-llm.js";
import type { TriageArtifactLoader } from "../ports/triage-artifact-loader.js";
import type { BaselineLoader } from "../ports/baseline-loader.js";
import { buildNodeContext, type ContextBuilderConfig } from "./dispatch/context-builder.js";
import { buildSecretRedactor } from "../adapters/secret-redactor.js";
import { dispatchBatch } from "./dispatch/batch-dispatcher.js";
import {
  recordInvocationDispatch,
  recordInvocationSeal,
} from "./dispatch/invocation-ledger-hooks.js";
import { interpretSignals, type LoopDirective } from "./signal-handler.js";
import { resolveTriageActivations } from "./triage-activation.js";
import type { TriageActivation } from "../app-types.js";
import type { RoutableWorkflow } from "../domain/failure-routing.js";
import { computeErrorSignature } from "../domain/error-signature.js";
import {
  snapshotProgress,
  evaluateHardening,
  type HardeningState,
} from "../domain/progress-tracker.js";
import { DEFAULT_TRANSIENT_BACKOFF_MS } from "../session/transient-poll.js";

// ---------------------------------------------------------------------------
// Retry backoff
// ---------------------------------------------------------------------------

/** Cap on per-attempt backoff; a single hung item should never wedge the loop
 *  for longer than 5 minutes even at high attempt counts. */
const MAX_RETRY_BACKOFF_MS = 5 * 60_000;

/**
 * Compute exponential backoff for a failing item based on its attempt count.
 * Formula: `min(baseMs * 2^(attempt - 1), MAX_RETRY_BACKOFF_MS)`.
 * Returns 0 for the first attempt (no delay before first retry).
 */
function computeRetryBackoffMs(attempt: number, baseMs: number): number {
  if (attempt <= 1) return 0;
  const exp = Math.min(attempt - 1, 10); // clamp exponent to avoid overflow
  return Math.min(baseMs * 2 ** exp, MAX_RETRY_BACKOFF_MS);
}

/** Truncate a string for single-line terminal display. */
function truncate(s: string, max: number): string {
  const oneLine = s.replace(/\s+/g, " ").trim();
  return oneLine.length <= max ? oneLine : oneLine.slice(0, max - 1) + "…";
}

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
  readonly specFile: string;
  readonly apmContext: ApmCompiledOutput;
  readonly logger: PipelineLogger;
  readonly client?: CopilotClient;
  readonly triageLlm?: TriageLlm;
  readonly triageArtifacts?: TriageArtifactLoader;
  readonly baselineLoader?: BaselineLoader;
  readonly lifecycle: LoopLifecycle;
  readonly vcs: VersionControl;
  readonly stateReader: Pick<StateStore, "getStatus">;
  readonly shell: Shell;
  readonly filesystem: FeatureFilesystem;
  readonly invocation: InvocationFilesystem;
  readonly copilotSessionRunner: CopilotSessionRunner;
  /** Advisory API-drift markdown produced by bootstrap; forwarded to
   *  agents that consult the vendored reference snapshot. Absent when
   *  there is no drift or no snapshot configured. */
  readonly pwaKitDriftReport?: string;
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
  // Track B3: build the log redactor once per pipeline run. Reused by
  // every FileInvocationLogger created in the context builder so all
  // per-invocation logs get the same denylist treatment.
  const logRedactor = buildSecretRedactor(config.apmContext.config?.environment);
  const ctxConfig: ContextBuilderConfig = {
    slug: config.slug,
    appRoot: config.appRoot,
    repoRoot: config.repoRoot,
    baseBranch: config.baseBranch,
    specFile: config.specFile,
    apmContext: config.apmContext,
    logger: config.logger,
    client: config.client,
    triageLlm: config.triageLlm,
    triageArtifacts: config.triageArtifacts,
    baselineLoader: config.baselineLoader,
    vcs: config.vcs,
    stateReader: config.stateReader,
    shell: config.shell,
    filesystem: config.filesystem,
    invocation: config.invocation,
    copilotSessionRunner: config.copilotSessionRunner,
    logRedactor,
    ...(config.pwaKitDriftReport ? { pwaKitDriftReport: config.pwaKitDriftReport } : {}),
  };

  const policy = config.apmContext.config?.policy;
  const maxIterations = policy?.max_iterations ?? 500; // Safety valve
  const hardeningPolicy = {
    maxIdleMs: policy?.max_idle_minutes ? policy.max_idle_minutes * 60_000 : undefined,
    maxTotalFailures: policy?.max_total_failures,
  };
  const runStartMs = Date.now();
  let hardeningState: HardeningState = { prevKey: null, lastProgressMs: runStartMs };

  // Build per-key wait-timeout map. Per-node `ready_within_hours` wins; else
  // pipeline-wide `policy.ready_within_hours_default`; else the node is opted out.
  const readyWithinHoursByKey = new Map<string, number>();
  {
    const defaultHours = policy?.ready_within_hours_default;
    const workflow = config.apmContext.workflows?.[config.workflowName];
    const workflowNodes = workflow?.nodes ?? {};
    for (const [key, node] of Object.entries(workflowNodes)) {
      const hours = (node as { ready_within_hours?: number }).ready_within_hours ?? defaultHours;
      if (typeof hours === "number" && hours > 0) {
        readyWithinHoursByKey.set(key, hours);
      }
    }
  }

  // ── run.start telemetry ─────────────────────────────────────────
  logger.event("run.start", null, {
    slug,
    workflow_name: config.workflowName,
    base_branch: config.baseBranch,
  });

  let terminationReason: LoopResult["reason"] = "halted";
  let approvalPendingKeys: string[] | undefined;

  // Pending triage activations are drained at the top of each iteration.
  // When an item with `on_failure.triage` fails, an activation is enqueued
  // here so the triage node gets dispatched before the next DAG batch.
  // Triage nodes are otherwise filtered out of normal scheduling (Step 2).
  const pendingTriageActivations: TriageActivation[] = [];
  const routableWorkflow = config.apmContext.workflows?.[config.workflowName] as
    | RoutableWorkflow
    | undefined;

  try {
    for (let batchNumber = 1; batchNumber <= maxIterations; batchNumber++) {
      // Step 0: DAG-level stall detection (ready_within_hours).
      // Fail any pending item whose upstream wait has exceeded its budget.
      // The failure flows through the normal on_failure.triage path.
      if (readyWithinHoursByKey.size > 0) {
        const stallCommands = kernel.collectStallCommands(Date.now(), readyWithinHoursByKey);
        if (stallCommands.length > 0) {
          const stallEffects: Effect[] = [];
          for (const cmd of stallCommands) {
            const processResult = kernel.process(cmd);
            stallEffects.push(...processResult.effects);
          }
          await executeEffects(stallEffects, effectPorts);
          logger.event("state.stall", null, {
            batch_number: batchNumber,
            stalled_keys: stallCommands
              .filter((c) => c.type === "fail-item")
              .map((c) => (c as { itemKey: string }).itemKey),
          });
        }
      }

      // Step 0.5: Drain pending triage activations.
      // When a prior batch flagged items with `on_failure.triage` configured,
      // dispatch those triage nodes BEFORE consulting the scheduler. The
      // triage handler emits `reset-nodes` DagCommands which return the
      // failing target to pending for re-dispatch on the NEXT iteration.
      // Triage runs in its own mini-batch so its state mutations (reset +
      // pending-context) are visible to the subsequent getNextBatch().
      if (pendingTriageActivations.length > 0) {
        const activations = pendingTriageActivations.splice(0);
        const dagSnapT = kernel.dagSnapshot();
        const runSnapT = kernel.runSnapshot();
        const triagePairs: Array<readonly [NodeHandler, NodeContext, ReadonlyArray<NodeMiddleware>]> = [];

        for (const activation of activations) {
          const node = lifecycle.getWorkflowNode(activation.triageNodeKey);
          if (!node) continue;
          // Treat the triage node as an available item; status is synthetic
          // because triage nodes never flow through normal scheduling.
          const item = {
            key: activation.triageNodeKey,
            label: activation.triageNodeKey,
            agent: node.agent ?? null,
            status: "pending" as const,
          };
          const handler = handlerResolver.resolve(item, node);
          const ctx = buildNodeContext(item, node, dagSnapT, runSnapT, ctxConfig, undefined, undefined, activation);
          const middlewares = resolveMiddlewareChain(
            handler.name,
            config.apmContext.config?.node_middleware,
            node?.middleware,
          );
          triagePairs.push([handler, ctx, middlewares] as const);
        }

        if (triagePairs.length > 0) {
          logger.event("triage.dispatch", null, {
            batch_number: batchNumber,
            activations: activations.map((a) => ({
              triage: a.triageNodeKey,
              failing: a.failingKey,
            })),
          });
          console.log(`\n${"─".repeat(70)}`);
          console.log(`  ⚑ Triage dispatch — ${activations.length} activation${activations.length === 1 ? "" : "s"}`);
          for (const a of activations) {
            console.log(`    · ${a.triageNodeKey} ← ${a.failingKey}`);
          }
          console.log(`${"─".repeat(70)}`);
          await recordInvocationDispatch(effectPorts.stateStore, slug, triagePairs, logger);
          const triageResult = await dispatchBatch(triagePairs);
          await recordInvocationSeal(
            effectPorts.stateStore,
            slug,
            triagePairs,
            triageResult,
            logger,
            { resolveNode: (key) => lifecycle.getWorkflowNode(key) },
          );
          const triageEffects: Effect[] = [];
          let triageHalt = false;
          for (const cmd of triageResult.commands) {
            const pr = kernel.process(cmd);
            triageEffects.push(...pr.effects);
            if (pr.result.halt) triageHalt = true;
          }
          await executeEffects(triageEffects, effectPorts);
          await lifecycle.commitState(batchNumber);
          if (triageHalt) {
            terminationReason = "halted";
            return { reason: "halted" };
          }
          // Fall through to Step 1 — the scheduler will now see the reset
          // target as pending and dispatch it as part of the next batch.
        }
      }

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

      // Operator-facing batch banner on stdout. Telemetry already captures
      // this in `batch.start` / item.start events, but the terminal stream
      // is the live signal for humans watching a pipeline run — restore
      // the phase separator and per-item header lost when console.log
      // banners were replaced with silent JSONL logging.
      console.log(`\n${"─".repeat(70)}`);
      console.log(`  ▸ Batch ${batchNumber} — ${runnableItems.length} item${runnableItems.length === 1 ? "" : "s"}`);
      for (const it of runnableItems) {
        const agentLabel = it.agent ? ` (${it.agent})` : "";
        console.log(`    · ${it.key}${agentLabel}`);
      }
      console.log(`${"─".repeat(70)}`);

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
      await recordInvocationDispatch(effectPorts.stateStore, slug, dispatchPairs, logger);
      const batchResult = await dispatchBatch(dispatchPairs);
      await recordInvocationSeal(
        effectPorts.stateStore,
        slug,
        dispatchPairs,
        batchResult,
        logger,
        { resolveNode: (key) => lifecycle.getWorkflowNode(key) },
      );

      // Per-item outcome banner on stdout for operator visibility.
      for (const { itemKey, result } of batchResult.itemResults) {
        if (result.summary && (result.summary as { outcome?: string }).outcome === "failed") {
          const msg = (result.summary as { errorMessage?: string }).errorMessage
            ?? (result.summary as { error?: string }).error
            ?? "failed";
          console.log(`    ✖ ${itemKey} — ${truncate(msg, 120)}`);
        } else if (result.summary && (result.summary as { outcome?: string }).outcome === "error") {
          const msg = (result.summary as { errorMessage?: string }).errorMessage ?? "error";
          console.log(`    ✖ ${itemKey} — ${truncate(msg, 120)}`);
        } else {
          console.log(`    ✓ ${itemKey}`);
        }
      }

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

      // Step 8.4: Enqueue triage activations for newly-failed items whose
      // workflow node declares `on_failure.triage`. Drained at the top of
      // the next iteration (Step 0.5) — the triage handler will reset the
      // routed target so the scheduler picks it up fresh.
      if (!haltFromKernel && routableWorkflow) {
        const dagAfterFail = kernel.dagSnapshot();
        const runAfterFail = kernel.runSnapshot();
        const activations = resolveTriageActivations(
          batchResult.commands,
          dagAfterFail,
          runAfterFail,
          routableWorkflow,
          computeErrorSignature,
        );
        if (activations.length > 0) {
          pendingTriageActivations.push(...activations);
          logger.event("triage.enqueue", null, {
            batch_number: batchNumber,
            activations: activations.map((a) => ({
              triage: a.triageNodeKey,
              failing: a.failingKey,
            })),
          });
        }
      }

      // Step 8.5: Retry backoff — when items failed this batch, sleep
      // `min(base * 2^(attempt-1), 5min)` before the next iteration so
      // transient failures aren't hammered 10x in 2 seconds. The base is
      // `config.transient_retry.backoff_ms` (default 30 s). Only applies
      // when items failed but the pipeline hasn't halted.
      if (!haltFromKernel) {
        const runAfter = kernel.runSnapshot();
        const dagAfter = kernel.dagSnapshot();
        const failedItemKeys = batchResult.commands
          .filter((c) => c.type === "fail-item")
          .map((c) => (c as { itemKey: string }).itemKey);
        const stillFailed = failedItemKeys.filter((key) => {
          const item = dagAfter.items.find((i) => i.key === key);
          return item?.status === "failed";
        });
        if (stillFailed.length > 0) {
          const baseMs = config.apmContext.config?.transient_retry?.backoff_ms ?? DEFAULT_TRANSIENT_BACKOFF_MS;
          const maxAttempt = Math.max(
            ...stillFailed.map((k) => runAfter.attemptCounts[k] ?? 1),
          );
          const backoffMs = computeRetryBackoffMs(maxAttempt, baseMs);
          if (backoffMs > 0) {
            logger.event("retry.backoff", null, {
              batch_number: batchNumber,
              failed_items: stillFailed,
              attempt: maxAttempt,
              backoff_ms: backoffMs,
            });
            await new Promise((r) => setTimeout(r, backoffMs));
          }
        }
      }

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
