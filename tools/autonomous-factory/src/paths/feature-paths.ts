/**
 * paths/feature-paths.ts — Pure per-feature file-path computation.
 *
 * Layout:
 *
 *     in-progress/<slug>/
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

/** Every per-feature file currently routed through this module. */
export type FeatureFileKind =
  | "spec"
  | "state"
  | "trans"
  | "acceptance"
  | "baseline"
  | "validation"
  | "qa-report"
  | "pw-report"
  | "debug-notes"
  | "flight-data"
  | "summary"
  | "summary-data"
  | "terminal-log"
  | "playwright-log"
  | "events"
  | "blobs"
  | "change-manifest"
  | "novel-triage"
  | "halt"
  | "ci-failure"
  | "reflection";

/** Slug-relative subpath for each kind. The slug directory itself is the
 *  prefix, so every path is rooted at `<inProgress>/<slug>/`. */
export const SUBPATHS: Readonly<Record<FeatureFileKind, string>> = Object.freeze({
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
  baseline: "_kickoff/baseline.json",
  "flight-data": "_kickoff/flight-data.json",
});

/** Absolute path of a per-feature file under
 *  `<appRoot>/in-progress/<slug>/`. */
export function featurePath(
  appRoot: string,
  slug: string,
  kind: FeatureFileKind,
): string {
  return path.join(appRoot, "in-progress", slug, SUBPATHS[kind]);
}

/** Absolute path of an archived per-feature file under
 *  `<appRoot>/archive/features/<slug>/`. The slug directory's contents
 *  are moved as a unit during archiving, so the relative subpath survives. */
export function archiveFeaturePath(
  appRoot: string,
  slug: string,
  kind: FeatureFileKind,
): string {
  return path.join(appRoot, "archive", "features", slug, SUBPATHS[kind]);
}

/** Repo-root-relative presentation string for prompts / error messages
 *  that need to reference a feature file by name. Avoids leaking
 *  absolute paths into agent context. */
export function featureRelPath(slug: string, kind: FeatureFileKind): string {
  return "in-progress/" + slug + "/" + SUBPATHS[kind];
}
