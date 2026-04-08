/**
 * handlers/index.ts — Public API for the handler plugin system.
 */

export type { NodeHandler, NodeContext, NodeResult, SkipResult } from "./types.js";
export { resolveHandler, inferHandler, registerBuiltinHandler, clearHandlerCache } from "./registry.js";
