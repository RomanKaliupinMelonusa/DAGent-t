/**
 * adapters/feature-paths.ts — Filesystem-side companion to
 * `paths/feature-paths.ts`.
 *
 * The pure path-computation helpers live in `paths/feature-paths.ts`
 * (no I/O, safe for any layer to import). This module re-exports those
 * helpers and adds the one filesystem-touching primitive — `ensureFeatureDir`
 * — so writers can prepare a directory before `writeFileSync`.
 */
import path from "node:path";
import { mkdirSync } from "node:fs";
import { featurePath } from "../paths/feature-paths.js";
export { featurePath, featureRelPath, WORKING_DIR, SUBPATHS, } from "../paths/feature-paths.js";
/** Ensure the parent directory of a per-feature file exists. Writers
 *  call this immediately before `writeFileSync(featurePath(...), ...)`
 *  to avoid ENOENT on first write into a fresh slug directory. */
export function ensureFeatureDir(appRoot, slug, kind) {
    mkdirSync(path.dirname(featurePath(appRoot, slug, kind)), { recursive: true });
}
//# sourceMappingURL=feature-paths.js.map