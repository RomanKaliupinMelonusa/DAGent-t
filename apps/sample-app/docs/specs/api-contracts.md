# API Contracts — Sample App

All endpoints are protected by APIM dual-mode auth policies. Request/response bodies are validated at runtime using shared Zod schemas from `@branded/schemas`.

OpenAPI specification: [`infra/api-specs/api-sample.openapi.yaml`](../../infra/api-specs/api-sample.openapi.yaml)

---

## GET /api/hello

Returns a greeting message.

**Query Parameters:**

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `name` | string | No | `"World"` | Name to include in greeting |

**Response 200:**
```json
{
  "message": "Hello, World!",
  "timestamp": "2026-04-04T00:00:00.000Z"
}
```

---

## POST /api/auth/login

Demo-mode authentication endpoint. Returns 404 when `AUTH_MODE=entra`.

**Request Body:**
```json
{
  "username": "demo",
  "password": "demopass"
}
```

**Response 200:**
```json
{
  "token": "<uuid>"
}
```

---

## GET /api/tasks

List all tasks for the default workspace, ordered by `createdAt` descending.

**Response 200:**
```json
[
  {
    "id": "uuid",
    "workspaceId": "default",
    "title": "My Task",
    "status": "TODO",
    "createdAt": "2026-04-04T00:00:00.000Z",
    "updatedAt": "2026-04-04T00:00:00.000Z"
  }
]
```

---

## POST /api/tasks

Create a new task in the default workspace. Returns `429` if the workspace has reached `MAX_TASKS_PER_WORKSPACE` (default: 500).

**Request Body (`CreateTask`):**
```json
{
  "title": "My New Task"
}
```

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `title` | string | 1–200 characters | Task title |

**Response 201 — Task created:**
```json
{
  "id": "uuid",
  "workspaceId": "default",
  "title": "My New Task",
  "status": "TODO",
  "createdAt": "2026-04-04T00:00:00.000Z",
  "updatedAt": "2026-04-04T00:00:00.000Z"
}
```

**Response 400 — Validation failed:**
```json
{
  "error": "INVALID_INPUT",
  "message": "title: String must contain at least 1 character(s)"
}
```

**Response 429 — Workspace limit exceeded:**
```json
{
  "error": "LIMIT_EXCEEDED",
  "message": "Workspace task limit of 500 reached."
}
```

---

## PATCH /api/tasks/{id}/status

Update the status of an existing task. Used to move tasks between Kanban columns.

**Path Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `id` | string (UUID) | Task identifier |

**Request Body (`UpdateTaskStatus`):**
```json
{
  "status": "IN_PROGRESS"
}
```

| Field | Type | Values | Description |
|-------|------|--------|-------------|
| `status` | string | `"TODO"`, `"IN_PROGRESS"`, `"DONE"` | Target status |

**Response 200 — Status updated:**
```json
{
  "id": "uuid",
  "workspaceId": "default",
  "title": "My Task",
  "status": "IN_PROGRESS",
  "createdAt": "2026-04-04T00:00:00.000Z",
  "updatedAt": "2026-04-04T01:00:00.000Z"
}
```

**Response 404 — Task not found:**
```json
{
  "error": "NOT_FOUND",
  "message": "Task <id> not found."
}
```

---

## Shared Schemas

All request/response schemas are defined in `packages/schemas/src/tasks.ts` using Zod v3 and shared between frontend and backend:

| Schema | Purpose |
|--------|---------|
| `TaskStatusSchema` | `z.enum(["TODO", "IN_PROGRESS", "DONE"])` |
| `TaskSchema` | Full task entity with all fields |
| `CreateTaskSchema` | `{ title: z.string().min(1).max(200) }` |
| `UpdateTaskStatusSchema` | `{ status: TaskStatusSchema }` |

## Error Response Format

All error responses follow a consistent structure:

```json
{
  "error": "ERROR_CODE",
  "message": "Human-readable description"
}
```

| Error Code | HTTP Status | Description |
|-----------|-------------|-------------|
| `INVALID_INPUT` | 400 | Request body failed Zod validation |
| `NOT_FOUND` | 404 | Resource does not exist |
| `LIMIT_EXCEEDED` | 429 | Workspace task limit reached |
| `INTERNAL_ERROR` | 500 | Unexpected server error |
