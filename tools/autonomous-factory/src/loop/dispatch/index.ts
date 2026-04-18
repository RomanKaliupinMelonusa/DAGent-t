/**
 * dispatch/index.ts — Barrel export for the dispatch layer.
 */

export { translateResult } from "./result-translator.js";
export { buildNodeContext, type ContextBuilderConfig } from "./context-builder.js";
export { dispatchItem, type ItemDispatchResult } from "./item-dispatch.js";
export { dispatchBatch, type BatchDispatchResult } from "./batch-dispatcher.js";
