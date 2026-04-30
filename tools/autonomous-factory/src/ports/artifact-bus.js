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
// ---------------------------------------------------------------------------
// Helpers exported for adapters/tests
// ---------------------------------------------------------------------------
/** Scope predicate re-exported for adapter implementations. */
export function assertScopeSupported(kind, scope, supported) {
    if (!supported.includes(scope)) {
        throw new Error(`Artifact kind '${kind}' is not supported in scope '${scope}' (supported: ${supported.join(", ")})`);
    }
}
//# sourceMappingURL=artifact-bus.js.map