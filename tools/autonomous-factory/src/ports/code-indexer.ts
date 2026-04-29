/**
 * ports/code-indexer.ts — Stack-agnostic abstraction over a codebase
 * semantic-graph indexer.
 *
 * Implementations may wrap any tool capable of producing a structural
 * index of the workspace (e.g. roam-code, scip-typescript, ts-morph,
 * ctags). The pipeline kernel and harness reason about freshness via
 * this port and never name a specific indexer.
 *
 * Pure interface — zero executable code.
 */

/** Outcome of a single index refresh. */
export interface IndexResult {
  /** Wall-clock duration of the refresh, in milliseconds. */
  readonly durationMs: number;
  /** True when the indexer detected no changes and short-circuited. */
  readonly upToDate: boolean;
}

/**
 * Stack-agnostic indexer port. All methods are safe to call from the
 * kernel's effect executor and the harness's pre-tool-call gate.
 *
 * Implementations MUST coalesce concurrent `index()` calls: if a refresh
 * is already in flight, late callers receive the same promise rather
 * than queueing a fresh one. This keeps the SQLite/file-backed index
 * single-writer without head-of-line blocking on parallel callers.
 */
export interface CodeIndexer {
  /** Whether the underlying indexer binary/library is installed. */
  isAvailable(): boolean;
  /**
   * Refresh the index. Resolves with timing metadata. Implementations
   * MUST NOT throw on indexer failure — they should resolve with a
   * sentinel `{ durationMs, upToDate: false }` and surface the error
   * via the caller's logger.
   */
  index(): Promise<IndexResult>;
}
