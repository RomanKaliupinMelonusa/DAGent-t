// =============================================================================
// Demo Auth Schemas
// =============================================================================
// POST /auth/login — demo-mode credential validation and token exchange.
// =============================================================================

import { z } from "zod";

/**
 * Request schema for POST /auth/login (demo mode).
 *
 * @example
 * ```json
 * { "username": "demo", "password": "demopass" }
 * ```
 */
export const DemoLoginRequestSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export type DemoLoginRequest = z.infer<typeof DemoLoginRequestSchema>;

/**
 * Successful response schema for POST /auth/login (demo mode).
 *
 * @example
 * ```json
 * { "token": "abc-123", "displayName": "Demo User" }
 * ```
 */
export const DemoLoginResponseSchema = z.object({
  token: z.string(),
  displayName: z.string(),
});

export type DemoLoginResponse = z.infer<typeof DemoLoginResponseSchema>;
