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
export {};
//# sourceMappingURL=code-indexer.js.map