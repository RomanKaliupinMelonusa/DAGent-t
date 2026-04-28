/**
 * adapters/roam-code-indexer.ts — `CodeIndexer` adapter backed by the
 * `roam` CLI (https://github.com/cranot/roam-code).
 *
 * **Sole site of `roam`-CLI knowledge in the engine.** Swap this file
 * for a different adapter (scip-typescript, ts-morph, ctags) without
 * touching the kernel, harness, or any handler.
 *
 * Concurrency: refreshes are coalesced — if a refresh is already in
 * flight, late callers receive the same promise. The roam-code SQLite
 * index is single-writer; this prevents corruption while keeping the
 * happy-path latency at one refresh per write window.
 */

import { execSync } from "node:child_process";
import type { CodeIndexer, IndexResult } from "../ports/code-indexer.js";

/** Maximum wall time for a single `roam index` call. The cold path on
 *  a ~700-file repo measures ~4s; we allow generous headroom to absorb
 *  IO contention without ever wedging the pipeline loop. */
const ROAM_INDEX_TIMEOUT_MS = 120_000;

/** `roam --version` probe timeout — used only to decide availability. */
const ROAM_VERSION_TIMEOUT_MS = 5_000;

export class RoamCodeIndexer implements CodeIndexer {
  private readonly repoRoot: string;
  private inFlight: Promise<IndexResult> | null = null;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
  }

  isAvailable(): boolean {
    try {
      execSync("roam --version", {
        cwd: this.repoRoot,
        timeout: ROAM_VERSION_TIMEOUT_MS,
        stdio: "pipe",
      });
      return true;
    } catch {
      return false;
    }
  }

  index(): Promise<IndexResult> {
    if (this.inFlight) return this.inFlight;
    const promise = this.runIndex();
    this.inFlight = promise;
    promise.finally(() => {
      // Only clear when this exact promise is still the in-flight one;
      // a `finally` racing with a fresh `index()` call could otherwise
      // null out a newer registration.
      if (this.inFlight === promise) this.inFlight = null;
    });
    return promise;
  }

  private async runIndex(): Promise<IndexResult> {
    const start = Date.now();
    try {
      const out = execSync("roam index", {
        cwd: this.repoRoot,
        timeout: ROAM_INDEX_TIMEOUT_MS,
        stdio: "pipe",
        encoding: "utf8",
      });
      const durationMs = Date.now() - start;
      // roam prints "Index is up to date." on the no-op fast path.
      const upToDate = /Index is up to date\./.test(out);
      return { durationMs, upToDate };
    } catch {
      // Indexer failures are non-fatal — caller logs, pipeline continues.
      return { durationMs: Date.now() - start, upToDate: false };
    }
  }
}
