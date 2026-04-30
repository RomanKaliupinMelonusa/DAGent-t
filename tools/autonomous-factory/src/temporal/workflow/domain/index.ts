/**
 * temporal/workflow/domain/index.ts — Barrel export for workflow-scoped
 * pure domain functions.
 *
 * Twin of `src/domain/index.ts`. Functions in this barrel are determinism-
 * safe for use inside Temporal workflow code: no I/O, no Date, no crypto,
 * no random, no env reads. Time and signature dependencies are injected
 * by the caller (see ./transitions.ts module docstring).
 *
 * Modules omitted on purpose:
 *   - error-signature: kept; uses pure-JS sha256.
 *   - transitions: kept; reducers require `now: string`.
 *   - approval-sla, progress-tracker, stall-detection, dangling-invocations:
 *     replaced by Temporal-native primitives (timeouts, signals, queries).
 *     Land in Session 4.
 */

export { computeErrorSignature } from "./error-signature.js";

export {
  DEFAULT_VOLATILE_PATTERNS,
  compileVolatilePatterns,
  mergeVolatilePatterns,
  type VolatilePattern,
  type ConfiguredVolatilePattern,
} from "./volatile-patterns.js";

export {
  getDownstream,
  getUpstream,
  cascadeBarriers,
  topologicalSort,
  type DependencyGraph,
} from "./dag-graph.js";

export {
  schedule,
  isProducerCycleReady,
  type SchedulableItem,
  type ScheduleResult,
  type ScheduleOptions,
  type ConsumesEdge,
  type ProducerCycleSummary,
  type GateDiagnosis,
} from "./scheduling.js";

export {
  completeItem,
  failItem,
  resetNodes,
  resetScripts,
  resumeAfterElevated,
  salvageForDraft,
  bypassNode,
  findInfraPollKey,
  findInfraDevKey,
  type TransitionItem,
  type TransitionState,
  type ErrorLogEntry,
  type CompleteResult,
  type FailResult,
  type FailItemOptions,
  type ResetResult,
  type ResetScriptsResult,
  type ResumeElevatedResult,
  type SalvageResult,
  type BypassResult,
} from "./transitions.js";

export {
  buildInitialState,
  type CompiledNode,
  type InitInputs,
  type InitialState,
  type SeedItem,
} from "./init-state.js";

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

export {
  isFatalSdkError,
  DEFAULT_FATAL_SDK_PATTERNS,
} from "./error-classification.js";
