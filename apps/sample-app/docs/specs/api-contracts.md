# API Contracts — Sample App

All API endpoints are routed through Azure API Management (APIM). The OpenAPI spec at `infra/api-specs/api-sample.openapi.yaml` governs which paths APIM will forward — unlisted paths return 404.

## Endpoints

### GET /api/hello

Greeting endpoint. Auth enforced at APIM gateway.

**Query Parameters:**

| Param | Type | Required | Default | Constraints |
|-------|------|----------|---------|-------------|
| `name` | string | no | `"World"` | Max 100 chars |

**Response (200):**

```json
{
  "message": "Hello, World!",
  "timestamp": "2026-03-24T00:00:00.000Z"
}
```

**Errors:** `400` (name exceeds 100 chars), `401` (unauthorized)

**Schema:** `HelloResponseSchema` (`@branded/schemas`)

---

### POST /api/auth/login

Demo-mode credential validation. Disabled (returns 404) when `AUTH_MODE=entra`.

**Request Body:**

```json
{
  "username": "demo",
  "password": "demopass"
}
```

**Response (200):**

```json
{
  "token": "<uuid>",
  "displayName": "Demo User"
}
```

**Errors:** `400` (invalid input), `401` (wrong credentials), `404` (demo mode disabled)

**Schemas:** `DemoLoginRequestSchema` (request), `DemoLoginResponseSchema` (response)

---

### POST /api/webhooks

Registers a webhook URL in Cosmos DB. Validates with `CreateWebhookRequestSchema` (Zod).

**Request Body:**

```json
{
  "url": "https://example.com/hook",
  "workspaceId": "ws-default"
}
```

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `url` | string (URL) | yes | Valid URL format, max 2048 chars |
| `workspaceId` | string | yes | Max 128 chars |

**Response (201):**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "workspaceId": "ws-default",
  "url": "https://example.com/hook",
  "createdAt": "2026-04-01T12:00:00.000Z"
}
```

**Errors:**
- `400` — Invalid JSON, Zod validation failure, URL exceeds 2048 chars, workspaceId exceeds 128 chars
- `401` — Unauthorized (APIM auth)
- `500` — Cosmos DB write failure

**Schemas:** `CreateWebhookRequestSchema` (request), `WebhookSchema` (response)

---

### GET /api/webhooks

Lists registered webhooks. Optional `workspaceId` filter uses parameterized Cosmos DB query.

**Query Parameters:**

| Param | Type | Required | Constraints |
|-------|------|----------|-------------|
| `workspaceId` | string | no | Max 128 chars |

**Response (200):**

```json
{
  "webhooks": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "workspaceId": "ws-default",
      "url": "https://example.com/hook",
      "createdAt": "2026-04-01T12:00:00.000Z"
    }
  ]
}
```

**Errors:**
- `400` — workspaceId exceeds 128 chars
- `401` — Unauthorized (APIM auth)
- `500` — Cosmos DB query failure

**Schema:** `WebhookListResponseSchema` (response)

---

## Error Response Format

All endpoints return structured errors using `ApiErrorResponseSchema`:

```json
{
  "error": "INVALID_INPUT",
  "message": "Validation failed: url: Invalid url"
}
```

| Error Code | Meaning |
|------------|---------|
| `INVALID_INPUT` | Request validation failed (Zod or application-level) |
| `INTERNAL_ERROR` | Server-side failure (Cosmos DB, etc.) |

## Shared Schemas

All schemas are defined in `packages/schemas/src/` and exported via `@branded/schemas`:

| Schema | Source File | Used By |
|--------|-----------|---------|
| `HelloResponseSchema` | `hello.ts` | `fn-hello.ts`, `page.tsx` |
| `DemoLoginRequestSchema` | `auth.ts` | `fn-demo-login.ts` |
| `DemoLoginResponseSchema` | `auth.ts` | `fn-demo-login.ts`, `demoAuthContext.tsx` |
| `ApiErrorResponseSchema` | `auth.ts` | `apiClient.ts` (all error responses) |
| `WebhookSchema` | `webhooks.ts` | `fn-webhooks.ts`, `webhooks/page.tsx` |
| `CreateWebhookRequestSchema` | `webhooks.ts` | `fn-webhooks.ts` |
| `WebhookListResponseSchema` | `webhooks.ts` | `fn-webhooks.ts`, `webhooks/page.tsx` |

## APIM Gateway

The OpenAPI spec (`infra/api-specs/api-sample.openapi.yaml`) declares these paths:

- `GET /hello` — `operationId: hello`
- `GET /webhooks` — `operationId: listWebhooks`
- `POST /webhooks` — `operationId: createWebhook`

APIM applies auth policy (demo `check-header` or Entra `validate-jwt`) before forwarding to the Function App. Paths not declared in the OpenAPI spec are rejected with 404.
