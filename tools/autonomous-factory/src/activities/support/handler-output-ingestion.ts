/**
 * activities/support/handler-output-ingestion.ts — Symmetric handoff channel
 * for script / agent nodes.
 *
 * Pure helper extracted from the deleted
 * `handlers/middlewares/handler-output-ingestion.ts` wrapper. Activities
 * (local-exec, copilot-agent) call this at the end of every dispatch to
 * probe `$OUTPUTS_DIR/handler-output.json`, validate the envelope, and
 * surface the resulting `output` bag and artifact ref.
 *
 * All failure modes are advisory — the caller's handler outcome is
 * never changed:
 *   - file absent              → no-op
 *   - invalid JSON / envelope  → `handler-output.invalid` telemetry
 *   - shadowed reserved keys   → dropped + `handler-output.reserved_key`
 */

import type { NodeContext } from "../../contracts/node-context.js";
import type { ArtifactRefSerialized } from "../../types.js";
import {
  HandlerOutputArtifactSchema,
  validateArtifactPayload,
} from "../../apm/artifacts/artifact-catalog.js";

/** Reserved keys owned by the `local-exec` activity. Scripts must not
 *  shadow these via the envelope; anything the envelope places under one
 *  of them is dropped with a telemetry warning. `structuredFailure` is
 *  intentionally NOT reserved — it's the primary payload a script
 *  surfaces through the envelope. */
const RESERVED_HANDLER_OUTPUT_KEYS: ReadonlySet<string> = new Set([
  "scriptOutput",
  "exitCode",
  "timedOut",
]);

export interface IngestedEnvelope {
  readonly output: Record<string, unknown>;
  readonly artifact?: ArtifactRefSerialized;
}

/** Pure probe helper. */
export async function ingestHandlerOutputEnvelope(
  ctx: NodeContext,
): Promise<IngestedEnvelope> {
  // Guard ref construction — tests / edge cases may supply non-canonical
  // executionIds. Treat any failure here as "no envelope present" so the
  // ingestion channel stays strictly advisory.
  const bus = ctx.artifactBus;
  let ref;
  try {
    ref = bus.ref(ctx.slug, "handler-output", {
      nodeKey: ctx.itemKey,
      invocationId: ctx.executionId,
    });
  } catch {
    return { output: {} };
  }
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
