/**
 * domain/index.ts — Barrel export for pure domain functions.
 *
 * Every module in domain/ is pure: zero I/O, zero side effects.
 * Enforce via ESLint no-restricted-imports (node:fs, node:child_process).
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
  type SchedulableItem,
  type ScheduleResult,
} from "./scheduling.js";

export {
  completeItem,
  failItem,
  resetNodes,
  resetScripts,
  resumeAfterElevated,
  salvageForDraft,
  findInfraPollKey,
  findInfraDevKey,
  type TransitionItem,
  type TransitionState,
  type ErrorLogEntry,
  type CompleteResult,
  type FailResult,
  type ResetResult,
  type ResetScriptsResult,
  type ResumeElevatedResult,
  type SalvageResult,
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

export {
  resolveApprovalSla,
  checkApprovalExpired,
  type ApprovalNodeLike,
  type ApprovalPolicyLike,
  type ResolvedApprovalSla,
  type ApprovalSlaStatus,
} from "./approval-sla.js";

export {
  snapshotProgress,
  evaluateHardening,
  type ProgressTrackable,
  type ProgressSnapshot,
  type HardeningPolicy,
  type HardeningState,
  type HardeningVerdict,
} from "./progress-tracker.js";

export {
  detectStalledItems,
  formatStallError,
  type StallableItem,
  type StalledItem,
} from "./stall-detection.js";
