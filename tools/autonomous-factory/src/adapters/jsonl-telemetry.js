/**
 * adapters/jsonl-telemetry.ts — Telemetry adapter over logger.ts.
 *
 * Wraps the existing PipelineLogger behind the Telemetry port interface.
 */
import { loadPreviousSummary as loadSummary } from "../reporting/index.js";
export class JsonlTelemetry {
    logger;
    constructor(logger) {
        this.logger = logger;
    }
    event(category, itemKey, context) {
        this.logger.event(category, itemKey, context ?? {});
    }
    warn(message) {
        console.warn(`[pipeline] ${message}`);
    }
    error(message, err) {
        console.error(`[pipeline] ${message}`, err ?? "");
    }
    info(message) {
        console.log(`[pipeline] ${message}`);
    }
    loadPreviousSummary(appRoot, slug) {
        return loadSummary(appRoot, slug);
    }
}
//# sourceMappingURL=jsonl-telemetry.js.map