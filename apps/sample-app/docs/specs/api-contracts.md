# API Contracts

OpenAPI spec: [`infra/api-specs/api-sample.openapi.yaml`](../../infra/api-specs/api-sample.openapi.yaml)

## Endpoints

### `GET /api/hello`

Greeting endpoint. Auth enforced at APIM gateway.

| Param | Location | Required | Description |
|-------|----------|----------|-------------|
| `name` | query | No | Greeting name (max 100 chars, defaults to "World") |

**200:**
```json
{ "message": "Hello, World!", "timestamp": "2026-03-24T00:00:00.000Z" }
```

**400:** Name exceeds 100 characters.

### `POST /api/auth/login`

Demo-mode credential validation. Returns 404 when `AUTH_MODE=entra`.

| Field | Type | Required |
|-------|------|----------|
| `username` | string | Yes |
| `password` | string | Yes |

**200:**
```json
{ "token": "<uuid>", "displayName": "Demo User" }
```

**400:** Invalid input. **401:** Wrong credentials. **404:** Demo mode disabled.

### `GET /api/profile`

Returns the authenticated user's profile. Requires `X-Demo-Token` header.

**200:**
```json
{
  "id": "00000000-0000-0000-0000-000000000001",
  "displayName": "Demo User",
  "email": "demo@example.com",
  "theme": "system"
}
```

**401:** Missing or invalid demo token.

### `PATCH /api/profile`

Updates the authenticated user's display name and theme. Requires `X-Demo-Token` header.

**Request body:**
```json
{ "displayName": "New Name", "theme": "dark" }
```

| Field | Type | Constraints |
|-------|------|-------------|
| `displayName` | string | 2–50 characters |
| `theme` | enum | `"light"`, `"dark"`, `"system"` |

**200:** Updated `UserProfile` object (same shape as GET).

**400:** Invalid JSON body or validation failure (Zod error paths in `message` field).

**401:** Missing or invalid demo token.

## Error Envelope

All error responses use the `ApiErrorResponse` schema:

```json
{ "error": "ERROR_CODE", "message": "Human-readable description." }
```

| Error Code | Status | Context |
|------------|--------|---------|
| `UNAUTHORIZED` | 401 | Missing/invalid auth token |
| `INVALID_INPUT` | 400 | Zod validation failure or unparseable JSON |
| `VALIDATION_ERROR` | 400 | Frontend apiClient schema mismatch |
| `METHOD_NOT_ALLOWED` | 405 | Unsupported HTTP method |

## Shared Zod Schemas

All request/response contracts are defined as Zod schemas in `@branded/schemas` and shared between backend and frontend:

| Schema | Package Path | Used By |
|--------|-------------|---------|
| `HelloResponseSchema` | `schemas/src/hello.ts` | `fn-hello`, home page |
| `DemoLoginRequestSchema` | `schemas/src/auth.ts` | `fn-demo-login` |
| `DemoLoginResponseSchema` | `schemas/src/auth.ts` | `fn-demo-login`, `demoAuthContext` |
| `UserProfileSchema` | `schemas/src/profile.ts` | `fn-profile`, profile page |
| `ProfileUpdateSchema` | `schemas/src/profile.ts` | `fn-profile`, profile page |
| `ThemeSchema` | `schemas/src/profile.ts` | `fn-profile`, profile page |
| `ApiErrorResponseSchema` | `schemas/src/errors.ts` | All endpoints, `apiClient` |
