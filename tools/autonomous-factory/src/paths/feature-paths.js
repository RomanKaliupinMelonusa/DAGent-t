/**
 * paths/feature-paths.ts — Pure per-feature file-path computation.
 *
 * Layout:
 *
 *     .dagent/<slug>/
 *       _state.json                      // kernel state
 *       _trans.md                        // human-readable transition log
 *       _events.jsonl                    // telemetry stream
 *       _blobs.jsonl                     // telemetry blob sidecar
 *       _summary.md                      // pipeline executive summary
 *       _summary-data.json
 *       _terminal-log.md
 *       _playwright-log.md
 *       _change-manifest.json
 *       _novel-triage.jsonl
 *       _halt.md                         // kernel halt-escalation marker
 *       _ci-failure.log
 *       _reflection.md
 *       _validation.json                 // mirrors of node outputs read
 *       _qa-report.json                  // by reporting / triage layers
 *       _pw-report.json
 *       _debug-notes.md
 *       _kickoff/
 *         spec.md
 *         acceptance.yml
 *         baseline.json
 *         flight-data.json               // preflight result
 *       <nodeKey>/<invocationId>/<kind>.<ext>   // ArtifactBus node scope
 *
 * Pure — no I/O, no dependencies beyond `node:path`. Writers needing
 * directory creation should use `ensureFeatureDir` from
 * `adapters/feature-paths.ts`.
 */
import path from "node:path";
/** Per-app pipeline working directory name. The kernel persists per-feature
 *  state, telemetry, and node invocation artifacts under
 *  `<appRoot>/<WORKING_DIR>/<slug>/`. */
export const WORKING_DIR = ".dagent";
/** Slug-relative subpath for each kind. The slug directory itself is the
 *  prefix, so every path is rooted at `<inProgress>/<slug>/`. */
export const SUBPATHS = Object.freeze({
    state: "_state.json",
    trans: "_trans.md",
    events: "_events.jsonl",
    blobs: "_blobs.jsonl",
    summary: "_summary.md",
    "summary-data": "_summary-data.json",
    "terminal-log": "_terminal-log.md",
    "playwright-log": "_playwright-log.md",
    "change-manifest": "_change-manifest.json",
    "novel-triage": "_novel-triage.jsonl",
    halt: "_halt.md",
    "ci-failure": "_ci-failure.log",
    reflection: "_reflection.md",
    validation: "_validation.json",
    "qa-report": "_qa-report.json",
    "pw-report": "_pw-report.json",
    "debug-notes": "_debug-notes.md",
    spec: "_kickoff/spec.md",
    acceptance: "_kickoff/acceptance.yml",
    /**
     * @deprecated Manual-staging compatibility only. Primary source for the
     * baseline profile is the artifact catalog (the latest sealed
     * `baseline` artifact produced by `baseline-analyzer`, resolved via
     * `FileArtifactBus.findLatestArtifact`). `FileBaselineLoader` reads
     * this kickoff path only as a fallback when the analyzer hasn't run.
     */
    baseline: "_kickoff/baseline.json",
    "flight-data": "_kickoff/flight-data.json",
});
/** Absolute path of a per-feature file under
 *  `<appRoot>/<WORKING_DIR>/<slug>/`. */
export function featurePath(appRoot, slug, kind) {
    return path.join(appRoot, WORKING_DIR, slug, SUBPATHS[kind]);
}
/** Repo-root-relative presentation string for prompts / error messages
 *  that need to reference a feature file by name. Avoids leaking
 *  absolute paths into agent context. */
export function featureRelPath(slug, kind) {
    return WORKING_DIR + "/" + slug + "/" + SUBPATHS[kind];
}
//# sourceMappingURL=feature-paths.js.map