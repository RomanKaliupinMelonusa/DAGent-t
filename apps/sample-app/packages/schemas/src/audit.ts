// =============================================================================
// Audit Log Schemas
// =============================================================================
// POST /audit — record a new audit event.
// GET  /audit — retrieve the latest audit events.
// =============================================================================

import { z } from "zod";

/**
 * Full audit log entry schema (as stored in Cosmos DB and returned by GET /audit).
 *
 * @example
 * ```json
 * {
 *   "id": "550e8400-e29b-41d4-a716-446655440000",
 *   "userId": "demo",
 *   "action": "USER_LOGIN",
 *   "timestamp": "2026-04-01T12:00:00.000Z"
 * }
 * ```
 */
export const AuditLogSchema = z.object({
  id: z.string().uuid({ message: "id must be a valid UUID" }),
  userId: z.string().min(1, "userId is required"),
  action: z.string().min(1, "action is required"),
  timestamp: z.string().datetime({ message: "timestamp must be an ISO-8601 datetime string" }),
});

export type AuditLog = z.infer<typeof AuditLogSchema>;

/**
 * Request schema for POST /audit (client-supplied fields only).
 * The server generates `id` (UUID) and `timestamp` (ISO-8601).
 *
 * @example
 * ```json
 * { "userId": "demo", "action": "USER_LOGIN" }
 * ```
 */
export const AuditLogCreateSchema = AuditLogSchema.omit({
  id: true,
  timestamp: true,
});

export type AuditLogCreate = z.infer<typeof AuditLogCreateSchema>;
