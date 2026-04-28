/**
 * handlers/middlewares/handler-output-ingestion.ts — Symmetric handoff
 * channel for script / agent nodes.
 *
 * Probes `$OUTPUTS_DIR/handler-output.json` at the end of every dispatch
 * (after the handler body AND after any `post:` lifecycle hook has run),
 * validates the envelope against `HandlerOutputArtifactSchema`, and
 * merges the envelope's `output` bag into `NodeResult.handlerOutput`.
 *
 * Scripts surface structured data to downstream nodes through the same
 * `NodeResult.handlerOutput` channel agents populate via the
 * `report_outcome` SDK tool. The two producer ergonomics differ; the
 * wire format is shared.
 *
 * Position in the default chain: OUTER of `lifecycle-hooks` so that
 * post-hooks can emit the envelope file and have it ingested before the
 * result reaches the dispatcher. See `item-dispatch.ts` /
 * `middlewares/registry.ts` for wiring.
 *
 * All failure modes are advisory — the underlying handler outcome is
 * never changed:
 *   - file absent              → no-op
 *   - invalid JSON / envelope  → `handler-output.invalid` telemetry
 *   - shadowed reserved keys   → dropped + `handler-output.reserved_key`
 */

import type { NodeMiddleware, MiddlewareNext } from "../middleware.js";
import type { NodeContext, NodeResult } from "../types.js";
import type { ArtifactRefSerialized } from "../../types.js";
import { FileArtifactBus } from "../../adapters/file-artifact-bus.js";
import {
  HandlerOutputArtifactSchema,
  validateArtifactPayload,
} from "../../apm/artifact-catalog.js";

/** Reserved keys owned by the `local-exec` handler. Scripts must not
 *  shadow these via the envelope; anything the envelope places under one
 *  of them is dropped with a telemetry warning. `structuredFailure` is
 *  intentionally NOT reserved — it's the primary payload a script
 *  surfaces through the envelope (see `hooks/emit-playwright-handler-output.mjs`). */
const RESERVED_HANDLER_OUTPUT_KEYS: ReadonlySet<string> = new Set([
  "scriptOutput",
  "exitCode",
  "timedOut",
]);

interface IngestedEnvelope {
  readonly output: Record<string, unknown>;
  readonly artifact?: ArtifactRefSerialized;
}

/** Pure probe helper — exported for focused unit tests. */
export async function ingestHandlerOutputEnvelope(
  ctx: NodeContext,
): Promise<IngestedEnvelope> {
  // Guard ref construction — tests / edge cases may supply non-canonical
  // executionIds. Treat any failure here as "no envelope present" so the
  // ingestion channel stays strictly advisory (consistent with the rest
  // of the helper's error paths).
  let ref;
  try {
    const bus = new FileArtifactBus(ctx.appRoot, ctx.filesystem);
    ref = bus.ref(ctx.slug, "handler-output", {
      nodeKey: ctx.itemKey,
      invocationId: ctx.executionId,
    });
  } catch {
    return { output: {} };
  }
  const bus = new FileArtifactBus(ctx.appRoot, ctx.filesystem);
  let present = false;
  try {
    present = await bus.exists(ref);
  } catch {
    return { output: {} };
  }
  if (!present) return { output: {} };

  let body: string;
  try {
    body = await bus.read(ref);
  } catch (err) {
    ctx.logger.event("handler-output.invalid", ctx.itemKey, {
      reason: "read_failed",
      error: err instanceof Error ? err.message : String(err),
      path: ref.path,
    });
    return { output: {} };
  }

  try {
    validateArtifactPayload("handler-output", body, { path: ref.path });
  } catch (err) {
    ctx.logger.event("handler-output.invalid", ctx.itemKey, {
      reason: "schema_invalid",
      error: err instanceof Error ? err.message : String(err),
      path: ref.path,
    });
    return { output: {} };
  }

  // validateArtifactPayload already asserts the shape — parse is safe.
  const parsed = HandlerOutputArtifactSchema.parse(JSON.parse(body));
  const filtered: Record<string, unknown> = {};
  const shadowed: string[] = [];
  for (const [k, v] of Object.entries(parsed.output)) {
    if (RESERVED_HANDLER_OUTPUT_KEYS.has(k)) {
      shadowed.push(k);
      continue;
    }
    filtered[k] = v;
  }
  if (shadowed.length > 0) {
    ctx.logger.event("handler-output.reserved_key", ctx.itemKey, {
      keys: shadowed,
      path: ref.path,
    });
  }

  const artifact: ArtifactRefSerialized = {
    kind: ref.kind,
    scope: ref.scope,
    slug: ref.slug,
    ...(ref.scope === "node"
      ? { nodeKey: ref.nodeKey, invocationId: ref.invocationId }
      : {}),
    path: ref.path,
  };
  ctx.logger.event("node.handler_output", ctx.itemKey, {
    path: ref.path,
    keys: Object.keys(filtered),
  });
  return { output: filtered, artifact };
}

export const handlerOutputIngestionMiddleware: NodeMiddleware = {
  name: "handler-output-ingestion",

  async run(ctx: NodeContext, next: MiddlewareNext): Promise<NodeResult> {
    const result = await next();
    const envelope = await ingestHandlerOutputEnvelope(ctx);
    if (Object.keys(envelope.output).length === 0 && !envelope.artifact) {
      return result;
    }
    return {
      ...result,
      // Merge UNDER existing handlerOutput so handler-owned keys
      // (scriptOutput, exitCode, timedOut) always win. `filtered`
      // already has reserved keys stripped, so this is belt-and-braces.
      handlerOutput: { ...envelope.output, ...(result.handlerOutput ?? {}) },
      ...(envelope.artifact
        ? {
            producedArtifacts: [
              ...(result.producedArtifacts ?? []),
              envelope.artifact,
            ],
          }
        : {}),
    };
  },
};
