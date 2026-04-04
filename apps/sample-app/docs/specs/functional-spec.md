# Functional Specification — Sample App

## Features

### 1. Greeting Endpoint

A simple GET endpoint demonstrating APIM gateway routing and dual-mode authentication.

- **Route:** `/hello?name=<name>`
- **Behavior:** Returns `"Hello, <name>!"` with a timestamp
- **Auth:** Protected by APIM dual-mode auth policy

### 2. Kanban Task Board

An interactive workspace-scoped task management board with three status columns and optimistic UI updates.

- **Route:** `/tasks`
- **Backend:** 3 Azure Functions HTTP triggers (`fn-tasks.ts`)
- **Storage:** Cosmos DB `Tasks` container, partitioned by `workspaceId`
- **Auth:** All API calls routed through APIM dual-mode auth

#### User Flows

**Create a task:**
1. Navigate to `/tasks`
2. Type a task title (1–200 characters) in the "To Do" column input
3. Click "Add" or press Enter
4. Task appears in the "To Do" column

**Move a task:**
1. Click a status transition button on a task card:
   - "Start" moves TODO → IN_PROGRESS
   - "Done" moves IN_PROGRESS → DONE
   - "Back to To Do" moves IN_PROGRESS → TODO
   - "Reopen" moves DONE → TODO
2. Task moves to the target column immediately (optimistic UI)
3. If the API call fails, the task reverts to its previous column

**Persistence:**
- Tasks persist across page reloads via Cosmos DB
- The board loads all tasks on mount via `GET /api/tasks`

#### Constraints

| Constraint | Value | Enforcement |
|-----------|-------|-------------|
| Max tasks per workspace | 500 | Server-side COUNT query before create; returns 429 |
| Title length | 1–200 characters | Zod schema validation (client + server) |
| Workspace scope | `"default"` (hardcoded) | Partition key ready for future multi-tenancy |

### 3. Dual-Mode Authentication

Feature-flagged auth system supporting demo credentials (pipeline testing) and Entra ID (production).

See [system-overview.md](../architecture/system-overview.md#authentication) for details.
