/**
 * telemetry/factory.ts — JSONL logger factory.
 */

import path from "node:path";
import { JsonlPipelineLogger } from "./jsonl-logger.js";

/** Create a JSONL-backed logger for a pipeline run. */
export function createPipelineLogger(appRoot: string, slug: string): JsonlPipelineLogger {
  const dir = path.join(appRoot, "in-progress");
  return new JsonlPipelineLogger(
    path.join(dir, `${slug}_EVENTS.jsonl`),
    path.join(dir, `${slug}_BLOBS.jsonl`),
  );
}
