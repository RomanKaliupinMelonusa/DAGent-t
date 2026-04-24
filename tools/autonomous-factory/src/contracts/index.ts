/**
 * contracts/index.ts — Node I/O Contract types.
 *
 * The contract layer is the YAML ⇔ runtime bridge: every node's
 * `consumes_*` / `produces_artifacts` declarations compile into a
 * `NodeIOContract` that the output validator and the task-prompt's
 * Declared I/O block consume.
 *
 * Pure types — zero I/O, zero runtime dependencies beyond
 * `apm/artifact-catalog`.
 */

export * from "./node-io-contract.js";
