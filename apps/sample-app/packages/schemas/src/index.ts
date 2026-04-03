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

// Webhook dispatcher
export {
  WebhookSchema,
  CreateWebhookRequestSchema,
  WebhookListResponseSchema,
} from "./webhooks.js";
export type {
  Webhook,
  CreateWebhookRequest,
  WebhookListResponse,
} from "./webhooks.js";

// Error envelope
export { ApiErrorCodeSchema, ApiErrorResponseSchema } from "./errors.js";
export type { ApiErrorCode, ApiErrorResponse } from "./errors.js";
