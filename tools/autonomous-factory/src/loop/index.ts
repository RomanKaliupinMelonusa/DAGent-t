/**
 * loop/index.ts — Barrel export for the loop layer.
 */

export { runPipelineLoop, type PipelineLoopConfig, type HandlerResolver, type LoopResult } from "./pipeline-loop.js";
export { interpretSignals, type LoopDirective } from "./signal-handler.js";
