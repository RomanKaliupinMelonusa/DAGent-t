/**
 * activity-lib/produced-outputs-ingestion.ts — P5 of halt-discipline
 * hardening.
 *
 * After a node's handler returns `outcome: "completed"`, scan its
 * `<inv>/outputs/` directory for materialised artifacts that were NOT
 * already routed through the typed bus (`report_outcome` /
 * envelope handoff). Spec-compiler is the canonical example: the agent
 * drops `acceptance.yml` directly on disk via `agent-write-file`, and
 * absent this scan its produced kinds never appear in
 * `meta.json#outputs` — which means the P4 positive-output gate would
 * never fire and downstream consumers' input-materialisers can't see
 * the new artifact through the bus index.
 *
 * Behaviour:
 *   1. List files in `<inv>/outputs/` (skip `.gitkeep`, `*.meta.json`,
 *      and the handler-output envelope itself).
 *   2. Derive each file's `ArtifactKind` by matching its basename
 *      against the catalog (`<id>.<ext>`).
 *   3. Validate the body via `validateArtifactPayload` so a malformed
 *      envelope is surfaced as telemetry rather than silently
 *      registered.
 *   4. Append `{ kind, scope, slug, nodeKey, invocationId, path }` to
 *      `meta.json.outputs`, deduping against any refs already present.
 *
 * This helper is advisory — failures emit telemetry via
 * `ctx.logger.event` and DO NOT change the handler outcome. The only
 * side-effect on success is the persisted meta-mirror update.
 */

import path from "node:path";
import { readdirSync } from "node:fs";
import type { NodeContext } from "./types.js";
import type { ArtifactRefSerialized, InvocationRecord } from "../types.js";
import {
  listArtifactKinds,
  validateArtifactPayload,
  type ArtifactKindDef,
} from "../apm/artifact-catalog.js";

const HANDLER_OUTPUT_FILENAME = "handler-output.json";
const SIDECAR_SUFFIX = ".meta.json";
const GITKEEP = ".gitkeep";

/** Build a one-shot lookup from `<id>.<ext>` → catalog entry. */
function buildFilenameIndex(): ReadonlyMap<string, ArtifactKindDef> {
  const map = new Map<string, ArtifactKindDef>();
  for (const def of listArtifactKinds()) {
    if (!def.scopes.includes("node")) continue;
    map.set(`${def.id}.${def.ext}`, def);
  }
  return map;
}

const FILENAME_INDEX = buildFilenameIndex();

export async function ingestProducedOutputs(
  ctx: NodeContext,
): Promise<ReadonlyArray<ArtifactRefSerialized>> {
  const handles = ctx.invocation.pathsFor(
    ctx.slug,
    ctx.itemKey,
    ctx.executionId,
  );
  const outputsDir = handles.outputsDir;

  let entries: string[];
  try {
    entries = readdirSync(outputsDir);
  } catch {
    // No outputs dir or unreadable — nothing to ingest.
    return [];
  }

  const ingested: ArtifactRefSerialized[] = [];
  for (const entry of entries) {
    if (entry === GITKEEP) continue;
    if (entry === HANDLER_OUTPUT_FILENAME) continue;
    if (entry.endsWith(SIDECAR_SUFFIX)) continue;

    const def = FILENAME_INDEX.get(entry);
    if (!def) {
      ctx.logger.event("produced-outputs.unknown_filename", ctx.itemKey, {
        filename: entry,
      });
      continue;
    }

    const fullPath = path.join(outputsDir, entry);
    let body: string;
    try {
      body = await ctx.filesystem.readFile(fullPath);
    } catch (err) {
      ctx.logger.event("produced-outputs.read_failed", ctx.itemKey, {
        path: fullPath,
        kind: def.id,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    try {
      validateArtifactPayload(def.id as Parameters<typeof validateArtifactPayload>[0], body, {
        path: fullPath,
      });
    } catch (err) {
      ctx.logger.event("produced-outputs.invalid", ctx.itemKey, {
        path: fullPath,
        kind: def.id,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    ingested.push({
      kind: def.id,
      scope: "node",
      slug: ctx.slug,
      nodeKey: ctx.itemKey,
      invocationId: ctx.executionId,
      path: fullPath,
    });
  }

  if (ingested.length === 0) return ingested;

  // ── Persist into meta.json#outputs (idempotent merge) ─────────────────
  try {
    const prior = await ctx.invocation.readMeta(
      ctx.slug,
      ctx.itemKey,
      ctx.executionId,
    );
    const existing: ArtifactRefSerialized[] = prior?.outputs ? [...prior.outputs] : [];
    const seen = new Set(existing.map((o) => `${o.kind}::${o.path}`));
    for (const ref of ingested) {
      const key = `${ref.kind}::${ref.path}`;
      if (!seen.has(key)) {
        existing.push(ref);
        seen.add(key);
      }
    }
    const patched: InvocationRecord = prior
      ? { ...prior, outputs: existing }
      : {
          invocationId: ctx.executionId,
          nodeKey: ctx.itemKey,
          cycleIndex: ctx.attempt,
          trigger: "initial",
          startedAt: new Date().toISOString(),
          inputs: [],
          outputs: existing,
        };
    await ctx.invocation.writeMeta(
      ctx.slug,
      ctx.itemKey,
      ctx.executionId,
      patched,
    );
  } catch (err) {
    ctx.logger.event("produced-outputs.meta_write_failed", ctx.itemKey, {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  ctx.logger.event("produced-outputs.ingested", ctx.itemKey, {
    count: ingested.length,
    kinds: ingested.map((r) => r.kind),
  });

  return ingested;
}
