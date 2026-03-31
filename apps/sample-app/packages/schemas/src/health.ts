// =============================================================================
// Health Endpoint Schemas
// =============================================================================
// GET /health — returns system status and a timestamp.
// This endpoint is anonymous (no auth required) and serves as a public probe.
// =============================================================================

import { z } from "zod";

/**
 * Response schema for GET /health.
 *
 * @example
 * ```json
 * { "status": "ok", "timestamp": "2026-03-31T00:00:00.000Z" }
 * ```
 */
export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  timestamp: z.string().datetime({ message: "timestamp must be an ISO-8601 datetime string" }),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
