/**
 * dispatch/item-dispatch.ts — Single-item dispatch pipeline.
 *
 * Executes the handler for a single DAG item through the node middleware
 * chain (koa-style onion) and returns kernel Commands. Middlewares may
 * short-circuit (e.g. auto-skip), enrich the context, transform the
 * result, or rescue errors — all without handlers knowing.
 */

import type { NodeHandler, NodeContext, NodeResult } from "../../handlers/types.js";
import type { NodeMiddleware } from "../../handlers/middleware.js";
import { composeMiddleware } from "../../handlers/middleware.js";
import { autoSkipMiddleware } from "../../handlers/middlewares/auto-skip.js";
import { lifecycleHooksMiddleware } from "../../handlers/middlewares/lifecycle-hooks.js";
import { materializeInputsMiddleware } from "../../handlers/middlewares/materialize-inputs.js";
import { handlerOutputIngestionMiddleware } from "../../handlers/middlewares/handler-output-ingestion.js";
import type { Command } from "../../kernel/commands.js";
import type { ItemSummary, ArtifactRefSerialized } from "../../types.js";
import { translateResult, type FailPolicy } from "./result-translator.js";
import { resolveNodeBudgetPolicy, getWorkflowNode, resolveWorkflowHaltPolicy } from "../../session/dag-utils.js";
import { FileArtifactBus } from "../../adapters/file-artifact-bus.js";
import {
  ArtifactValidationError,
  getArtifactKind,
  isArtifactKind,
  sidecarPath,
  validateEnvelope,
} from "../../apm/artifact-catalog.js";

/** Default middleware chain applied to every handler invocation when the
 *  caller does not supply one. Mirrors ENGINE_DEFAULT_MIDDLEWARE_NAMES in
 *  the registry — keep in sync. `handler-output-ingestion` sits OUTER of
 *  `lifecycle-hooks` so post-hook envelope writes are observable. */
export const DEFAULT_NODE_MIDDLEWARES: ReadonlyArray<NodeMiddleware> = [
  autoSkipMiddleware,
  handlerOutputIngestionMiddleware,
  lifecycleHooksMiddleware,
  materializeInputsMiddleware,
];

export interface ItemDispatchResult {
  /** Commands to send to the kernel. */
  commands: Command[];
  /** The handler's raw signal (for loop-level handling). */
  signal?: NodeResult["signal"];
  /** The handler's signals bag. */
  signals?: NodeResult["signals"];
  /** The item summary from the result. */
  summary: NodeResult["summary"];
}

/**
 * Dispatch a single item through its middleware-wrapped handler and return
 * kernel commands. Middlewares run in onion order around `handler.execute`.
 *
 * This function does NOT call kernelComplete/kernelFail. It returns
 * Commands that the caller feeds to the kernel.
 */
export async function dispatchItem(
  handler: NodeHandler,
  ctx: NodeContext,
  middlewares: ReadonlyArray<NodeMiddleware> = DEFAULT_NODE_MIDDLEWARES,
): Promise<ItemDispatchResult> {
  const commands: Command[] = [];

  // `record-attempt` is an invariant of every dispatch: emitting it here
  // (before the middleware chain runs) ensures attempt counts advance even
  // when a middleware short-circuits with `failed` (e.g. pre-hook failure).
  // Short-circuits that produce `completed` (e.g. auto-skip) still count
  // as an attempt but have no retry consequence — the item just finishes.
  commands.push({ type: "record-attempt", itemKey: ctx.itemKey });

  const run = composeMiddleware(middlewares, (innerCtx) => handler.execute(innerCtx));

  const startedAt = new Date().toISOString();
  const stepStart = Date.now();

  let result: NodeResult;
  // Phase 2.1 — HandlerMetadata.inputs fail-fast. When the handler
  // advertises required inputs, assert they are present in `handlerData`
  // before invoking the middleware chain. A miss short-circuits to
  // `outcome: "error"` with an actionable message — the handler never
  // executes, so downstream side effects cannot fire on broken inputs.
  const missingRequired = detectMissingRequiredInputs(handler, ctx);
  if (missingRequired.length > 0) {
    const summary = suggestProducersForMissing(missingRequired, ctx);
    const lines = missingRequired.map((key) => {
      const hint = summary[key];
      return hint
        ? `  - ${key} (produced by: ${hint})`
        : `  - ${key}`;
    });
    result = {
      outcome: "error",
      errorMessage:
        `Handler "${handler.name}" is missing required handlerData inputs:\n` +
        lines.join("\n") +
        `\n\nDeclare an upstream producer via \`handler.metadata.outputs\` ` +
        `or adjust the DAG so the producing node runs first.`,
      summary: {},
    };
  } else {
    try {
      result = await run(ctx);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      result = {
        outcome: "error",
        errorMessage: `Handler threw: ${message}`,
        summary: {},
      };
    }
  }

  // Phase D — hard-fail enforcement of declared `produces_artifacts`.
  // When a handler reports `completed`, every kind declared in the node's
  // `produces_artifacts` must exist on disk at its canonical invocation
  // path OR be surfaced via the handler's runtime `producedArtifacts`.
  // Missing required outputs override the outcome to `failed` with a
  // stable errorSignature so triage can route deterministically.
  if (result.outcome === "completed") {
    const missing = await detectMissingRequiredOutputs(ctx, result);
    if (missing.length > 0) {
      const signature = `missing_required_output:${missing[0]}`;
      const detail = missing.length === 1
        ? `Node declared \`produces_artifacts\` kind \`${missing[0]}\` but no file materialised at its canonical invocation path.`
        : `Node declared \`produces_artifacts\` kinds [${missing.join(", ")}] but none materialised at their canonical invocation paths.`;
      result = {
        outcome: "failed",
        errorMessage: detail,
        errorSignature: signature,
        summary: { ...(result.summary ?? {}), errorSignature: signature } as NodeResult["summary"],
      } as NodeResult;
    } else if (ctx.apmContext.config?.strict_artifacts === true) {
      // Session A (Item 8) — strict envelope gate. Under strict mode,
      // every declared `produces_artifacts` file written by agents /
      // hooks must ship the envelope. Bus-written artifacts are already
      // envelope-validated at write time; this gate catches agent
      // `write_file` output and hook-scripted files that bypass the bus.
      const invalid = await detectInvalidEnvelopeOutputs(ctx);
      if (invalid.length > 0) {
        const signature = `invalid_envelope_output:${invalid[0].kind}`;
        const detail = invalid.length === 1
          ? `Node declared \`produces_artifacts\` kind \`${invalid[0].kind}\` but its output is missing the envelope under strict_artifacts: ${invalid[0].reason}`
          : `Node declared \`produces_artifacts\` kinds [${invalid.map((i) => i.kind).join(", ")}] but their outputs are missing the envelope under strict_artifacts.`;
        result = {
          outcome: "failed",
          errorMessage: detail,
          errorSignature: signature,
          summary: { ...(result.summary ?? {}), errorSignature: signature } as NodeResult["summary"],
        } as NodeResult;
      }
    }
  }

  commands.push(...translateResult(ctx.itemKey, result, resolveFailPolicy(ctx)));

  // Emit `record-summary` so `runState.pipelineSummaries` is populated for
  // downstream consumers (triage context builder, change manifest,
  // flight-data reports, no-op-dev guard). `result.summary` is a
  // `Partial<ItemSummary>` — synthesize the required scalar fields here
  // and let handler-supplied fields override. Runs for every item type
  // (agent, local-exec, poll, triage) so the pipelineSummaries invariant
  // no longer silently breaks when non-agent handlers fail.
  commands.push({
    type: "record-summary",
    summary: materializeItemSummary(ctx, result, startedAt, stepStart),
  });

  return {
    commands,
    signal: result.signal,
    signals: result.signals,
    summary: result.summary,
  };
}

/**
 * Build a full `ItemSummary` from the handler result and dispatch context.
 * Handlers that populate `result.summary` (e.g. `copilot-agent`) override
 * the synthesized defaults; handlers that return `summary: {}` still get
 * a well-formed record so downstream context builders can filter on
 * `outcome`, `key`, and `errorMessage`.
 */
function materializeItemSummary(
  ctx: NodeContext,
  result: NodeResult,
  startedAt: string,
  stepStart: number,
): ItemSummary {
  const finishedAt = new Date().toISOString();
  const durationMs = Date.now() - stepStart;
  const outcome: ItemSummary["outcome"] =
    result.outcome === "completed" ? "completed"
      : result.outcome === "failed" ? "failed"
      : "error";
  const workflowName = ctx.pipelineState.workflowName;
  const node = workflowName
    ? getWorkflowNode(ctx.apmContext, workflowName, ctx.itemKey)
    : undefined;
  const base: ItemSummary = {
    key: ctx.itemKey,
    label: (node as { label?: string } | undefined)?.label ?? ctx.itemKey,
    agent: (node as { agent?: string } | undefined)?.agent ?? ctx.itemKey,
    attempt: ctx.attempt,
    startedAt,
    finishedAt,
    durationMs,
    outcome,
    intents: [],
    messages: [],
    filesRead: [],
    filesChanged: [],
    shellCommands: [],
    toolCounts: {},
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    ...(result.errorMessage ? { errorMessage: result.errorMessage } : {}),
  };
  // Handler-supplied fields win, but never clobber the resolved outcome,
  // key, or attempt — those are dispatch-authoritative.
  return {
    ...base,
    ...result.summary,
    key: base.key,
    attempt: base.attempt,
    outcome,
    errorMessage: result.errorMessage ?? result.summary?.errorMessage,
  } as ItemSummary;
}

/**
 * Resolve the per-node fail-command policy from the compiled APM context.
 * Threads `circuit_breaker.max_item_failures` and `halt_on_identical` into
 * the kernel's fail-item command so pipeline halting honours workflow config
 * instead of the hardcoded `maxFailures=10` in `domain/transitions.ts`.
 */
function resolveFailPolicy(ctx: NodeContext): FailPolicy | undefined {
  const workflowName = ctx.pipelineState.workflowName;
  if (!workflowName) return undefined;
  const node = getWorkflowNode(ctx.apmContext, workflowName, ctx.itemKey);
  if (!node) return undefined;
  const policy = resolveNodeBudgetPolicy(node, ctx.apmContext);
  const wfHalt = resolveWorkflowHaltPolicy(ctx.apmContext, workflowName);
  return {
    maxFailures: policy.maxItemFailures,
    haltOnIdentical: policy.haltOnIdentical,
    ...(wfHalt?.enabled && wfHalt.threshold > 0
      ? {
          haltOnIdenticalThreshold: wfHalt.threshold,
          haltOnIdenticalExcludedKeys: wfHalt.excludedKeys,
        }
      : {}),
  };
}

/**
 * Phase D — detect declared artifact kinds whose canonical file did NOT
 * materialise. Probes both the filesystem (canonical invocation path) and
 * handler-reported runtime refs (e.g. `params.json` written via the
 * `report_outcome.handoffArtifact` pipeline). Returns the list of missing
 * required kinds (`required !== false`) in declaration order so the first
 * entry can be used as a deterministic errorSignature.
 */
async function detectMissingRequiredOutputs(
  ctx: NodeContext,
  result: NodeResult,
): Promise<string[]> {
  const workflowName = ctx.pipelineState.workflowName;
  if (!workflowName) return [];
  const node = getWorkflowNode(ctx.apmContext, workflowName, ctx.itemKey);
  const produces = (node as { produces_artifacts?: ReadonlyArray<string> } | undefined)
    ?.produces_artifacts ?? [];
  if (produces.length === 0) return [];
  const slug = ctx.pipelineState.feature;
  const bus = new FileArtifactBus(ctx.appRoot, ctx.filesystem);
  const runtime = (result as { producedArtifacts?: ArtifactRefSerialized[] })
    .producedArtifacts ?? [];
  const runtimeKinds = new Set(runtime.map((r) => r.kind));
  const missing: string[] = [];
  for (const kindStr of produces) {
    if (!isArtifactKind(kindStr)) continue;
    if (runtimeKinds.has(kindStr)) continue;
    try {
      const ref = bus.ref(slug, kindStr, {
        nodeKey: ctx.itemKey,
        invocationId: ctx.executionId,
      });
      if (!(await bus.exists(ref))) missing.push(kindStr);
    } catch {
      missing.push(kindStr);
    }
  }
  return missing;
}

/**
 * Session A (Item 8) — strict envelope gate for declared produces_artifacts.
 *
 * Runs AFTER `detectMissingRequiredOutputs` (which enforces presence) and
 * ONLY when `config.strict_artifacts: true`. For every declared kind that
 * exists at its canonical invocation path:
 *   - inline-envelope kinds  → body must parse and carry the envelope
 *     triplet (`validateEnvelope(kind, body)`).
 *   - sidecar-envelope kinds → `<path>.meta.json` must exist and parse
 *     as a valid envelope.
 *
 * Returns per-kind diagnostics so triage gets a stable errorSignature
 * and human-readable detail. Agent-written / hook-written artifacts
 * bypass `bus.write` and thus skip the in-bus envelope check — this
 * gate closes that gap so strict mode has uniform meaning across every
 * writer (agents, hooks, bus-routed engine producers).
 */
async function detectInvalidEnvelopeOutputs(
  ctx: NodeContext,
): Promise<Array<{ kind: string; reason: string }>> {
  const workflowName = ctx.pipelineState.workflowName;
  if (!workflowName) return [];
  const node = getWorkflowNode(ctx.apmContext, workflowName, ctx.itemKey);
  const produces = (node as { produces_artifacts?: ReadonlyArray<string> } | undefined)
    ?.produces_artifacts ?? [];
  if (produces.length === 0) return [];
  const slug = ctx.pipelineState.feature;
  const bus = new FileArtifactBus(ctx.appRoot, ctx.filesystem);
  const invalid: Array<{ kind: string; reason: string }> = [];
  for (const kindStr of produces) {
    if (!isArtifactKind(kindStr)) continue;
    const def = getArtifactKind(kindStr);
    if (!def.envelope) continue;
    let ref;
    try {
      ref = bus.ref(slug, kindStr, {
        nodeKey: ctx.itemKey,
        invocationId: ctx.executionId,
      });
    } catch {
      // ref resolution failed (e.g. scope mismatch) — presence gate
      // already flagged this; skip.
      continue;
    }
    // The presence gate lets kinds pass that were surfaced via runtime
    // `producedArtifacts` but don't live at the canonical path — skip
    // envelope validation for those too since we can't reliably find
    // the body.
    if (!(await bus.exists(ref))) continue;
    try {
      if (def.envelope === "sidecar") {
        const sidecar = sidecarPath(ref.path);
        let sidecarBody: string;
        try {
          sidecarBody = await ctx.filesystem.readFile(sidecar);
        } catch {
          invalid.push({
            kind: kindStr,
            reason: `sidecar not found at ${sidecar}`,
          });
          continue;
        }
        validateEnvelope(kindStr, "", { path: ref.path, sidecarBody });
      } else {
        const body = await ctx.filesystem.readFile(ref.path);
        validateEnvelope(kindStr, body, { path: ref.path });
      }
    } catch (err) {
      const msg = err instanceof ArtifactValidationError
        ? err.message
        : `envelope check threw: ${(err as Error).message}`;
      invalid.push({ kind: kindStr, reason: msg });
    }
  }
  return invalid;
}

// ---------------------------------------------------------------------------
// Phase 2.1 — HandlerMetadata input enforcement
// ---------------------------------------------------------------------------

/**
 * Return the list of `handler.metadata.inputs` keys flagged `"required"`
 * that are NOT present in `ctx.handlerData`. Empty array when the handler
 * declares no metadata or all required keys are satisfied.
 *
 * Keys use prefixed form (`<upstreamNode>.<key>`) OR flat form — the
 * context builder exposes both, so either shape is accepted here.
 */
function detectMissingRequiredInputs(
  handler: NodeHandler,
  ctx: NodeContext,
): string[] {
  const inputs = handler.metadata?.inputs;
  if (!inputs) return [];
  const missing: string[] = [];
  for (const [key, requirement] of Object.entries(inputs)) {
    if (requirement !== "required") continue;
    if (!(key in ctx.handlerData)) missing.push(key);
  }
  return missing;
}

/**
 * Best-effort suggestion of which upstream node SHOULD have produced each
 * missing key. Scans `config.handlers` declarations in the compiled APM
 * context and returns a comma-separated list of handler names whose
 * `outputs` include the missing key. Empty string when no producer is
 * declared — still useful because the author sees "no declared producer"
 * in the error, nudging them to register one.
 */
function suggestProducersForMissing(
  missing: string[],
  ctx: NodeContext,
): Record<string, string> {
  const declaredHandlers = ctx.apmContext.config?.handlers as
    | Record<string, { outputs?: string[] }>
    | undefined;
  const out: Record<string, string> = {};
  if (!declaredHandlers) return out;
  for (const key of missing) {
    const producers: string[] = [];
    for (const [name, decl] of Object.entries(declaredHandlers)) {
      if (decl.outputs && decl.outputs.includes(key)) producers.push(name);
    }
    if (producers.length > 0) out[key] = producers.join(", ");
  }
  return out;
}
