/**
 * dispatch/invocation-ledger-hooks.ts — Phase 4 wiring: record one invocation
 * in `state.artifacts` for every dispatch, seal it with the handler outcome
 * when the batch completes.
 *
 * The ArtifactBus ledger (Phase 2) stores authoritative metadata per handler
 * invocation. Earlier phases added the plumbing; this module is the first
 * consumer in the runtime dispatch path.
 *
 * Every `NodeContext.executionId` already doubles as a valid invocation id
 * (Phase 1 remainder). We use it unchanged as the ledger key.
 */

import type { StateStore } from "../../ports/state-store.js";
import type { NodeContext, NodeHandler } from "../../handlers/types.js";
import type { NodeMiddleware } from "../../handlers/middleware.js";
import type { BatchDispatchResult } from "./batch-dispatcher.js";
import type {
  InvocationTrigger,
  AppendInvocationInput,
  SealInvocationInput,
  ArtifactRefSerialized,
  InvocationRecord,
} from "../../types.js";
import type { PipelineLogger } from "../../telemetry/index.js";
import type { ApmWorkflowNode } from "../../apm/types.js";
import type { PipelineKernel } from "../../kernel/pipeline-kernel.js";
import { FileArtifactBus } from "../../adapters/file-artifact-bus.js";
import { isArtifactKind } from "../../apm/artifact-catalog.js";
import { synthesizeNodeReport, writeNodeReport } from "../../reporting/node-report.js";

export type DispatchTuple =
  | readonly [NodeHandler, NodeContext]
  | readonly [NodeHandler, NodeContext, ReadonlyArray<NodeMiddleware>];

/**
 * Decide which invocation trigger bucket a dispatch falls into. The bucket
 * is derived from the context that the scheduler already populates:
 *  - staged record with `parentInvocationId` pointing at a triage node → `triage-reroute`
 *  - `previousAttempt` present → `retry`
 *  - `attempt > 1` (otherwise) → `redevelopment-cycle`
 *  - everything else → `initial`
 */
export function classifyInvocationTrigger(ctx: NodeContext): InvocationTrigger {
  // Prefer the staged record's own trigger when present — triage stages an
  // unsealed `InvocationRecord` with `trigger='triage-reroute'` directly
  // via the `stage-invocation` command, so we trust that label rather than
  // sniffing prose. Phase 6 removed the legacy `pendingContext` string
  // field entirely; trigger now lives on the staged InvocationRecord.
  if (ctx.currentInvocation?.trigger) return ctx.currentInvocation.trigger;
  if (ctx.previousAttempt) return "retry";
  if (ctx.attempt > 1) return "redevelopment-cycle";
  return "initial";
}

/**
 * Append one `InvocationRecord` per dispatch tuple. Best-effort: ledger
 * writes never block dispatch — a failing append emits telemetry and the
 * handler still runs.
 */
export async function recordInvocationDispatch(
  stateStore: StateStore,
  slug: string,
  pairs: ReadonlyArray<DispatchTuple>,
  logger: PipelineLogger,
  kernel?: PipelineKernel,
): Promise<void> {
  for (const pair of pairs) {
    const ctx = pair[1];
    const startedAt = new Date().toISOString();
    // When the dispatcher adopted a staged `InvocationRecord` (e.g. one
    // pre-allocated by the triage handler via `stage-invocation`), the
    // record already exists in `state.artifacts` (staged by triage)
    // + `parentInvocationId` + `trigger`. We must NOT re-append (would
    // throw "already exists"); instead stamp `startedAt` on the staged
    // record so it transitions from "staged" to "running".
    if (ctx.currentInvocation && !ctx.currentInvocation.startedAt) {
      const trigger = ctx.currentInvocation.trigger;
      const parentInvocationId = ctx.currentInvocation.parentInvocationId;
      try {
        const stamped = await stateStore.stampInvocationStart(
          slug,
          ctx.executionId,
          startedAt,
        );
        // Sync kernel's in-memory artifacts map so the next batch's
        // `buildNodeContext` / `materializeInputs` middleware sees the
        // stamped record. Safe no-op when kernel is omitted (tests).
        kernel?.ingestInvocationRecord(stamped);
      } catch (err) {
        logger.event("invocation.append_failed", ctx.itemKey, {
          invocationId: ctx.executionId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      await ensureInvocationDirAndMeta(ctx, slug, {
        ...ctx.currentInvocation,
        startedAt,
      }, logger);
      logger.event("node.start", ctx.itemKey, {
        invocationId: ctx.executionId,
        nodeKey: ctx.itemKey,
        trigger,
        ...(parentInvocationId ? { parentInvocationId } : {}),
        attempt: ctx.attempt,
        effectiveAttempts: ctx.effectiveAttempts,
        startedAt,
      });
      continue;
    }
    const input: AppendInvocationInput = {
      invocationId: ctx.executionId,
      nodeKey: ctx.itemKey,
      trigger: classifyInvocationTrigger(ctx),
      startedAt,
    };
    try {
      const appended = await stateStore.appendInvocationRecord(slug, input);
      kernel?.ingestInvocationRecord(appended);
    } catch (err) {
      logger.event("invocation.append_failed", ctx.itemKey, {
        invocationId: ctx.executionId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    await ensureInvocationDirAndMeta(ctx, slug, {
      invocationId: ctx.executionId,
      nodeKey: ctx.itemKey,
      cycleIndex: ctx.attempt,
      trigger: input.trigger,
      startedAt,
      inputs: [],
      outputs: [],
    }, logger);
    // Phase B — uniform per-invocation lifecycle event. Fires for every
    // handler type (agent, script, poll, triage, approval, barrier) so
    // triage can filter evidence by invocationId without handler-specific
    // knowledge.
    logger.event("node.start", ctx.itemKey, {
      invocationId: ctx.executionId,
      nodeKey: ctx.itemKey,
      trigger: input.trigger,
      attempt: ctx.attempt,
      effectiveAttempts: ctx.effectiveAttempts,
      startedAt: input.startedAt,
    });
  }
}

/**
 * Phase 1 — create `<inv>/{inputs,outputs,logs}/` and write the `meta.json`
 * mirror. Best-effort: filesystem failures emit telemetry but never block
 * dispatch (the kernel's `_state.json` remains the source of truth).
 */
async function ensureInvocationDirAndMeta(
  ctx: NodeContext,
  slug: string,
  record: InvocationRecord,
  logger: PipelineLogger,
): Promise<void> {
  try {
    await ctx.invocation.ensureInvocationDir(slug, ctx.itemKey, ctx.executionId);
    await ctx.invocation.writeMeta(slug, ctx.itemKey, ctx.executionId, record);
  } catch (err) {
    logger.event("invocation.meta_write_failed", ctx.itemKey, {
      invocationId: ctx.executionId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  // Phase 4 — seed `<inv>/logs/events.jsonl` with a single `dispatch.start`
  // record so every invocation directory has populated logs from the moment
  // it's created. Best-effort, never throws.
  if (typeof ctx.invocationLogger?.event === "function") {
    try {
      await ctx.invocationLogger.event({
        kind: "dispatch.start",
        invocationId: ctx.executionId,
        nodeKey: ctx.itemKey,
        trigger: record.trigger,
        cycleIndex: record.cycleIndex,
        startedAt: record.startedAt,
        attempt: ctx.attempt,
        ...(record.parentInvocationId ? { parentInvocationId: record.parentInvocationId } : {}),
      });
    } catch {
      /* per-invocation logger is best-effort */
    }
  }
}

/**
 * Resolve concrete output artifact refs from a node's declared
 * `produces_artifacts`. The dispatch path advertises these exact paths
 * to the agent via the task prompt; at seal we check the filesystem
 * and record every artifact that actually materialised so the ledger's
 * `outputs` array reflects reality.
 *
 * Skipped entirely when the node is undefined or declares nothing —
 * pre-Phase-6 apps and script nodes continue to work unchanged.
 */
async function resolveProducedOutputs(
  ctx: NodeContext,
  node: ApmWorkflowNode | undefined,
  slug: string,
): Promise<ArtifactRefSerialized[]> {
  const produces = node?.produces_artifacts ?? [];
  if (produces.length === 0) return [];
  const bus = new FileArtifactBus(ctx.appRoot, ctx.filesystem);
  const refs: ArtifactRefSerialized[] = [];
  for (const kindStr of produces) {
    if (!isArtifactKind(kindStr)) continue;
    try {
      const ref = bus.ref(slug, kindStr, {
        nodeKey: ctx.itemKey,
        invocationId: ctx.executionId,
      });
      if (await bus.exists(ref)) {
        refs.push({
          kind: ref.kind,
          scope: ref.scope,
          slug: ref.slug,
          path: ref.path,
          ...(ref.scope === "node"
            ? { nodeKey: ref.nodeKey, invocationId: ref.invocationId }
            : {}),
        });
      }
    } catch {
      // Bad kind / scope mismatch — ignore. The compiler validator has
      // already warned at compile time; the seal hook must not fail.
    }
  }
  return refs;
}

export interface RecordInvocationSealOptions {
  /** When provided, looked up per item to auto-populate InvocationRecord.outputs
   *  from the node's declared `produces_artifacts`. Optional so existing call
   *  sites keep their simpler signature. */
  readonly resolveNode?: (itemKey: string) => ApmWorkflowNode | undefined;
}

/**
 * Seal each invocation with its handler outcome. Idempotent: sealing a
 * sealed record is a no-op, so re-running the hook on a partially
 * processed batch is safe.
 */
export async function recordInvocationSeal(
  stateStore: StateStore,
  slug: string,
  pairs: ReadonlyArray<DispatchTuple>,
  batchResult: BatchDispatchResult,
  logger: PipelineLogger,
  opts?: RecordInvocationSealOptions,
  kernel?: PipelineKernel,
): Promise<void> {
  const outcomeByItem = new Map<string, "completed" | "failed" | "error">();
  const producedByItem = new Map<string, ArtifactRefSerialized[]>();
  const summaryByItem = new Map<string, Partial<import("../../types.js").ItemSummary>>();
  const handlerByItem = new Map<string, string>();
  for (const r of batchResult.itemResults) {
    // The authoritative outcome is the top-level `NodeResult.outcome`
    // (see handlers/types.ts). `summary.outcome` is a legacy secondary
    // source that not every handler populates — reading only from it
    // caused every handler that didn't duplicate the field into summary
    // (e.g. triage-handler, local-exec) to seal as "error" in the ledger
    // even when the top-level outcome was "completed".
    const top = (r.result as { outcome?: string }).outcome;
    const summaryRaw = (r.result.summary as { outcome?: string } | undefined)?.outcome;
    const raw = top ?? summaryRaw;
    if (raw === "completed" || raw === "failed" || raw === "error") {
      outcomeByItem.set(r.itemKey, raw);
    }
    // Phase A — handler-reported runtime refs (e.g. `params` written from
    // `report_outcome.handoffArtifact`). Merged into the declared-and-resolved
    // list below so the ledger reflects both sources without dedup gaps.
    const runtime = (r.result as { producedArtifacts?: ArtifactRefSerialized[] }).producedArtifacts;
    if (runtime && runtime.length > 0) {
      producedByItem.set(r.itemKey, runtime);
    }
    // Track B2 — capture the per-item summary so we can synthesize a
    // `node-report` artifact below, even for handlers that only populate
    // `summary: {}` (local-exec, poll, approval).
    summaryByItem.set(r.itemKey, (r.result.summary ?? {}) as Partial<import("../../types.js").ItemSummary>);
    const handlerName = (r.result as { handlerName?: unknown }).handlerName;
    if (typeof handlerName === "string" && handlerName.length > 0) {
      handlerByItem.set(r.itemKey, handlerName);
    }
  }

  for (const pair of pairs) {
    const ctx = pair[1];
    // If the batch crashed for this item (absent from itemResults), mark as
    // `error` — the dispatcher will have recorded a synthetic summary too.
    const outcome: "completed" | "failed" | "error" =
      outcomeByItem.get(ctx.itemKey) ?? "error";
    const node = opts?.resolveNode?.(ctx.itemKey);
    // Only attempt output resolution on successful completions — a failed or
    // crashed invocation may have partially written files we shouldn't claim.
    const declared = outcome === "completed"
      ? await resolveProducedOutputs(ctx, node, slug)
      : [];
    const runtime = outcome === "completed"
      ? (producedByItem.get(ctx.itemKey) ?? [])
      : [];
    const outputs = mergeArtifactRefs(declared, runtime);

    // Track B2 — synthesize and write a `node-report` artifact for every
    // invocation, regardless of handler type. Must happen BEFORE the
    // seal calls below: the artifact bus's seal cache rejects post-seal
    // writes. Non-fatal: a failure here only loses the report for this
    // invocation; the seal proceeds with whatever outputs already exist.
    const finishedAt = new Date().toISOString();
    try {
      const trigger = classifyInvocationTrigger(ctx);
      const startedAt = ctx.currentInvocation?.startedAt ?? finishedAt;
      const report = synthesizeNodeReport({
        nodeKey: ctx.itemKey,
        invocationId: ctx.executionId,
        handler: handlerByItem.get(ctx.itemKey) ?? (node?.handler ?? "unknown"),
        trigger,
        attempt: ctx.attempt,
        startedAt,
        finishedAt,
        outcome,
        summary: summaryByItem.get(ctx.itemKey),
      });
      const reportBus = new FileArtifactBus(ctx.appRoot, ctx.filesystem);
      const reportRef = await writeNodeReport(reportBus, ctx, report);
      outputs.push(reportRef);
    } catch (err) {
      logger.event("invocation.node_report_failed", ctx.itemKey, {
        invocationId: ctx.executionId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const input: SealInvocationInput = {
      invocationId: ctx.executionId,
      outcome,
      finishedAt,
      ...(outputs.length > 0 ? { outputs } : {}),
    };
    try {
      const sealed = await stateStore.sealInvocation(slug, input);
      kernel?.ingestInvocationRecord(sealed);
    } catch (err) {
      logger.event("invocation.seal_failed", ctx.itemKey, {
        invocationId: ctx.executionId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    // Phase 1 — mirror the seal on the InvocationFilesystem port so the
    // shared seal cache stops further writes to the invocation dir, and
    // refresh `<inv>/meta.json` with the terminal record (carrying outcome
    // + finishedAt + outputs). Best-effort: failures are non-fatal.
    try {
      await ctx.invocation.sealInvocation(slug, ctx.itemKey, ctx.executionId);
      const priorMeta = await ctx.invocation.readMeta(slug, ctx.itemKey, ctx.executionId);
      const sealedRecord: InvocationRecord = {
        invocationId: ctx.executionId,
        nodeKey: ctx.itemKey,
        cycleIndex: priorMeta?.cycleIndex ?? ctx.attempt,
        trigger: priorMeta?.trigger ?? classifyInvocationTrigger(ctx),
        ...(priorMeta?.parentInvocationId
          ? { parentInvocationId: priorMeta.parentInvocationId }
          : {}),
        ...(priorMeta?.producedBy ? { producedBy: priorMeta.producedBy } : {}),
        ...(priorMeta?.startedAt ? { startedAt: priorMeta.startedAt } : {}),
        finishedAt: input.finishedAt,
        outcome,
        inputs: priorMeta?.inputs ?? [],
        outputs,
        sealed: true,
      };
      await ctx.invocation.writeMeta(slug, ctx.itemKey, ctx.executionId, sealedRecord);
    } catch (err) {
      logger.event("invocation.meta_seal_failed", ctx.itemKey, {
        invocationId: ctx.executionId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    // Phase 4 — terminal record into `<inv>/logs/events.jsonl` so the
    // log file mirrors the kernel-side `node.end`. Best-effort.
    if (typeof ctx.invocationLogger?.event === "function") {
      try {
        await ctx.invocationLogger.event({
          kind: "dispatch.end",
          invocationId: ctx.executionId,
          nodeKey: ctx.itemKey,
          outcome,
          finishedAt: input.finishedAt,
          outputKinds: outputs.map((o) => o.kind),
        });
        await ctx.invocationLogger.close();
      } catch {
        /* per-invocation logger is best-effort */
      }
    }
    // Phase B — uniform per-invocation terminal event (all handler types).
    logger.event("node.end", ctx.itemKey, {
      invocationId: ctx.executionId,
      nodeKey: ctx.itemKey,
      outcome,
      finishedAt: input.finishedAt,
      outputKinds: outputs.map((o) => o.kind),
    });
    // Phase B — artifact seal event (one per invocation, even when no
    // outputs were produced — the invocation dir is still sealed).
    logger.event("node.artifact.seal", ctx.itemKey, {
      invocationId: ctx.executionId,
      nodeKey: ctx.itemKey,
      outputs: outputs.map((o) => ({ kind: o.kind, path: o.path })),
    });
  }
}

/**
 * Merge two artifact-ref lists, deduplicating on `(kind, path)`. Entries
 * earlier in `a` take precedence; `b`'s novel entries are appended. Used
 * to combine declared-output resolution (disk probe) with handler-reported
 * runtime refs (e.g. `params` written from `report_outcome.handoffArtifact`).
 */
function mergeArtifactRefs(
  a: ArtifactRefSerialized[],
  b: ArtifactRefSerialized[],
): ArtifactRefSerialized[] {
  if (b.length === 0) return a;
  if (a.length === 0) return b;
  const seen = new Set(a.map((r) => `${r.kind}\0${r.path}`));
  const out = a.slice();
  for (const r of b) {
    const key = `${r.kind}\0${r.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}
