/**
 * ports/invocation-filesystem.ts — Per-invocation directory port.
 *
 * Owns the canonical layout for one dispatch:
 *
 *     .dagent/<slug>/<nodeKey>/<invocationId>/
 *       meta.json            (mirror of InvocationRecord)
 *       inputs/              (resolved consumes; populated in Phase 3)
 *       outputs/             (declared produces; populated in Phase 2)
 *       logs/                (per-invocation log sinks; populated in Phase 4)
 *
 * Phase 1 scope: directory shape + meta-mirror + seal probe. Input
 * materialization (Phase 3) and per-invocation logger (Phase 4) build on
 * top of this port without re-deriving paths.
 *
 * Distinct from `ArtifactBus`:
 *   - `InvocationFilesystem` owns the *invocation directory itself* —
 *     `<inv>/`, `<inv>/inputs/`, `<inv>/outputs/`, `<inv>/logs/`,
 *     `<inv>/meta.json`. It is the structural authority.
 *   - `ArtifactBus` writes individual artifacts (by `kind`) into those
 *     directories. Phase 2 flips its `nodePath()` to compose
 *     `invocationDir + 'outputs/' + kindFilename`.
 */

import type { InvocationRecord } from "../types.js";

export interface InvocationDirHandles {
  /** Absolute path to `<appRoot>/.dagent/<slug>/<nodeKey>/<invocationId>/`. */
  readonly invocationDir: string;
  /** Absolute path to `<invocationDir>/inputs/`. */
  readonly inputsDir: string;
  /** Absolute path to `<invocationDir>/outputs/`. */
  readonly outputsDir: string;
  /** Absolute path to `<invocationDir>/logs/`. */
  readonly logsDir: string;
}

export interface InvocationFilesystem {
  /**
   * Create the four-directory layout for an invocation if it does not
   * already exist. Idempotent. Returns the canonical path handles so
   * callers (handlers, hooks, materializers) avoid re-deriving them.
   */
  ensureInvocationDir(
    slug: string,
    nodeKey: string,
    invocationId: string,
  ): Promise<InvocationDirHandles>;

  /**
   * Compute the path handles for an invocation without touching the
   * filesystem. Used by readers that only need to inspect or list.
   */
  pathsFor(
    slug: string,
    nodeKey: string,
    invocationId: string,
  ): InvocationDirHandles;

  /**
   * Write `<invocationDir>/meta.json` mirroring the persisted
   * `InvocationRecord`. Best-effort sibling to the kernel's
   * `state.artifacts[invocationId]` entry — `_state.json` remains the
   * source of truth, the meta file is for human inspection + offline
   * tooling (archive readers, retro reports, debug scripts).
   */
  writeMeta(
    slug: string,
    nodeKey: string,
    invocationId: string,
    record: InvocationRecord,
  ): Promise<void>;

  /**
   * Read the meta mirror back. Returns `null` when the file is absent
   * (e.g. the invocation never dispatched or the dir was archived).
   */
  readMeta(
    slug: string,
    nodeKey: string,
    invocationId: string,
  ): Promise<InvocationRecord | null>;

  /**
   * Mark the invocation directory as sealed. Phase 1 records the seal in
   * the underlying `ArtifactBus` cache via the kernel; this port exposes
   * the operation so hooks have a single call to make at end-of-dispatch.
   * Idempotent.
   */
  sealInvocation(
    slug: string,
    nodeKey: string,
    invocationId: string,
  ): Promise<void>;

  /**
   * `true` once `sealInvocation` has been called for the given coords.
   */
  isSealed(slug: string, nodeKey: string, invocationId: string): boolean;
}
