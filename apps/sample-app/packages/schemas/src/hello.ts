// =============================================================================
// Hello Endpoint Schemas
// =============================================================================
// GET /hello — returns a greeting with a timestamp.
// =============================================================================

import { z } from "zod";

/**
 * Response schema for GET /hello.
 *
 * @example
 * ```json
 * { "message": "Hello, World!", "timestamp": "2026-03-24T00:00:00.000Z" }
 * ```
 */
export const HelloResponseSchema = z.object({
  message: z.string(),
  timestamp: z.string().datetime({ message: "timestamp must be an ISO-8601 datetime string" }),
});

export type HelloResponse = z.infer<typeof HelloResponseSchema>;
