/**
 * reporting/node-report.ts — Track B2: kernel-synthesized per-invocation report.
 *
 * A uniform, structured rollup written for every invocation (agent, script,
 * poll, triage, approval) at seal time. Counters, durations, files touched,
 * tokens (null for non-LLM handlers), exit code, error signature. Gives
 * triage and retrospectives a single shape regardless of handler type.
 *
 * Pure w.r.t. I/O: `synthesizeNodeReport` is a pure function; the writer
 * wraps `FileArtifactBus.write` and returns a serialized ref.
 */

import type {
  ArtifactRefSerialized,
  InvocationTrigger,
  ItemSummary,
} from "../types.js";
import type { NodeContext } from "../contracts/node-context.js";
import type { ArtifactBus } from "../ports/artifact-bus.js";
import type { NodeReport } from "../apm/artifact-catalog.js";
import { buildEnvelope } from "../apm/artifact-catalog.js";

export type { NodeReport } from "../apm/artifact-catalog.js";

export interface SynthesizeNodeReportArgs {
  readonly nodeKey: string;
  readonly invocationId: string;
  readonly handler: string;
  readonly trigger: InvocationTrigger;
  readonly attempt: number;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly outcome: "completed" | "failed" | "error";
  /** Partial summary reported by the handler. May be absent (crash path). */
  readonly summary?: Partial<ItemSummary>;
  /** Causality envelope copied from the sealed `InvocationRecord`. */
  readonly triggeredBy?: NodeReport["triggeredBy"];
  /** Inverse of `triggeredBy` (triage records on a successful reroute). */
  readonly routedTo?: NodeReport["routedTo"];
}

/**
 * Compose a strict `NodeReport` from whatever the handler produced plus
 * the context. Missing optional fields default to safe zeros / empty
 * arrays / nulls so every report conforms to the schema.
 */
export function synthesizeNodeReport(args: SynthesizeNodeReportArgs): NodeReport {
  const s = args.summary ?? {};
  const startedMs = Date.parse(args.startedAt);
  const finishedMs = Date.parse(args.finishedAt);
  const durationMs =
    Number.isFinite(startedMs) && Number.isFinite(finishedMs) && finishedMs >= startedMs
      ? finishedMs - startedMs
      : typeof s.durationMs === "number"
        ? s.durationMs
        : 0;

  const shellCommands = s.shellCommands ?? [];
  const toolCalls = s.toolCounts
    ? Object.values(s.toolCounts).reduce((a, b) => a + (typeof b === "number" ? b : 0), 0)
    : 0;

  // Non-LLM handlers (local-exec, poll, approval) never populate token
  // usage; render `tokens: null` so the schema stays consistent.
  const hasAnyToken =
    (s.inputTokens ?? 0) > 0 ||
    (s.outputTokens ?? 0) > 0 ||
    (s.cacheReadTokens ?? 0) > 0 ||
    (s.cacheWriteTokens ?? 0) > 0;
  const tokens = hasAnyToken
    ? {
        input: s.inputTokens ?? 0,
        output: s.outputTokens ?? 0,
        cacheRead: s.cacheReadTokens ?? 0,
        cacheWrite: s.cacheWriteTokens ?? 0,
      }
    : null;

  const errorMessage = typeof s.errorMessage === "string" ? s.errorMessage : null;
  const errorSignature = extractErrorSignature(s);
  const exitCode = extractExitCode(s);

  return {
    nodeKey: args.nodeKey,
    invocationId: args.invocationId,
    handler: args.handler,
    trigger: args.trigger,
    attempt: args.attempt,
    startedAt: args.startedAt,
    finishedAt: args.finishedAt,
    durationMs,
    outcome: args.outcome,
    counters: {
      shellCommands: shellCommands.length,
      toolCalls,
      messages: (s.messages ?? []).length,
      intents: (s.intents ?? []).length,
      filesRead: (s.filesRead ?? []).length,
      filesChanged: (s.filesChanged ?? []).length,
    },
    tokens,
    filesRead: [...(s.filesRead ?? [])],
    filesChanged: [...(s.filesChanged ?? [])],
    intents: [...(s.intents ?? [])],
    messages: [...(s.messages ?? [])],
    errorMessage,
    errorSignature,
    exitCode,
    ...(args.triggeredBy ? { triggeredBy: args.triggeredBy } : {}),
    ...(args.routedTo ? { routedTo: args.routedTo } : {}),
  };
}

/** Pull an `errorSignature` out of a partial summary if the handler stamped one. */
function extractErrorSignature(s: Partial<ItemSummary>): string | null {
  const raw = (s as unknown as { errorSignature?: unknown }).errorSignature;
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

/** Pull an `exitCode` out of a partial summary if the handler stamped one. */
function extractExitCode(s: Partial<ItemSummary>): number | null {
  const raw = (s as unknown as { exitCode?: unknown }).exitCode;
  return typeof raw === "number" && Number.isInteger(raw) ? raw : null;
}

/**
 * Write the synthesized report to `<inv>/outputs/node-report.json` via
 * the artifact bus and return a serialized ref.
 *
 * MUST be called BEFORE `bus.sealInvocation` — the seal cache rejects
 * post-seal writes by design.
 */
export async function writeNodeReport(
  bus: ArtifactBus,
  ctx: NodeContext,
  report: NodeReport,
): Promise<ArtifactRefSerialized> {
  const ref = bus.ref(ctx.slug, "node-report", {
    nodeKey: ctx.itemKey,
    invocationId: ctx.executionId,
  });
  if (ref.scope !== "node") {
    throw new Error("node-report must be written in the node scope");
  }
  // Session A (Item 8) — emit the envelope natively so the body is valid
  // under `config.strict_artifacts: true` without relying on bus auto-stamp.
  const envelope = buildEnvelope("node-report", ctx.itemKey);
  const body = { ...envelope, ...report };
  await bus.write(ref, JSON.stringify(body, null, 2) + "\n");
  return {
    kind: ref.kind,
    scope: ref.scope,
    slug: ref.slug,
    path: ref.path,
    nodeKey: ref.nodeKey,
    invocationId: ref.invocationId,
  };
}
