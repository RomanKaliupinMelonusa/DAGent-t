/**
 * dispatch/invocation-builder.ts — Phase 3 input materialization.
 *
 * Resolves a node's declared `consumes_kickoff` / `consumes_artifacts` /
 * `consumes_reroute` against the on-disk artifact tree, copies the bytes
 * into the invocation's `inputs/` directory, and writes a typed
 * `inputs/params.in.json` manifest summarizing what was materialized.
 *
 * Pure with respect to the kernel state — only reads the state snapshot
 * and the filesystem; mutates only `<inv>/inputs/`.
 *
 * Required-but-missing inputs throw `MissingRequiredInputError`. The
 * dispatcher converts the throw into a synthetic failed invocation with
 * `errorSignature = "missing_required_input:<kind>"`.
 */

import type { NodeIOContract, KickoffConsumes, UpstreamConsumes, RerouteConsumes } from "../../contracts/node-io-contract.js";
import type { ArtifactKind } from "../../apm/artifact-catalog.js";
import type { ArtifactBus, ArtifactRef } from "../../ports/artifact-bus.js";
import type { InvocationFilesystem } from "../../ports/invocation-filesystem.js";
import type { FeatureFilesystem } from "../../ports/feature-filesystem.js";
import type {
  PipelineState,
  InvocationRecord,
  ArtifactRefSerialized,
  InvocationTrigger,
} from "../../types.js";
import { getArtifactKind, stampEnvelope, validateArtifactPayload, validateEnvelope } from "../../apm/artifact-catalog.js";

export class MissingRequiredInputError extends Error {
  constructor(
    public readonly nodeKey: string,
    public readonly kind: string,
    public readonly source: "kickoff" | "upstream" | "reroute",
    public readonly upstreamFrom?: string,
  ) {
    super(
      `Missing required ${source} input on node "${nodeKey}": kind="${kind}"` +
        (upstreamFrom ? ` (from="${upstreamFrom}")` : ""),
    );
    this.name = "MissingRequiredInputError";
  }
  /** Stable signature for kernel error classification. */
  signature(): string {
    return `missing_required_input:${this.kind}`;
  }
}

export interface MaterializeInputsArgs {
  readonly contract: NodeIOContract;
  readonly slug: string;
  readonly nodeKey: string;
  readonly invocationId: string;
  readonly trigger: InvocationTrigger;
  readonly state: PipelineState;
  readonly bus: ArtifactBus;
  readonly invocation: InvocationFilesystem;
  readonly fs: FeatureFilesystem;
  /**
   * Session A (Item 8) — when true, `copyIntoInputs` additionally calls
   * `validateEnvelope` for every materialized artifact. Surfaces upstream
   * envelope omissions at the consumer boundary even when the producer
   * bypassed `bus.write` (agent-authored files, hook-scripted files).
   * Wired from `config.strict_artifacts`.
   */
  readonly strictArtifacts?: boolean;
}

export interface MaterializedInputs {
  /** Refs of every artifact that was materialized into `inputs/`. */
  readonly inputs: ArtifactRefSerialized[];
  /** Plain-data manifest written to `inputs/params.in.json`. */
  readonly paramsIn: ParamsInManifest;
}

export interface ParamsInManifest {
  readonly nodeKey: string;
  readonly invocationId: string;
  readonly trigger: InvocationTrigger;
  readonly artifacts: Array<{
    readonly kind: ArtifactKind;
    readonly source: "kickoff" | "upstream" | "reroute";
    readonly from?: string;
    readonly sourcePath: string;
    readonly inputPath: string;
  }>;
}

const PARAMS_IN_FILENAME = "params.in.json";

/**
 * Materialize all declared inputs for an invocation. Idempotent — re-runs
 * overwrite the existing copies in `inputs/`. Throws on the first
 * required-but-missing input.
 */
export async function materializeInputs(args: MaterializeInputsArgs): Promise<MaterializedInputs> {
  const { contract, slug, nodeKey, invocationId, trigger, state, bus, invocation, fs, strictArtifacts } = args;
  const handles = await invocation.ensureInvocationDir(slug, nodeKey, invocationId);

  const refs: ArtifactRefSerialized[] = [];
  const manifest: ParamsInManifest["artifacts"] = [];

  for (const decl of contract.consumes.kickoff) {
    const entry = await materializeKickoff(
      decl, slug, nodeKey, bus, fs, handles.inputsDir, strictArtifacts,
    );
    if (entry) {
      refs.push(entry.ref);
      manifest.push(entry.manifest);
    }
  }

  for (const decl of contract.consumes.upstream) {
    const entry = await materializeUpstream(
      decl, slug, nodeKey, state, bus, fs, handles.inputsDir, strictArtifacts,
    );
    if (entry) {
      refs.push(entry.ref);
      manifest.push(entry.manifest);
    }
  }

  if (trigger === "triage-reroute") {
    for (const decl of contract.consumes.reroute) {
      const entry = await materializeReroute(
        decl, slug, nodeKey, state, bus, fs, handles.inputsDir, strictArtifacts,
      );
      if (entry) {
        refs.push(entry.ref);
        manifest.push(entry.manifest);
      }
    }
  } else {
    // Reroute consumes are only enforced on actual reroutes — non-reroute
    // dispatches treat them as absent regardless of the `required` flag.
    // No-op.
  }

  const paramsIn: ParamsInManifest = {
    nodeKey,
    invocationId,
    trigger,
    artifacts: manifest,
  };
  await fs.writeFile(
    fs.joinPath(handles.inputsDir, PARAMS_IN_FILENAME),
    JSON.stringify(paramsIn, null, 2) + "\n",
  );

  return { inputs: refs, paramsIn };
}

// ─── Kickoff ───────────────────────────────────────────────────────────────

async function materializeKickoff(
  decl: KickoffConsumes,
  slug: string,
  nodeKey: string,
  bus: ArtifactBus,
  fs: FeatureFilesystem,
  inputsDir: string,
  strictArtifacts?: boolean,
): Promise<{ ref: ArtifactRefSerialized; manifest: ParamsInManifest["artifacts"][number] } | null> {
  const ref = bus.ref(slug, decl.kind);
  if (!(await bus.exists(ref))) {
    if (decl.required) throw new MissingRequiredInputError(nodeKey, decl.kind, "kickoff");
    return null;
  }
  const inputPath = await copyIntoInputs(ref, fs, inputsDir, decl.kind, strictArtifacts);
  return {
    ref: serialize(ref),
    manifest: {
      kind: decl.kind,
      source: "kickoff",
      sourcePath: ref.path,
      inputPath,
    },
  };
}

// ─── Upstream ──────────────────────────────────────────────────────────────

async function materializeUpstream(
  decl: UpstreamConsumes,
  slug: string,
  nodeKey: string,
  state: PipelineState,
  bus: ArtifactBus,
  fs: FeatureFilesystem,
  inputsDir: string,
  strictArtifacts?: boolean,
): Promise<{ ref: ArtifactRefSerialized; manifest: ParamsInManifest["artifacts"][number] } | null> {
  const upstreamRecord = pickUpstreamInvocation(state, decl);
  if (!upstreamRecord) {
    if (decl.required) throw new MissingRequiredInputError(nodeKey, decl.kind, "upstream", decl.from);
    return null;
  }
  // Prefer the ref already on the upstream record's outputs (carries the
  // exact path the producer wrote to). Fall back to recomputing via the bus.
  const onRecord = upstreamRecord.outputs.find((o) => o.kind === decl.kind);
  const ref: ArtifactRef = onRecord
    ? {
        kind: onRecord.kind as ArtifactKind,
        scope: "node",
        slug: onRecord.slug,
        nodeKey: onRecord.nodeKey ?? decl.from,
        invocationId: onRecord.invocationId ?? upstreamRecord.invocationId,
        path: onRecord.path,
      }
    : bus.ref(slug, decl.kind, {
        nodeKey: decl.from,
        invocationId: upstreamRecord.invocationId,
      });
  if (!(await bus.exists(ref))) {
    if (decl.required) throw new MissingRequiredInputError(nodeKey, decl.kind, "upstream", decl.from);
    return null;
  }
  const inputPath = await copyIntoInputs(ref, fs, inputsDir, decl.kind, strictArtifacts);
  return {
    ref: serialize(ref),
    manifest: {
      kind: decl.kind,
      source: "upstream",
      from: decl.from,
      sourcePath: ref.path,
      inputPath,
    },
  };
}

/** Pick the invocation of an upstream node according to `pick`. */
function pickUpstreamInvocation(
  state: PipelineState,
  decl: UpstreamConsumes,
): InvocationRecord | null {
  const records = state.artifacts ? Object.values(state.artifacts) : [];
  const completed = records
    .filter((r) => r.nodeKey === decl.from && r.outcome === "completed")
    .sort((a, b) => (a.invocationId < b.invocationId ? -1 : 1));
  if (completed.length === 0) return null;
  if (decl.pick === "previous" && completed.length >= 2) {
    return completed[completed.length - 2]!;
  }
  return completed[completed.length - 1]!;
}

// ─── Reroute ───────────────────────────────────────────────────────────────

async function materializeReroute(
  decl: RerouteConsumes,
  slug: string,
  nodeKey: string,
  state: PipelineState,
  bus: ArtifactBus,
  fs: FeatureFilesystem,
  inputsDir: string,
  strictArtifacts?: boolean,
): Promise<{ ref: ArtifactRefSerialized; manifest: ParamsInManifest["artifacts"][number] } | null> {
  // Reroute payloads come from the most recent invocation that PRODUCED
  // an artifact of `decl.kind` (typically the triage handler's
  // `triage-handoff`). Search across all nodes — the kind itself is the
  // discriminator, not the source nodeKey.
  //
  // Unlike kickoff/upstream resolution, we intentionally do NOT require
  // `outcome === "completed"`. A reroute artifact present in the ledger
  // (with its bytes still on disk, gated by `bus.exists` below) is
  // authoritative by virtue of being emitted — even if the producing
  // invocation was later sealed as `error` (e.g. a triage node that
  // wrote a handoff but then crashed in a post-classification command).
  // Filtering by completed-only here would make such a state
  // unrecoverable — the downstream dev node would wedge on
  // `MissingRequiredInputError` while the handoff file sits on disk.
  //
  // Completed-preference tiebreaker: when both a newer error-sealed and
  // an older completed producer emitted the kind, prefer the completed
  // one. Eliminates the Bug B class where a late error-sealed producer
  // would override a freshly-completed one. The fallback to latest-any-
  // outcome still protects the write-then-crash wedge described above.
  const records = state.artifacts ? Object.values(state.artifacts) : [];
  const sorted = records
    .slice()
    .sort((a, b) => (a.invocationId < b.invocationId ? -1 : 1));
  let producer: InvocationRecord | undefined;
  let producedRef: ArtifactRefSerialized | undefined;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const rec = sorted[i]!;
    if (rec.outcome !== "completed") continue;
    const out = rec.outputs.find((o) => o.kind === decl.kind);
    if (out) {
      producer = rec;
      producedRef = out;
      break;
    }
  }
  if (!producer) {
    for (let i = sorted.length - 1; i >= 0; i--) {
      const rec = sorted[i]!;
      const out = rec.outputs.find((o) => o.kind === decl.kind);
      if (out) {
        producer = rec;
        producedRef = out;
        break;
      }
    }
  }
  if (!producer || !producedRef) {
    if (decl.required) throw new MissingRequiredInputError(nodeKey, decl.kind, "reroute");
    return null;
  }
  const ref: ArtifactRef = {
    kind: producedRef.kind as ArtifactKind,
    scope: "node",
    slug: producedRef.slug,
    nodeKey: producedRef.nodeKey ?? producer.nodeKey,
    invocationId: producedRef.invocationId ?? producer.invocationId,
    path: producedRef.path,
  };
  if (!(await bus.exists(ref))) {
    if (decl.required) throw new MissingRequiredInputError(nodeKey, decl.kind, "reroute");
    return null;
  }
  const inputPath = await copyIntoInputs(ref, fs, inputsDir, decl.kind, strictArtifacts);
  return {
    ref: serialize(ref),
    manifest: {
      kind: decl.kind,
      source: "reroute",
      from: producer.nodeKey,
      sourcePath: ref.path,
      inputPath,
    },
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

async function copyIntoInputs(
  ref: ArtifactRef,
  fs: FeatureFilesystem,
  inputsDir: string,
  kind: ArtifactKind,
  strictArtifacts?: boolean,
): Promise<string> {
  const def = getArtifactKind(kind);
  const filename = `${def.id}.${def.ext}`;
  const inputPath = fs.joinPath(inputsDir, filename);
  // Read source bytes and write to inputs/. UTF-8 is fine: artifact catalog
  // is text-only today (md / json / yml / log). If a binary kind is added,
  // FeatureFilesystem will need a binary read/write pair.
  const body = await fs.readFile(ref.path);
  // Track B1 — strict schema enforcement at the consumer boundary for kinds
  // that opted in (see `apm/artifact-catalog.ts`). No-op for kinds without
  // a registered schema. A malformed upstream artifact surfaces as a loud
  // error here rather than corrupting the downstream agent's prompt.
  validateArtifactPayload(kind, body, { path: ref.path });
  // Session A (Item 8) — strict envelope gate at the consumer boundary.
  // Complements the producer-side gate in `item-dispatch.ts` so agents or
  // hooks that bypass `bus.write` still have their envelope validated
  // before their output flows into a downstream agent's prompt.
  let effectiveBody = body;
  if (strictArtifacts && def.envelope) {
    if (def.envelope === "sidecar") {
      const sidecar = `${ref.path}.meta.json`;
      let sidecarBody: string | undefined;
      try {
        sidecarBody = await fs.readFile(sidecar);
      } catch {
        // sidecar missing — validateEnvelope will throw with a stable msg.
      }
      validateEnvelope(kind, body, { path: ref.path, sidecarBody });
    } else {
      // Auto-stamp missing envelope for `policy: "envelope-only"` inline
      // JSON kinds — symmetric with the producer-side gate in
      // `item-dispatch.ts`. Closes the case where an upstream was written
      // in a prior cycle (before the producer gate auto-stamped) and
      // would otherwise perma-block the consumer. No-op when envelope
      // already present; strict-policy kinds keep their body-schema
      // contract enforced via validateArtifactPayload above.
      if (def.policy === "envelope-only" && def.ext === "json") {
        const stamped = stampEnvelope(kind, body, ref.scope === "node" ? ref.nodeKey : "kickoff");
        if (stamped !== body) {
          await fs.writeFile(ref.path, stamped);
          effectiveBody = stamped;
        }
      }
      validateEnvelope(kind, effectiveBody, { path: ref.path });
    }
  }
  await fs.writeFile(inputPath, effectiveBody);
  return inputPath;
}

function serialize(ref: ArtifactRef): ArtifactRefSerialized {
  return {
    kind: ref.kind,
    scope: ref.scope,
    slug: ref.slug,
    path: ref.path,
    ...(ref.scope === "node"
      ? { nodeKey: ref.nodeKey, invocationId: ref.invocationId }
      : {}),
  };
}
