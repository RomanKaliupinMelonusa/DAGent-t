/**
 * domain/index.ts — Barrel export for pure domain functions.
 *
 * Every module in domain/ is pure: zero I/O, zero side effects.
 * Enforce via ESLint no-restricted-imports (node:fs, node:child_process).
 */

export { computeErrorSignature } from "./error-signature.js";

export {
  getDownstream,
  getUpstream,
  cascadeBarriers,
  topologicalSort,
  type DependencyGraph,
} from "./dag-graph.js";

export {
  schedule,
  type SchedulableItem,
  type ScheduleResult,
} from "./scheduling.js";

export {
  completeItem,
  failItem,
  resetNodes,
  salvageForDraft,
  type TransitionItem,
  type TransitionState,
  type ErrorLogEntry,
  type CompleteResult,
  type FailResult,
  type ResetResult,
  type SalvageResult,
} from "./transitions.js";

export {
  computeDormantKeys,
  type PrunableNode,
} from "./pruning.js";

export {
  checkCycleBudget,
  countErrorSignature,
  type CycleCheck,
} from "./cycle-counter.js";

export {
  resolveFailureTarget,
  resolveFailureRoutes,
  type RoutableNode,
  type RoutableWorkflow,
} from "./failure-routing.js";

export {
  interpretBatch,
  type BatchOutcome,
  type BatchSignals,
} from "./batch-interpreter.js";
