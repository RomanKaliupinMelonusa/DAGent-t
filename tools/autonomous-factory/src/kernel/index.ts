/**
 * kernel/index.ts — Barrel export for the pipeline kernel.
 */

export { PipelineKernel, type ProcessResult } from "./pipeline-kernel.js";
export { DefaultKernelRules, type KernelRules } from "./rules.js";
export { executeEffects, type EffectPorts } from "./effect-executor.js";
export { createRunState, type RunState, type CommandResult } from "./types.js";
export type { Command } from "./commands.js";
export { wrapDagCommands } from "./commands.js";
export type { Effect } from "./effects.js";
