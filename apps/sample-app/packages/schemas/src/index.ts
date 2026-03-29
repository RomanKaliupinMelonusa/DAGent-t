// =============================================================================
// @branded/schemas — Barrel Export
// =============================================================================
// Single source of truth for all shared data models between backend & frontend.
// All types are derived from Zod schemas via z.infer<>.
// =============================================================================

// Hello endpoint
export { HelloResponseSchema } from "./hello.js";
export type { HelloResponse } from "./hello.js";

// Demo auth
export {
  DemoLoginRequestSchema,
  DemoLoginResponseSchema,
} from "./auth.js";
export type { DemoLoginRequest, DemoLoginResponse } from "./auth.js";

// Error envelope
export { ApiErrorCodeSchema, ApiErrorResponseSchema } from "./errors.js";
export type { ApiErrorCode, ApiErrorResponse } from "./errors.js";

// User profile
export {
  ThemeSchema,
  UserProfileSchema,
  ProfileUpdateSchema,
} from "./profile.js";
export type { Theme, UserProfile, ProfileUpdate } from "./profile.js";
