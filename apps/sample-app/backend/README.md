# backend/

Azure Functions backend with shared Zod schema validation and dual-mode auth.

## Quick Start

```bash
cp .env.example .env          # configure environment
npm install
npm test                       # run unit tests (39 passing)
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

### `GET /api/tasks`

List all tasks for the default workspace, ordered by `createdAt` descending. Data is stored in the Cosmos DB `Tasks` container (partition key: `/workspaceId`).

**Success (200):**
```json
[
  {
    "id": "a1b2c3d4-...",
    "workspaceId": "default",
    "title": "Implement drag-and-drop",
    "status": "TODO",
    "createdAt": "2026-04-05T00:00:00.000Z",
    "updatedAt": "2026-04-05T00:00:00.000Z"
  }
]
```

### `POST /api/tasks`

Create a new task. Body validated with `CreateTaskSchema`. Enforces a per-workspace limit of `MAX_TASKS_PER_WORKSPACE` (default 500) — returns 429 when exceeded.

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `title` | string | yes | 1–200 characters |

**Success (201):** Returns the created `Task` with `id`, `workspaceId: "default"`, `status: "TODO"`, and timestamps.

**Errors:** 400 (invalid input), 429 (workspace task limit exceeded), 500 (server error)

### `PATCH /api/tasks/{id}/status`

Update a task's status (Kanban column transition). Body validated with `UpdateTaskStatusSchema`.

| Field | Type | Required | Values |
|-------|------|----------|--------|
| `status` | string | yes | `"TODO"`, `"IN_PROGRESS"`, `"DONE"` |

**Success (200):** Returns the updated `Task`.

**Errors:** 400 (invalid input), 404 (task not found), 500 (server error)

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
| `GET /tasks` response | `z.array(TaskSchema)` |
| `POST /tasks` request | `CreateTaskSchema` |
| `POST /tasks` response | `TaskSchema` |
| `PATCH /tasks/{id}/status` request | `UpdateTaskStatusSchema` |
| `PATCH /tasks/{id}/status` response | `TaskSchema` |
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
| `COSMOSDB_ENDPOINT` | — | Cosmos DB account endpoint (set by Terraform) |
| `COSMOSDB_DATABASE_NAME` | — | Cosmos DB database name (set by Terraform) |
| `MAX_TASKS_PER_WORKSPACE` | `500` | Max tasks allowed per workspace (429 if exceeded) |

## Tests

Unit tests live in `src/functions/__tests__/`. Run with `npm test`.

| File | Tests | Coverage |
|------|-------|----------|
| `fn-hello.test.ts` | 9 | Response format, input validation, name param |
| `fn-demo-login.test.ts` | 11 | Auth mode gating, credential validation, error handling |
| `fn-tasks.test.ts` | 19 | CRUD logic, Zod validation, 429 limit, 404 handling, status transitions |
| `smoke.integration.test.ts` | — | Live endpoint smoke tests (skipped locally) |
| `tasks.integration.test.ts` | — | Live CRUD + `MAX_TASKS_PER_WORKSPACE` az CLI check (skipped locally) |

**Total: 39 unit tests passing** (integration tests run in CI only).

## Adding Your Own Functions

Add new Azure Functions in `src/functions/`. Each function registers itself via `app.http()` or `app.storageQueue()` etc. See `fn-demo-login.ts` for the pattern. Define request/response schemas in `@branded/schemas` for type-safe validation.
