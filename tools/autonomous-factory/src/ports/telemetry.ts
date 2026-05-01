/**
 * ports/telemetry.ts — Port interface for pipeline event logging / telemetry.
 *
 * Wraps the PipelineLogger contract behind a port interface.
 * The production adapter is the existing PipelineLogger from logger.ts.
 */

/**
 * Structured event context — mirrors PipelineLogger.event() payload.
 * Keys are open-ended to support handler-specific telemetry.
 */
export type EventContext = Record<string, unknown>;

export interface Telemetry {
  /** Emit a structured pipeline event (category.action). */
  event(category: string, itemKey: string | null, context?: EventContext): void;

  /** Log a warning. */
  warn(message: string): void;

  /** Log an error. */
  error(message: string, err?: unknown): void;

  /** Log informational output. */
  info(message: string): void;
}
