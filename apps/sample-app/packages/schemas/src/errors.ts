// =============================================================================
// API Error Response Schema
// =============================================================================
// Standardised error envelope returned by all backend endpoints.
// =============================================================================

import { z } from "zod";

/**
 * Error codes returned by the API.
 */
export const ApiErrorCodeSchema = z.enum([
  "INVALID_INPUT",
  "UNAUTHORIZED",
  "NOT_FOUND",
  "SERVER_ERROR",
]);

export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

/**
 * Standard error response envelope.
 *
 * @example
 * ```json
 * { "error": "UNAUTHORIZED", "message": "Invalid username or password." }
 * ```
 */
export const ApiErrorResponseSchema = z.object({
  error: ApiErrorCodeSchema,
  message: z.string(),
});

export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
