/**
 * telemetry/factory.ts — JSONL logger factory.
 */
import { JsonlPipelineLogger } from "./jsonl-logger.js";
import { featurePath } from "../adapters/feature-paths.js";
/** Create a JSONL-backed logger for a pipeline run. */
export function createPipelineLogger(appRoot, slug) {
    return new JsonlPipelineLogger(featurePath(appRoot, slug, "events"), featurePath(appRoot, slug, "blobs"));
}
//# sourceMappingURL=factory.js.map