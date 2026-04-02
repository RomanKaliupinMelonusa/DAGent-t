// =============================================================================
// Health Check Endpoint Schemas
// =============================================================================
// GET /health — returns application health status for CI pipelines,
// load balancers, and monitoring systems.
// =============================================================================

import { z } from "zod";

/**
 * Possible status values for the overall health check and individual checks.
 */
export const HealthStatusSchema = z.enum(["healthy", "degraded", "unhealthy"]);

export type HealthStatus = z.infer<typeof HealthStatusSchema>;

/**
 * An individual dependency health check result.
 *
 * @example
 * ```json
 * {
 *   "name": "database",
 *   "status": "healthy",
 *   "message": "Connection pool active",
 *   "durationMs": 12
 * }
 * ```
 */
export const HealthCheckEntrySchema = z.object({
  /** Identifier for the dependency being checked (e.g. "database", "cache"). */
  name: z.string().min(1, "Check name is required"),
  /** Status of this individual dependency. */
  status: HealthStatusSchema,
  /** Optional human-readable detail about the check result. */
  message: z.string().optional(),
  /** Optional response time in milliseconds for this check. */
  durationMs: z.number().nonnegative().optional(),
});

export type HealthCheckEntry = z.infer<typeof HealthCheckEntrySchema>;

/**
 * Response schema for GET /health.
 *
 * @example
 * ```json
 * {
 *   "status": "healthy",
 *   "timestamp": "2026-04-01T12:00:00.000Z",
 *   "version": "0.1.0",
 *   "checks": [
 *     { "name": "self", "status": "healthy", "durationMs": 1 }
 *   ]
 * }
 * ```
 */
export const HealthCheckResponseSchema = z.object({
  /** Overall application health status. */
  status: HealthStatusSchema,
  /** ISO-8601 timestamp of when the health check was performed. */
  timestamp: z.string().datetime({ message: "timestamp must be an ISO-8601 datetime string" }),
  /** Application version string (e.g. from package.json). */
  version: z.string().optional(),
  /** Individual dependency check results. */
  checks: z.array(HealthCheckEntrySchema).optional(),
});

export type HealthCheckResponse = z.infer<typeof HealthCheckResponseSchema>;
