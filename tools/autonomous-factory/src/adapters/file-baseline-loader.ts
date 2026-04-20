/**
 * adapters/file-baseline-loader.ts — Filesystem-backed adapter for the
 * `BaselineLoader` port.
 *
 * Reads `<appRoot>/in-progress/<slug>_BASELINE.json`. Returns null on
 * missing file, malformed JSON, or any I/O error — baseline is an
 * advisory artifact, never a pipeline blocker.
 */

import fs from "node:fs";
import path from "node:path";

import type { BaselineLoader, BaselineProfile } from "../ports/baseline-loader.js";

export interface FileBaselineLoaderOptions {
  /** Absolute path to the app root (contains `in-progress/`). */
  readonly appRoot: string;
}

export class FileBaselineLoader implements BaselineLoader {
  private readonly appRoot: string;

  constructor(opts: FileBaselineLoaderOptions) {
    this.appRoot = opts.appRoot;
  }

  loadBaseline(slug: string): BaselineProfile | null {
    const p = path.join(this.appRoot, "in-progress", `${slug}_BASELINE.json`);
    let raw: string;
    try {
      raw = fs.readFileSync(p, "utf8");
    } catch {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object") return null;
      // Minimal shape guard — feature field is the only invariant we rely
      // on elsewhere. Everything else is optional; the filter tolerates
      // missing arrays.
      const candidate = parsed as { feature?: unknown };
      if (typeof candidate.feature !== "string" || candidate.feature.length === 0) {
        return null;
      }
      return parsed as BaselineProfile;
    } catch {
      return null;
    }
  }
}
