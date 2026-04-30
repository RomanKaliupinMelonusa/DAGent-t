/**
 * src/temporal/telemetry/logger-factory.ts — Activity logger DI slot.
 *
 * Module-scoped factory that `buildNodeContext` consults when the
 * caller hasn't supplied a `PipelineLogger` directly. Mirrors the
 * `setTriageDependencies` / `setCopilotAgentDependencies` pattern —
 * the worker bootstrap installs a factory once at boot, every
 * subsequent activity invocation gets a fresh `PipelineLogger`
 * instance (per-execution, so the per-itemKey attempt counter inside
 * the logger doesn't leak across activities).
 *
 * Default: returns `null`, which `buildNodeContext` interprets as
 * "fall back to NoopPipelineLogger". This preserves the legacy
 * behaviour for tests and CI activity-smoke runs that intentionally
 * leave OTel disabled.
 */

import type { PipelineLogger } from "../../telemetry/events.js";

export type ActivityLoggerFactory = () => PipelineLogger;

let factory: ActivityLoggerFactory | null = null;

/**
 * Install the activity logger factory. Idempotent — called once at
 * worker boot. Tests use `clearActivityLoggerFactory` between cases.
 */
export function setActivityLoggerFactory(fn: ActivityLoggerFactory): void {
  factory = fn;
}

/** Return the currently-installed factory, or null if none. */
export function getActivityLoggerFactory(): ActivityLoggerFactory | null {
  return factory;
}

/** Test-only: reset DI slot to "no factory installed". */
export function clearActivityLoggerFactory(): void {
  factory = null;
}
