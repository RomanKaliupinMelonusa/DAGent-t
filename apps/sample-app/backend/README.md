# backend/

Azure Functions v4 backend with dual-mode auth, shared Zod schemas, and esbuild CJS bundling.

## Quick Start

```bash
cp .env.example .env          # configure environment
npm install
npm test                       # run unit tests (39 tests)
npm start                      # start Functions host on :7071
```

## Endpoints

### `GET /api/hello` — Protected Greeting

Returns a greeting message. Protected by APIM auth policy (demo `check-header` or Entra `validate-jwt`). The function itself uses `authLevel: "function"` — APIM handles user-level auth at the gateway.

| Parameter | In | Required | Default |
|-----------|----|----------|---------|
| `name` | query | no | `"World"` |

**Success (200):**
```json
{ "message": "Hello, World!", "timestamp": "2026-03-23T12:00:00.000Z" }
```

### `POST /api/auth/login` — Demo Authentication

Validates shared demo credentials, returns a demo token. Only active when `AUTH_MODE=demo`; returns 404 otherwise. Uses `crypto.timingSafeEqual` for constant-time credential comparison.

| Field | Type | Required |
|-------|------|----------|
| `username` | string | yes (min 1 char) |
| `password` | string | yes (min 1 char) |

**Success (200):**
```json
{ "token": "<demo-token-uuid>", "displayName": "Demo User" }
```

**Errors:** 400 (invalid input), 401 (wrong credentials), 404 (demo mode disabled)

## Shared Schemas

All API contracts are defined as Zod schemas in `src/schemas/index.ts`:

| Schema | Type | Purpose |
|--------|------|---------|
| `HelloResponseSchema` | response | GET /hello response (`message` + ISO `timestamp`) |
| `DemoLoginRequestSchema` | request | POST /auth/login body (`username` + `password`) |
| `DemoLoginResponseSchema` | response | POST /auth/login success (`token` + `displayName`) |
| `ApiErrorResponseSchema` | response | Standard error body (`error` + `message`) |

Backend uses `.parse()` at API boundaries; frontend can use `.safeParse()` for form validation.

## Build System

The backend uses **esbuild** to bundle each function entry point with all npm dependencies into self-contained CJS modules. This eliminates the need for `node_modules` in the deploy artifact.

- **Format:** CJS (not ESM) — `@azure/functions` contains webpack-bundled CJS code that generates broken `__require()` shims under ESM
- **External:** `@azure/functions-core` (provided by the Azure Functions host runtime)
- **Output:** `dist/src/functions/fn-*.js` + `dist/package.json` (`type: "commonjs"`)

```bash
npm run build     # bundle via esbuild.config.mjs
npm run clean     # remove dist/
npm run lint      # tsc --noEmit type-check
```

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

## Testing

| Command | Description |
|---------|-------------|
| `npm test` | Run all 39 unit tests |
| `npm run test:watch` | Watch mode |
| `npm run test:coverage` | Coverage report |
| `npm run validate:schemas` | Schema tests only |
| `npm run test:integration` | Integration tests (requires `RUN_INTEGRATION=true` + live backend) |

Test files:
- `src/functions/__tests__/fn-hello.test.ts` — fn-hello handler tests
- `src/functions/__tests__/smoke.integration.test.ts` — live endpoint smoke tests
- `src/schemas/__tests__/schemas.test.ts` — Zod schema validation (21 tests)

## Adding Your Own Functions

Add new Azure Functions in `src/functions/`. Each function registers itself via `app.http()` or `app.storageQueue()` etc. See `fn-hello.ts` or `fn-demo-login.ts` for the pattern. Define request/response schemas in `src/schemas/index.ts` to maintain type-safe contracts.
