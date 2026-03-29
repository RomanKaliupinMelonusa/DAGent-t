# Backend Architecture

Azure Functions (Node.js v4) backend with shared Zod schema validation and dual-mode auth.

## Functions

| Function | Route | Methods | Auth | Description |
|----------|-------|---------|------|-------------|
| `fn-hello` | `/api/hello` | GET | APIM gateway | Greeting endpoint; validates `name` query param (max 100 chars) |
| `fn-demo-login` | `/api/auth/login` | POST | None (public in demo mode) | Demo credential validation; returns 404 when `AUTH_MODE=entra` |
| `fn-profile` | `/api/profile` | GET, PATCH | In-function `X-Demo-Token` validation | User profile CRUD with hardcoded mock data |

## Profile Endpoint Details

`fn-profile.ts` implements in-function auth rather than relying solely on APIM gateway auth. This enables unit-testable 401 responses.

**GET /api/profile** — Returns the authenticated user's mock profile.

**PATCH /api/profile** — Accepts `{ displayName, theme }` validated against `ProfileUpdateSchema`. Returns merged profile on success.

| Status | Condition |
|--------|-----------|
| 200 | Valid request |
| 400 | Invalid JSON body or Zod validation failure |
| 401 | Missing or invalid `X-Demo-Token` header |

Auth uses `crypto.timingSafeEqual` via a `safeEqual()` helper (duplicated from `fn-demo-login.ts` by design — avoids scope creep of extracting a shared util).

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `AUTH_MODE` | — | `"demo"` or `"entra"` |
| `DEMO_USER` | — | Demo username |
| `DEMO_PASS` | — | Demo password |
| `DEMO_TOKEN` | — | Token returned on login; also used by `fn-profile` for auth |

## Test Inventory

| File | Tests | Scope |
|------|-------|-------|
| `fn-hello.test.ts` | Unit | Response format, input validation, name param |
| `fn-demo-login.test.ts` | Unit | Auth flow, credential validation, mode switching |
| `fn-profile.test.ts` | Unit | 401 (no token, wrong token), GET 200, PATCH 200/400 |
| `smoke.integration.test.ts` | Integration | Live endpoint smoke tests (hello + profile) |

**Total: 27 backend tests passing.**
