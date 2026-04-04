# Architecture Report: kanban-task-board

## Executive Summary

The Kanban Task Board is a full-stack feature that adds workspace-scoped task management with three-column workflow visualization (To Do → In Progress → Done). It introduces a shared Zod schema layer, three Azure Functions HTTP triggers backed by Cosmos DB (serverless), a React client-side page with optimistic UI updates, and APIM gateway routing — all wired together through the existing dual-mode auth system and CI/CD pipeline. The key architectural decisions are zero-API-key Cosmos DB auth via `DefaultAzureCredential`, a `workspaceId` partition key pre-positioned for multi-tenancy, and configurable per-workspace task limits enforced server-side.

## System Context Diagram (C4 Level 1)

```mermaid
C4Context
    title System Context — Kanban Task Board

    Person(user, "App User", "Interacts with the Kanban board via browser")

    System_Boundary(platform, "Sample App Platform") {
        System(frontend, "Next.js Frontend", "Renders Kanban columns, handles optimistic UI")
        System(apim, "Azure APIM Gateway", "Routes /tasks endpoints, enforces dual-mode auth")
        System(backend, "Azure Functions Backend", "fn-tasks: GET, POST, PATCH triggers")
        SystemDb(cosmos, "Azure Cosmos DB", "Serverless, Tasks container, /workspaceId partition")
    }

    System_Ext(entra, "Microsoft Entra ID", "JWT token issuer (entra mode)")

    Rel(user, frontend, "HTTPS")
    Rel(frontend, apim, "REST API calls")
    Rel(apim, backend, "Proxied HTTP triggers")
    Rel(backend, cosmos, "CRUD via DefaultAzureCredential")
    Rel(user, entra, "OAuth2 redirect (entra mode)")
    Rel(apim, entra, "JWT validation (entra mode)")
```

## Sequence Diagram

```mermaid
sequenceDiagram
    participant U as User
    participant FE as Next.js Frontend
    participant GW as APIM Gateway
    participant FN as fn-tasks (Azure Function)
    participant DB as Cosmos DB (Tasks)

    Note over U,DB: Happy Path: Create Task → Move to In Progress

    U->>FE: Type title, click "Create"
    FE->>GW: POST /tasks {title}
    GW->>GW: Validate auth (demo token / JWT)
    GW->>FN: Forward request
    FN->>FN: Zod validate (CreateTaskSchema)
    FN->>DB: Query task count (workspaceId=default)
    DB-->>FN: count < MAX_TASKS_PER_WORKSPACE
    FN->>DB: Create item (id, title, status=TODO)
    DB-->>FN: 201 Created
    FN-->>GW: 201 {Task}
    GW-->>FE: 201 {Task}
    FE->>FE: Append to local state
    FE-->>U: Task appears in "To Do" column

    U->>FE: Click "Start" on task card
    FE->>FE: Optimistic update (TODO → IN_PROGRESS)
    FE-->>U: Task moves to "In Progress" instantly
    FE->>GW: PATCH /tasks/{id}/status {status: IN_PROGRESS}
    GW->>FN: Forward request
    FN->>FN: Zod validate (UpdateTaskStatusSchema)
    FN->>DB: Read item(id, "default")
    DB-->>FN: Existing task
    FN->>DB: Replace item (status=IN_PROGRESS, updatedAt)
    DB-->>FN: 200 OK
    FN-->>GW: 200 {Task}
    GW-->>FE: 200 {Task}
    FE->>FE: Replace with server response
```

## Entity-Relationship Diagram

```mermaid
erDiagram
    WORKSPACE ||--o{ TASK : contains
    TASK {
        string id PK "UUID v4"
        string workspaceId FK "Partition key — currently 'default'"
        string title "1-200 chars, Zod validated"
        string status "TODO | IN_PROGRESS | DONE"
        string createdAt "ISO 8601 timestamp"
        string updatedAt "ISO 8601 timestamp"
    }
    WORKSPACE {
        string id PK "Currently only 'default'"
    }
```

## Component Inventory

### New Files

| File | Module | Purpose |
|------|--------|---------|
| `packages/schemas/src/tasks.ts` | Shared Schemas | Zod schemas (TaskStatusSchema, TaskSchema, CreateTaskSchema, UpdateTaskStatusSchema) and inferred TypeScript types |
| `backend/src/functions/fn-tasks.ts` | Backend API | 3 HTTP triggers: listTasks (GET), createTask (POST), updateTaskStatus (PATCH) with Cosmos DB CRUD |
| `backend/src/functions/__tests__/fn-tasks.test.ts` | Backend Tests | Unit tests for input validation, 404 handling, 429 limit enforcement |
| `backend/src/functions/__tests__/tasks.integration.test.ts` | Backend Tests | Integration tests: CRUD flow + MAX_TASKS_PER_WORKSPACE az CLI validation |
| `frontend/src/app/tasks/page.tsx` | Frontend UI | Kanban board: TaskCard, KanbanColumn, TasksPage components with optimistic UI |
| `frontend/src/app/tasks/__tests__/page.test.tsx` | Frontend Tests | 32 unit tests for columns, create, move, optimistic rollback, error handling |
| `e2e/tasks.spec.ts` | E2E Tests | Playwright: create → move → reload → persistence verification |

### Modified Files

| File | Module | Change |
|------|--------|--------|
| `packages/schemas/src/index.ts` | Shared Schemas | Added barrel exports for task schemas and types |
| `infra/cosmos.tf` | Infrastructure | Appended `azurerm_cosmosdb_sql_container.tasks` (Tasks container, /workspaceId partition) |
| `infra/api-specs/api-sample.openapi.yaml` | APIM Gateway | Added GET/POST/PATCH /tasks paths + Task, CreateTask, UpdateTaskStatus, ErrorResponse schemas |
| `frontend/src/components/NavBar.tsx` | Frontend UI | Added "Task Board" nav link after "About" |
| `.apm/hooks/validate-app.sh` | Validation Hooks | Appended curl health check for GET /api/tasks |
| `.github/workflows/deploy-backend.yml` | CI/CD | Added `az functionapp config appsettings set` step for MAX_TASKS_PER_WORKSPACE=500 |

### Architectural Layers

| Layer | Technology | Files |
|-------|-----------|-------|
| **Schema (shared)** | Zod v3 + TypeScript | `packages/schemas/src/tasks.ts` |
| **Gateway** | Azure APIM + OpenAPI 3.0 | `infra/api-specs/api-sample.openapi.yaml` |
| **Backend** | Azure Functions v4 + Cosmos DB SDK | `backend/src/functions/fn-tasks.ts` |
| **Frontend** | Next.js 14 + React 18 | `frontend/src/app/tasks/page.tsx` |
| **Infrastructure** | Terraform (HCL) | `infra/cosmos.tf` |
| **CI/CD** | GitHub Actions | `.github/workflows/deploy-backend.yml` |
