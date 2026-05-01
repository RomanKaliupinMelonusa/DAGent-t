/**
 * workflow/domain/index.ts — Thin barrel re-exporting the workflow-safe
 * subset of `src/domain/`.
 *
 * The pure-domain modules under `src/domain/` are the single source of
 * truth. Every reducer that emits a log entry already takes a caller-
 * supplied `now: string`, and `error-signature.ts` uses the pure-JS
 * `js-sha256` package — both choices land workflow-safety in the
 * canonical layer. This barrel exists to:
 *
 *   1. Document the boundary — only the named exports below are
 *      reachable from workflow scope. Modules omitted on purpose:
 *        - progress-tracker / snapshot-progress / evaluateHardening:
 *          replaced by Temporal-native primitives (timeouts, signals,
 *          queries, child workflows).
 *        - invocation-id (newInvocationId): uses node:crypto.randomBytes
 *          and is consumed only by activities.
 *
 *   2. Keep the existing in-workflow import path
 *      (`./domain/<name>.js` / `../domain/<name>.js`) stable when
 *      consumers switch to the barrel — see `src/workflow/dag-state.ts`,
 *      `src/workflow/pipeline.workflow.ts`, `src/workflow/triage-cascade.ts`.
 *
 * No overrides — every symbol below is a verbatim re-export from
 * `../../domain/index.js`.
 */

export {
  computeErrorSignature,
  DEFAULT_VOLATILE_PATTERNS,
  compileVolatilePatterns,
  mergeVolatilePatterns,
  type VolatilePattern,
  type ConfiguredVolatilePattern,
  getDownstream,
  getUpstream,
  cascadeBarriers,
  topologicalSort,
  type DependencyGraph,
  schedule,
  isProducerCycleReady,
  type SchedulableItem,
  type ScheduleResult,
  type ScheduleOptions,
  type ConsumesEdge,
  type ProducerCycleSummary,
  type GateDiagnosis,
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
  buildInitialState,
  type CompiledNode,
  type InitInputs,
  type InitialState,
  type SeedItem,
  computeDormantKeys,
  type PrunableNode,
  checkCycleBudget,
  countErrorSignature,
  type CycleCheck,
  resolveFailureTarget,
  resolveFailureRoutes,
  type RoutableNode,
  type RoutableWorkflow,
  interpretBatch,
  type BatchOutcome,
  type BatchSignals,
  isFatalSdkError,
  DEFAULT_FATAL_SDK_PATTERNS,
} from "../../domain/index.js";
