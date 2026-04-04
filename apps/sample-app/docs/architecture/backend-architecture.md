# Backend Architecture — Sample App

## Overview

The backend is an Azure Functions v4 (Node.js, TypeScript) application exposing HTTP triggers through APIM. All data-plane calls use `DefaultAzureCredential` — zero API keys in code.

## Function Triggers

| Function Name | Method | Route | Handler | Source |
|---------------|--------|-------|---------|--------|
| `fn-hello` | GET | `/api/hello` | `hello` | `fn-hello.ts` |
| `fn-demo-login` | POST | `/api/auth/login` | `demoLogin` | `fn-demo-login.ts` |
| `fn-list-tasks` | GET | `/api/tasks` | `listTasks` | `fn-tasks.ts` |
| `fn-create-task` | POST | `/api/tasks` | `createTask` | `fn-tasks.ts` |
| `fn-update-task-status` | PATCH | `/api/tasks/{id}/status` | `updateTaskStatus` | `fn-tasks.ts` |

All functions use `authLevel: "function"` — APIM handles user authentication via dual-mode policies.

## Cosmos DB Integration

The task functions use a lazy-initialized singleton `CosmosClient` with `DefaultAzureCredential`:

```
getContainer() → CosmosClient (singleton)
  → .database(COSMOSDB_DATABASE_NAME)
  → .container("Tasks")
```

- **Partition key:** `/workspaceId` (currently hardcoded to `"default"`)
- **Auth:** RBAC role assignment (Cosmos DB Built-in Data Contributor) on the Function App managed identity
- **Rate limiting:** `MAX_TASKS_PER_WORKSPACE` (env var, default 500) enforced via COUNT query before each create

## Input Validation

All user input is validated using shared Zod schemas from `@branded/schemas`:

- `CreateTaskSchema` validates POST body (`title: 1–200 chars`)
- `UpdateTaskStatusSchema` validates PATCH body (`status: TODO | IN_PROGRESS | DONE`)
- Invalid input returns 400 with field-level error messages

## Test Coverage

| Suite | File | Tests | Type |
|-------|------|-------|------|
| fn-tasks | `__tests__/fn-tasks.test.ts` | 30 | Unit (mocked Cosmos) |
| fn-hello | `__tests__/fn-hello.test.ts` | 9 | Unit |
| tasks integration | `__tests__/tasks.integration.test.ts` | Skipped locally | Integration (live Azure) |
| smoke integration | `__tests__/smoke.integration.test.ts` | Skipped locally | Integration (live Azure) |

**Total: 39 unit tests passing, 15 integration tests (run against deployed environment).**

## CI/CD App Settings

The `deploy-backend.yml` workflow injects `MAX_TASKS_PER_WORKSPACE=500` via `az functionapp config appsettings set` before deploying the Function App. This ensures the task limit is configured in the Azure environment.
