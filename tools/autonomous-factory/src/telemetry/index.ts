/**
 * telemetry/index.ts — Public surface of the telemetry subsystem.
 *
 * Re-exports the event schema, PipelineLogger interface, and the JSONL
 * + noop implementations. OTel / multiplex / secret-redactor were
 * removed in the Phase 4.4 refactor — JSONL + console only.
 */

export type {
  EventKind,
  EventFilter,
  PipelineEvent,
  PipelineBlob,
  PipelineLogger,
  NodeTrace,
  NodeTraceAttempt,
  RunEndReason,
} from "./events.js";

export { JsonlPipelineLogger } from "./jsonl-logger.js";
export { NoopPipelineLogger } from "./noop-logger.js";

import { JsonlPipelineLogger } from "./jsonl-logger.js";
import { featurePath } from "../paths/feature-paths.js";

/** Create a JSONL-backed logger for a pipeline run. */
export function createPipelineLogger(appRoot: string, slug: string): JsonlPipelineLogger {
  return new JsonlPipelineLogger(
    featurePath(appRoot, slug, "events"),
    featurePath(appRoot, slug, "blobs"),
  );
}
