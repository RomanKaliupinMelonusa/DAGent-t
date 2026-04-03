// =============================================================================
// Webhook Dispatcher Schemas
// =============================================================================
// POST /webhooks — register a webhook URL.
// GET  /webhooks — list registered webhooks.
// =============================================================================

import { z } from "zod";

/**
 * Schema for a persisted webhook record.
 *
 * @example
 * ```json
 * {
 *   "id": "550e8400-e29b-41d4-a716-446655440000",
 *   "workspaceId": "ws-1",
 *   "url": "https://example.com/hook",
 *   "createdAt": "2026-04-03T00:00:00.000Z"
 * }
 * ```
 */
export const WebhookSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  url: z.string().url(),
  createdAt: z.string().datetime(),
});

export type Webhook = z.infer<typeof WebhookSchema>;

/**
 * Request schema for POST /webhooks.
 *
 * @example
 * ```json
 * { "url": "https://example.com/hook", "workspaceId": "ws-1" }
 * ```
 */
export const CreateWebhookRequestSchema = z.object({
  url: z.string().url(),
  workspaceId: z.string(),
});

export type CreateWebhookRequest = z.infer<typeof CreateWebhookRequestSchema>;

/**
 * Response schema for GET /webhooks.
 *
 * @example
 * ```json
 * { "webhooks": [{ "id": "...", "workspaceId": "ws-1", "url": "https://example.com/hook", "createdAt": "..." }] }
 * ```
 */
export const WebhookListResponseSchema = z.object({
  webhooks: z.array(WebhookSchema),
});

export type WebhookListResponse = z.infer<typeof WebhookListResponseSchema>;
