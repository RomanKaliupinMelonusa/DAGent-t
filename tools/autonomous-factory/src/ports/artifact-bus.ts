/**
 * ports/artifact-bus.ts — Port for the Artifact Bus (Phase 1).
 *
 * Abstracts all feature-workspace artifact I/O behind a single interface so
 * that subsequent phases can:
 *   - migrate the ~15 call-sites hardcoding `${slug}_<TYPE>.<ext>` paths,
 *   - enforce per-invocation immutability (seal on finish),
 *   - maintain the authoritative `state.artifacts` index,
 * without touching `node:fs` directly outside the adapter.
 *
 * Directory layout (target — see `docs/06-roadmap/artifact-bus.md`):
 *
 *     .dagent/<slug>/
 *       _state.json
 *       _trans.md
 *       _events.jsonl
 *       _invocations.jsonl
 *       _kickoff/
 *         <kind>.<ext>                          (scope=kickoff)
 *       <nodeKey>/
 *         <invocationId>/
 *           meta.json
 *           params.in.json
 *           params.out.json
 *           <kind>.<ext>                        (scope=node)
 *           evidence/
 *
 * Note: Phase 1 delivers only the port + adapter + path computation. Seal
 * enforcement, state-index integration, and legacy-layout migration land
 * in Phases 2 and 4.
 */

import type { ArtifactKind, ArtifactScope } from "../apm/artifacts/artifact-catalog.js";
export type { ArtifactKind, ArtifactScope };

// ---------------------------------------------------------------------------
// Address types
// ---------------------------------------------------------------------------

/** Canonical addressing of any artifact managed by the bus. */
export type ArtifactRef =
  | KickoffArtifactRef
  | NodeArtifactRef;

export interface KickoffArtifactRef {
  readonly kind: ArtifactKind;
  readonly scope: "kickoff";
  readonly slug: string;
  /** Absolute path resolved by the adapter. */
  readonly path: string;
}

export interface NodeArtifactRef {
  readonly kind: ArtifactKind;
  readonly scope: "node";
  readonly slug: string;
  readonly nodeKey: string;
  readonly invocationId: string;
  /** Absolute path resolved by the adapter. */
  readonly path: string;
}

// ---------------------------------------------------------------------------
// Port interface
// ---------------------------------------------------------------------------

export interface ArtifactBus {
  /**
   * Absolute path for a kickoff artifact.
   * Throws when the kind does not support the `kickoff` scope.
   */
  kickoffPath(slug: string, kind: ArtifactKind): string;

  /**
   * Absolute path for a node artifact inside a specific invocation directory.
   * Throws when the kind does not support the `node` scope.
   */
  nodePath(
    slug: string,
    nodeKey: string,
    invocationId: string,
    kind: ArtifactKind,
  ): string;

  /**
   * Build a canonical `ArtifactRef` for the given coordinates.
   * Convenience wrapper over `kickoffPath` / `nodePath`.
   */
  ref(
    slug: string,
    kind: ArtifactKind,
    opts?: { nodeKey?: string; invocationId?: string },
  ): ArtifactRef;

  /**
   * Write a UTF-8 string to the artifact at `ref`. Creates parent
   * directories as needed. Will reject once invocation sealing is wired
   * (Phase 2). For now the adapter simply delegates to the filesystem.
   */
  write(ref: ArtifactRef, content: string): Promise<void>;

  /**
   * Read the artifact at `ref` as UTF-8. Throws when the file is absent.
   */
  read(ref: ArtifactRef): Promise<string>;

  /**
   * `true` when the artifact file currently exists.
   */
  exists(ref: ArtifactRef): Promise<boolean>;

  /**
   * Mark an invocation directory as sealed. Subsequent `write` calls
   * targeting that invocation will reject. Phase 1 stores sealed state
   * in-memory on the adapter; Phase 2 persists it via the state index.
   */
  sealInvocation(slug: string, nodeKey: string, invocationId: string): Promise<void>;

  /**
   * `true` when the invocation directory has been sealed in this adapter
   * instance (Phase 1) or according to the persisted state index (Phase 2+).
   */
  isSealed(slug: string, nodeKey: string, invocationId: string): boolean;

  /**
   * Enumerate every invocation directory currently present on disk for a
   * given (slug, nodeKey). Returns invocation ids in ascending order
   * (i.e. chronological, by virtue of ULID-prefix ordering).
   */
  listInvocations(slug: string, nodeKey: string): Promise<string[]>;

  /**
   * Enumerate every (nodeKey, invocationId) pair currently present on disk
   * for a given slug. Does not include the `_kickoff` scope.
   */
  listForSlug(slug: string): Promise<Array<{ nodeKey: string; invocationId: string }>>;
}
