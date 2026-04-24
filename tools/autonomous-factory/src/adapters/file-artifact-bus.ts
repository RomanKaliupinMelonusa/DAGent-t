/**
 * adapters/file-artifact-bus.ts — Filesystem adapter for the Artifact Bus.
 *
 * Writes artifacts under
 *   `<appRoot>/in-progress/<slug>/...`
 * using the layout declared in `ports/artifact-bus.ts`.
 *
 * Phase 1 scope: addressing + read/write + in-memory seal tracking +
 * directory enumeration. Seal persistence, state-index maintenance, and
 * migration from the flat `${slug}_<TYPE>.<ext>` layout land in Phase 2.
 *
 * Delegates all filesystem calls to `FeatureFilesystem` so tests can stub
 * with an in-memory implementation, and so this adapter stays free of
 * `node:fs` imports.
 */

import type {
  ArtifactBus,
  ArtifactRef,
  KickoffArtifactRef,
  NodeArtifactRef,
} from "../ports/artifact-bus.js";
import type { FeatureFilesystem } from "../ports/feature-filesystem.js";
import type { ArtifactKind } from "../apm/artifact-catalog.js";
import type { PipelineLogger } from "../telemetry/events.js";
import {
  buildSidecarEnvelope,
  getArtifactKind,
  sidecarPath,
  stampEnvelope,
  validateArtifactPayload,
  validateEnvelope,
} from "../apm/artifact-catalog.js";
import { isInvocationId } from "../kernel/invocation-id.js";

const KICKOFF_DIR = "_kickoff";

/**
 * Identity stamped into the `producedBy` envelope slot when a kickoff-scope
 * artifact is written. Kickoff writes predate any node, so there is no node
 * key \u2014 bootstrap scripts / the CLI are the effective producer.
 */
const KICKOFF_PRODUCER = "kickoff";

export class FileArtifactBus implements ArtifactBus {
  /** `slug -> (nodeKey -> Set<invocationId>)` of invocations sealed during
   *  this adapter's lifetime. Phase 2 will migrate the source of truth to
   *  `state.artifacts[id].finishedAt`. */
  private readonly sealedCache = new Map<string, Map<string, Set<string>>>();

  /**
   * When true, every inline-envelope write MUST carry envelope fields;
   * sidecar writes MUST emit a valid `<path>.meta.json`. Violations throw
   * `ArtifactValidationError` from the payload layer. When false (default),
   * the bus auto-stamps missing envelope fields so producers written before
   * Session A keep working while the rollout proceeds.
   *
   * Plumbed from `config.strict_artifacts` at composition.
   */
  private readonly strict: boolean;

  constructor(
    private readonly appRoot: string,
    private readonly fs: FeatureFilesystem,
    /** Phase B \u2014 optional logger so every `write` emits a
     *  `node.artifact.write` event. Omitted by call sites that predate
     *  the observability contract (e.g. one-shot legacy migration). */
    private readonly logger?: PipelineLogger,
    opts: { strict?: boolean } = {},
  ) {
    if (!appRoot) {
      throw new Error("FileArtifactBus requires a non-empty appRoot");
    }
    this.strict = opts.strict ?? false;
  }

  // ─── Path helpers ────────────────────────────────────────────────────────

  private slugRoot(slug: string): string {
    this.assertIdent(slug, "slug");
    return this.fs.joinPath(this.appRoot, "in-progress", slug);
  }

  private filenameFor(kind: ArtifactKind): string {
    const def = getArtifactKind(kind);
    return `${def.id}.${def.ext}`;
  }

  kickoffPath(slug: string, kind: ArtifactKind): string {
    const def = getArtifactKind(kind);
    if (!def.scopes.includes("kickoff")) {
      throw new Error(`Artifact kind '${kind}' is not valid in the kickoff scope`);
    }
    return this.fs.joinPath(this.slugRoot(slug), KICKOFF_DIR, this.filenameFor(kind));
  }

  nodePath(
    slug: string,
    nodeKey: string,
    invocationId: string,
    kind: ArtifactKind,
  ): string {
    const def = getArtifactKind(kind);
    if (!def.scopes.includes("node")) {
      throw new Error(`Artifact kind '${kind}' is not valid in the node scope`);
    }
    this.assertIdent(nodeKey, "nodeKey");
    if (!isInvocationId(invocationId)) {
      throw new Error(`Invalid invocationId '${invocationId}' (expected 'inv_' prefix + 26 base32 chars)`);
    }
    // Phase 2 of the Unified Node I/O Contract — produced artifacts land
    // inside the canonical `<inv>/outputs/` subdir owned by the
    // InvocationFilesystem port. Inputs go under `<inv>/inputs/` (Phase 3).
    return this.fs.joinPath(
      this.slugRoot(slug),
      nodeKey,
      invocationId,
      "outputs",
      this.filenameFor(kind),
    );
  }

  ref(
    slug: string,
    kind: ArtifactKind,
    opts?: { nodeKey?: string; invocationId?: string },
  ): ArtifactRef {
    const def = getArtifactKind(kind);
    if (opts?.nodeKey && opts?.invocationId) {
      if (!def.scopes.includes("node")) {
        throw new Error(`Artifact kind '${kind}' cannot be produced in the node scope`);
      }
      const ref: NodeArtifactRef = {
        kind,
        scope: "node",
        slug,
        nodeKey: opts.nodeKey,
        invocationId: opts.invocationId,
        path: this.nodePath(slug, opts.nodeKey, opts.invocationId, kind),
      };
      return ref;
    }
    if (opts?.nodeKey || opts?.invocationId) {
      throw new Error(
        "ArtifactBus.ref(): `nodeKey` and `invocationId` must be provided together for node-scope refs",
      );
    }
    if (!def.scopes.includes("kickoff")) {
      throw new Error(
        `Artifact kind '${kind}' requires a nodeKey + invocationId (not a kickoff kind)`,
      );
    }
    const ref: KickoffArtifactRef = {
      kind,
      scope: "kickoff",
      slug,
      path: this.kickoffPath(slug, kind),
    };
    return ref;
  }

  // ─── I/O ────────────────────────────────────────────────────────────────

  async write(ref: ArtifactRef, content: string): Promise<void> {
    if (ref.scope === "node" && this.isSealed(ref.slug, ref.nodeKey, ref.invocationId)) {
      throw new Error(
        `Refusing to write to sealed invocation: ${ref.slug}/${ref.nodeKey}/${ref.invocationId}`,
      );
    }
    // Session A \u2014 envelope handling. Inline kinds get envelope fields stamped
    // into the body (unless strict mode, which requires the producer to
    // supply them); sidecar kinds get a `.meta.json` file co-written.
    const def = getArtifactKind(ref.kind);
    const producedBy = ref.scope === "node" ? ref.nodeKey : KICKOFF_PRODUCER;
    const producedAt = new Date().toISOString();

    let finalContent = content;
    if (def.envelope === "inline" && !this.strict) {
      finalContent = stampEnvelope(ref.kind, content, producedBy, producedAt);
    }

    // Track B1 \u2014 strict schema enforcement at the producer boundary for kinds
    // that opted in (see `apm/artifact-catalog.ts`). No-op for kinds without
    // a registered schema, so prose/handler-internal kinds stay unaffected.
    validateArtifactPayload(ref.kind, finalContent, { path: ref.path });

    // Session A \u2014 envelope validation. Under strict mode, demand envelope
    // fields are present (inline body or the sidecar we're about to write).
    if (this.strict && def.envelope === "inline") {
      validateEnvelope(ref.kind, finalContent, { path: ref.path });
    }

    await this.fs.writeFile(ref.path, finalContent);

    if (def.envelope === "sidecar") {
      const envelope = buildSidecarEnvelope(ref.kind, producedBy, producedAt);
      const sidecar = JSON.stringify(envelope, null, 2) + "\n";
      await this.fs.writeFile(sidecarPath(ref.path), sidecar);
    }

    // Phase B \u2014 uniform artifact-write telemetry. Kickoff writes carry no
    // invocationId; the event `nodeKey` is null for kickoff scope.
    if (this.logger) {
      this.logger.event(
        "node.artifact.write",
        ref.scope === "node" ? ref.nodeKey : null,
        {
          kind: ref.kind,
          scope: ref.scope,
          slug: ref.slug,
          path: ref.path,
          bytes: finalContent.length,
          envelope: def.envelope ?? null,
          ...(ref.scope === "node"
            ? { invocationId: ref.invocationId, nodeKey: ref.nodeKey }
            : {}),
        },
      );
    }
  }

  async read(ref: ArtifactRef): Promise<string> {
    return this.fs.readFile(ref.path);
  }

  async exists(ref: ArtifactRef): Promise<boolean> {
    return this.fs.exists(ref.path);
  }

  // ─── Seal tracking ──────────────────────────────────────────────────────

  async sealInvocation(slug: string, nodeKey: string, invocationId: string): Promise<void> {
    this.assertIdent(nodeKey, "nodeKey");
    if (!isInvocationId(invocationId)) {
      throw new Error(`Invalid invocationId '${invocationId}'`);
    }
    let nodes = this.sealedCache.get(slug);
    if (!nodes) {
      nodes = new Map<string, Set<string>>();
      this.sealedCache.set(slug, nodes);
    }
    let invs = nodes.get(nodeKey);
    if (!invs) {
      invs = new Set<string>();
      nodes.set(nodeKey, invs);
    }
    invs.add(invocationId);
  }

  isSealed(slug: string, nodeKey: string, invocationId: string): boolean {
    return this.sealedCache.get(slug)?.get(nodeKey)?.has(invocationId) === true;
  }

  // ─── Enumeration ────────────────────────────────────────────────────────

  async listInvocations(slug: string, nodeKey: string): Promise<string[]> {
    this.assertIdent(nodeKey, "nodeKey");
    const dir = this.fs.joinPath(this.slugRoot(slug), nodeKey);
    if (!(await this.fs.exists(dir))) return [];
    // Glob one level down; filter to valid invocation ids so we don't confuse
    // evidence subfolders or stray files for invocations.
    const entries = await this.fs.glob("*", dir);
    return entries
      .map((e) => {
        // glob results may be absolute or relative depending on adapter —
        // normalize to a basename.
        const sep = e.lastIndexOf("/");
        return sep >= 0 ? e.slice(sep + 1) : e;
      })
      .filter((e) => isInvocationId(e))
      .sort(); // lexicographic = chronological (ULID prefix)
  }

  async listForSlug(slug: string): Promise<Array<{ nodeKey: string; invocationId: string }>> {
    const root = this.slugRoot(slug);
    if (!(await this.fs.exists(root))) return [];
    const nodes = await this.fs.glob("*", root);
    const out: Array<{ nodeKey: string; invocationId: string }> = [];
    for (const raw of nodes) {
      const sep = raw.lastIndexOf("/");
      const nodeKey = sep >= 0 ? raw.slice(sep + 1) : raw;
      if (nodeKey === KICKOFF_DIR) continue;
      if (nodeKey.startsWith("_")) continue;
      let invs: string[];
      try {
        invs = await this.listInvocations(slug, nodeKey);
      } catch {
        continue;
      }
      for (const invocationId of invs) {
        out.push({ nodeKey, invocationId });
      }
    }
    return out;
  }

  // ─── Internals ──────────────────────────────────────────────────────────

  private assertIdent(value: string, label: string): void {
    if (!value || /[\\/]|\.\./.test(value)) {
      throw new Error(`Invalid ${label} '${value}' — may not contain '/', '\\', or '..'`);
    }
  }
}
