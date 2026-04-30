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
export {};
//# sourceMappingURL=invocation-filesystem.js.map