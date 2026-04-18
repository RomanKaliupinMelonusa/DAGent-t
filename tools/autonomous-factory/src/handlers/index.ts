/**
 * handlers/index.ts — Public API for the handler plugin system.
 */

export type { NodeHandler, NodeContext, NodeResult, SkipResult, HandlerMetadata, DagCommand } from "./types.js";
export type { AutoSkipDecision } from "./support/auto-skip-evaluator.js";
export type { TriageHandlerOutput } from "./triage.js";
export { resolveHandler, inferHandler, registerBuiltinHandler, clearHandlerCache } from "./registry.js";
export { evaluateAutoSkip } from "./support/auto-skip-evaluator.js";
