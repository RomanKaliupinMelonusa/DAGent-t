# backend/

Azure Functions backend with shared Zod schema validation and dual-mode auth.

## Quick Start

```bash
cp .env.example .env          # configure environment
npm install
npm test                       # run unit tests (27 passing)
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

### `GET /api/profile` · `PATCH /api/profile`

Authenticated user profile endpoint with in-function `X-Demo-Token` validation.

- **GET:** Returns hardcoded mock profile (`UserProfile` shape).
- **PATCH:** Accepts `{ displayName, theme }` validated with `ProfileUpdateSchema`. Returns merged profile.

**Success (200):**
```json
{ "id": "00000000-...", "displayName": "Demo User", "email": "demo@example.com", "theme": "system" }
```

**Errors:** 400 (invalid input / Zod validation failure), 401 (missing or invalid demo token)

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

## Shared Schemas

Both endpoints use Zod schemas from `@branded/schemas` for request validation and response typing. See [`packages/schemas/README.md`](../packages/schemas/README.md).

| Endpoint | Schema |
|----------|--------|
| `GET /hello` response | `HelloResponseSchema` |
| `POST /auth/login` request | `DemoLoginRequestSchema` |
| `POST /auth/login` response | `DemoLoginResponseSchema` |
| `GET /profile` response | `UserProfileSchema` |
| `PATCH /profile` request | `ProfileUpdateSchema` |
| `PATCH /profile` response | `UserProfileSchema` |
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

## Tests

Unit tests live in `src/functions/__tests__/`. Run with `npm test`.

| File | Tests | Coverage |
|------|-------|----------|
| `fn-hello.test.ts` | fn-hello endpoint logic | Response format, input validation, name param |
| `fn-demo-login.test.ts` | fn-demo-login auth logic | Credential validation, mode switching |
| `fn-profile.test.ts` | fn-profile CRUD logic | 401 auth, GET 200, PATCH 200/400 |
| `smoke.integration.test.ts` | Live endpoint smoke tests | Verifies deployed endpoints (hello + profile) |

**Total: 27 backend tests passing.**

## Adding Your Own Functions

Add new Azure Functions in `src/functions/`. Each function registers itself via `app.http()` or `app.storageQueue()` etc. See `fn-demo-login.ts` for the pattern. Define request/response schemas in `@branded/schemas` for type-safe validation.
