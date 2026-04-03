# backend/

Azure Functions backend with shared Zod schema validation and dual-mode auth.

## Quick Start

```bash
cp .env.example .env          # configure environment
npm install
npm test                       # run unit tests (34 passing)
npm start                      # start Functions host on :7071
```

## Endpoints

### `GET /api/hello`

Sample protected endpoint demonstrating the dual-mode auth pattern. Auth is enforced at the APIM gateway — the function itself uses `authLevel: "function"`.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | query string | no | Greeting name (max 100 chars, defaults to "World") |

**Success (200):**
```json
{ "message": "Hello, World!", "timestamp": "2026-03-24T00:00:00.000Z" }
```

**Errors:** 400 (name exceeds 100 chars)

### `POST /api/auth/login`

Demo-mode credential validation. Returns 404 when `AUTH_MODE=entra`.

| Field | Type | Required |
|-------|------|----------|
| `username` | string | yes |
| `password` | string | yes |

**Success (200):**
```json
{ "token": "<demo-token-uuid>", "displayName": "Demo User" }
```

**Errors:** 400 (invalid input), 401 (wrong credentials), 404 (demo mode disabled)

### `POST /api/webhooks`

Registers a new webhook URL in Cosmos DB. Validates input with `CreateWebhookRequestSchema` (Zod). Auth is enforced at the APIM gateway; the function uses `authLevel: "function"`.

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `url` | string (URL) | yes | Valid URL, max 2048 chars |
| `workspaceId` | string | yes | Max 128 chars |

**Success (201):**
```json
{
  "id": "uuid",
  "workspaceId": "ws-default",
  "url": "https://example.com/hook",
  "createdAt": "2026-04-01T00:00:00.000Z"
}
```

**Errors:** 400 (invalid JSON, Zod validation failure, URL/workspaceId too long), 500 (Cosmos DB write failure)

### `GET /api/webhooks`

Lists registered webhooks from Cosmos DB. Optionally filters by `workspaceId`.

| Param | Type | Required | Constraints |
|-------|------|----------|-------------|
| `workspaceId` | query string | no | Max 128 chars |

**Success (200):**
```json
{ "webhooks": [{ "id": "uuid", "workspaceId": "ws-default", "url": "https://...", "createdAt": "..." }] }
```

**Errors:** 400 (workspaceId too long), 500 (Cosmos DB query failure)

## Shared Schemas

All endpoints use Zod schemas from `@branded/schemas` for request validation and response typing. See [`packages/schemas/README.md`](../packages/schemas/README.md).

| Endpoint | Schema |
|----------|--------|
| `GET /hello` response | `HelloResponseSchema` |
| `POST /auth/login` request | `DemoLoginRequestSchema` |
| `POST /auth/login` response | `DemoLoginResponseSchema` |
| `POST /webhooks` request | `CreateWebhookRequestSchema` |
| `POST /webhooks` response | `WebhookSchema` |
| `GET /webhooks` response | `WebhookListResponseSchema` |
| All error responses | `ApiErrorResponseSchema` |

## AUTH_MODE Feature Flag

| Value | Behavior |
|-------|----------|
| `demo` | Demo login active — shared credentials via env vars |
| `entra` | Demo login returns 404 — frontend uses MSAL/Entra ID redirect |

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `AUTH_MODE` | — | `"demo"` or `"entra"` |
| `DEMO_USER` | — | Demo username |
| `DEMO_PASS` | — | Demo password |
| `DEMO_TOKEN` | — | Token returned on successful login |
| `COSMOSDB_ENDPOINT` | — | Azure Cosmos DB account endpoint URL (used by `fn-webhooks.ts`). Provisioned by Terraform; zero-key auth via `DefaultAzureCredential`. |
| `WEBHOOK_TIMEOUT_MS` | `5000` | Webhook dispatch timeout in milliseconds. Injected by `deploy-backend.yml` CI/CD workflow. |

## Data Store

The webhook endpoints use **Azure Cosmos DB** (SQL API, serverless capacity) for persistence:

- **Database:** `sample-app-db`
- **Container:** `Webhooks` (partition key: `/workspaceId`)
- **Auth:** `DefaultAzureCredential` via Function App managed identity — zero API keys
- **Role:** `Cosmos DB Built-in Data Contributor` assigned to the Function App's managed identity

The `CosmosClient` is lazy-initialized as a singleton on first request.

## Tests

Unit and integration tests live in `src/functions/__tests__/`. Run with `npm test`.

| File | Tests | Coverage |
|------|-------|----------|
| `fn-hello.test.ts` | fn-hello endpoint logic | Response format, input validation, name param |
| `fn-webhooks.test.ts` | fn-webhooks endpoint logic | POST 201/400, GET 200, Zod validation, Cosmos DB mocking |
| `smoke.integration.test.ts` | Live endpoint smoke tests | Verifies deployed endpoints return expected schemas |
| `webhooks.integration.test.ts` | Webhook integration tests | GET/POST against live deployment, `WEBHOOK_TIMEOUT_MS` assertion |

**Total: 34 unit tests passing.**

Integration tests require `RUN_INTEGRATION=true` and live Azure infrastructure.

## Adding Your Own Functions

Add new Azure Functions in `src/functions/`. Each function registers itself via `app.http()` or `app.storageQueue()` etc. See `fn-demo-login.ts` for the pattern. Define request/response schemas in `@branded/schemas` for type-safe validation.
