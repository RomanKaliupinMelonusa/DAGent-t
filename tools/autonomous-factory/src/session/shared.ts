/**
 * session/shared.ts — Barrel re-export for backward compatibility.
 *
 * All functionality has been split into focused submodules:
 *   - dag-utils.ts   — Workflow node resolution, DAG traversal, budget policy
 *   - telemetry.ts   — Item finalization, telemetry merging, report flushing
 *
 * Existing imports like `import { getWorkflowNode, finishItem } from "./session/shared.js"`
 * continue to work unchanged.
 *
 * Types are re-exported from kernel-types.ts (the single source of truth for
 * cross-boundary type definitions).
 */

// Re-export DAG utilities
export {
  getWorkflow,
  getWorkflowNode,
  getHeadSha,
  getTimeout,
  resolveCircuitBreaker,
  resolveNodeBudgetPolicy,
  findUpstreamKeysByCategory,
  getAgentDirectoryPrefixes,
} from "./dag-utils.js";

// Re-export telemetry utilities
export {
  flushReports,
  mergeTelemetry,
  finishItem,
} from "./telemetry.js";

// Re-export cross-boundary types from kernel-types (single source of truth)
export type {
  ResolvedCircuitBreaker,
  NodeBudgetPolicy,
  PipelineRunConfig,
  PipelineRunState,
  SessionOutcome,
  SessionResult,
  TriageActivation,
} from "../kernel-types.js";
