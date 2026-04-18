/**
 * adapters/jsonl-telemetry.ts — Telemetry adapter over logger.ts.
 *
 * Wraps the existing PipelineLogger behind the Telemetry port interface.
 */

import type { Telemetry, EventContext } from "../ports/telemetry.js";
import type { PipelineLogger } from "../telemetry/index.js";
import type { PreviousSummaryTotals } from "../app-types.js";
import { loadPreviousSummary as loadSummary } from "../reporting/index.js";

export class JsonlTelemetry implements Telemetry {
  private readonly logger: PipelineLogger;

  constructor(logger: PipelineLogger) {
    this.logger = logger;
  }

  event(category: string, itemKey: string | null, context?: EventContext): void {
    this.logger.event(category as Parameters<PipelineLogger["event"]>[0], itemKey, context ?? {});
  }

  warn(message: string): void {
    console.warn(`[pipeline] ${message}`);
  }

  error(message: string, err?: unknown): void {
    console.error(`[pipeline] ${message}`, err ?? "");
  }

  info(message: string): void {
    console.log(`[pipeline] ${message}`);
  }

  loadPreviousSummary(appRoot: string, slug: string): PreviousSummaryTotals | null {
    return loadSummary(appRoot, slug);
  }
}
