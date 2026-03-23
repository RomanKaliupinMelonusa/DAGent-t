// =============================================================================
// Shared Schemas — Single source of truth for backend ↔ frontend contracts
// =============================================================================
// All shared data models are defined as Zod schemas. TypeScript types are
// derived via z.infer<typeof Schema> — never hand-written alongside a schema.
//
// Usage:
//   Backend:  .parse()      at API boundaries (throws on invalid input)
//   Frontend: .safeParse()  for form validation (returns error details)
// =============================================================================

import { z } from "zod";

// ---------------------------------------------------------------------------
// Hello Endpoint — GET /hello
// ---------------------------------------------------------------------------

/** Response from GET /api/hello */
export const HelloResponseSchema = z.object({
  message: z.string(),
  timestamp: z.string().datetime(),
});

export type HelloResponse = z.infer<typeof HelloResponseSchema>;

// ---------------------------------------------------------------------------
// Demo Login — POST /auth/login
// ---------------------------------------------------------------------------

/** Request body for POST /api/auth/login */
export const DemoLoginRequestSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export type DemoLoginRequest = z.infer<typeof DemoLoginRequestSchema>;

/** Successful response from POST /api/auth/login */
export const DemoLoginResponseSchema = z.object({
  token: z.string(),
  displayName: z.string(),
});

export type DemoLoginResponse = z.infer<typeof DemoLoginResponseSchema>;

// ---------------------------------------------------------------------------
// API Error Responses
// ---------------------------------------------------------------------------

/** Standard error response returned by all endpoints */
export const ApiErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
});

export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
