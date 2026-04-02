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

### `POST /api/audit`

Records an audit event to Cosmos DB. Server generates `id` (UUID) and `timestamp` (ISO-8601). Auth is enforced at the APIM gateway.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `userId` | string | yes | User identifier (max 256 chars) |
| `action` | string | yes | Action name, e.g. `USER_LOGIN` (max 256 chars) |

**Success (201):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "demo",
  "action": "USER_LOGIN",
  "timestamp": "2026-04-01T12:00:00.000Z"
}
```

**Errors:** 400 (invalid/missing fields, exceeds length limits), 500 (Cosmos DB failure)

### `GET /api/audit`

Returns the latest 50 audit events ordered by timestamp descending. Auth is enforced at the APIM gateway.

**Success (200):**
```json
[
  { "id": "...", "userId": "demo", "action": "USER_LOGIN", "timestamp": "2026-04-01T12:00:00.000Z" }
]
```

**Errors:** 500 (Cosmos DB failure)

## Shared Schemas

All endpoints use Zod schemas from `@branded/schemas` for request validation and response typing. See [`packages/schemas/README.md`](../packages/schemas/README.md).

| Endpoint | Schema |
|----------|--------|
| `GET /hello` response | `HelloResponseSchema` |
| `POST /auth/login` request | `DemoLoginRequestSchema` |
| `POST /auth/login` response | `DemoLoginResponseSchema` |
| `POST /audit` request | `AuditLogCreateSchema` |
| `POST /audit` response | `AuditLogSchema` |
| `GET /audit` response items | `AuditLogSchema` |
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
| `COSMOS_ENDPOINT` | — | Azure Cosmos DB account endpoint for audit log storage |

## Tests

Unit tests live in `src/functions/__tests__/`. Run with `npm test`.

| File | Tests | Coverage |
|------|-------|----------|
| `fn-hello.test.ts` | fn-hello endpoint logic | Response format, input validation, name param |
| `fn-audit.test.ts` | fn-audit endpoint logic | POST valid→201, POST invalid→400, POST Cosmos error→500, GET items→200, GET empty→200, GET error→500, input length limits |
| `smoke.integration.test.ts` | Live endpoint smoke tests | Verifies deployed endpoints return expected schemas |

**Total: 34 unit tests passing** (integration tests run separately against live environment).

## Adding Your Own Functions

Add new Azure Functions in `src/functions/`. Each function registers itself via `app.http()` or `app.storageQueue()` etc. See `fn-demo-login.ts` for the pattern. Define request/response schemas in `@branded/schemas` for type-safe validation.
