/**
 * adapters/file-baseline-loader.ts — Filesystem-backed adapter for the
 * `BaselineLoader` port.
 *
 * Resolution order:
 *   1. Artifact catalog — most recent sealed/completed `baseline` artifact
 *      produced by the `baseline-analyzer` node, located via
 *      `FileArtifactBus.findLatestArtifact()` reading `_invocations.jsonl`.
 *   2. Kickoff fallback — `<appRoot>/.dagent/<slug>/_kickoff/baseline.json`
 *      (deprecated, retained for manual-staging compatibility).
 *
 * Returns null on missing file, malformed JSON, or any I/O error —
 * baseline is an advisory artifact, never a pipeline blocker.
 */

import fs from "node:fs";

import type { BaselineLoader, BaselineProfile } from "../ports/baseline-loader.js";
import type { FileArtifactBus } from "./file-artifact-bus.js";
import { featurePath } from "../paths/feature-paths.js";

export interface FileBaselineLoaderOptions {
  /** Absolute path to the app root (contains `.dagent/`). */
  readonly appRoot: string;
  /** Artifact bus used to resolve the latest `baseline` produced by
   *  `baseline-analyzer`. Required — kickoff is fallback-only. */
  readonly bus: FileArtifactBus;
}

const PRODUCER_NODE_KEY = "baseline-analyzer";

export class FileBaselineLoader implements BaselineLoader {
  private readonly appRoot: string;
  private readonly bus: FileArtifactBus;

  constructor(opts: FileBaselineLoaderOptions) {
    this.appRoot = opts.appRoot;
    this.bus = opts.bus;
  }

  loadBaseline(slug: string): BaselineProfile | null {
    // Primary — artifact catalog (per-invocation outputs).
    const hit = this.bus.findLatestArtifact(slug, PRODUCER_NODE_KEY, "baseline");
    if (hit) {
      const fromCatalog = readAndValidate(hit.absolutePath);
      if (fromCatalog) return fromCatalog;
    }

    // Fallback — manual-staging path under `_kickoff/`. Deprecated but
    // retained so operators can hand-author a baseline when the analyzer
    // node hasn't run yet (e.g. local development, replay scenarios).
    return readAndValidate(featurePath(this.appRoot, slug, "baseline"));
  }
}

function readAndValidate(absolutePath: string): BaselineProfile | null {
  let raw: string;
  try {
    raw = fs.readFileSync(absolutePath, "utf8");
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
