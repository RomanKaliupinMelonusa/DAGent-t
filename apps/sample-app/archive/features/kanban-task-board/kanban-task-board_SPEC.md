# Feature: Interactive Kanban Task Board

## Goal
Implement a workspace-scoped Kanban board where users can create tasks and move them across status columns. This feature is a comprehensive showcase of the platform's UI capabilities, API gateway routing, stateful Cosmos DB persistence, CI/CD configuration injection, and full-stack data contract enforcement from Zod schemas through APIM to the browser.

## Prerequisites

> **🚨 CRITICAL — Cosmos DB Infrastructure Reuse**
>
> The `feature/webhook-dispatcher` branch (PR #35) **MUST** be merged to the base branch before this pipeline runs. That branch already provisioned in `infra/cosmos.tf`:
> - `azurerm_cosmosdb_account.cosmos` (serverless, Session consistency)
> - `azurerm_cosmosdb_sql_database.main` (`"sample-app-db"`)
> - RBAC role assignment: Function App MI → "Cosmos DB Built-in Data Contributor"
> - `COSMOSDB_ENDPOINT` and `COSMOSDB_DATABASE_NAME` app settings on the Function App
> - Cosmos DB outputs in `outputs.tf`
> - `@azure/cosmos` and `@azure/identity` npm dependencies in `backend/package.json`
>
> **DO NOT** duplicate any of these resources. Terraform will throw a Duplicate Resource Error during `poll-infra-plan` and halt the pipeline.

## Requirements

- [ ] **Shared Schemas:** Create `packages/schemas/src/tasks.ts`. Define `TaskStatusSchema` as `z.enum(["TODO", "IN_PROGRESS", "DONE"])`. Define `TaskSchema` (`id`, `workspaceId`, `title`, `status`, `createdAt`, `updatedAt` — all Zod-validated). Define `CreateTaskSchema` (`title: z.string().min(1).max(200)`; `workspaceId` is injected server-side). Define `UpdateTaskStatusSchema` (`status: TaskStatusSchema` only). Export all schemas and inferred types. Update the barrel export in `packages/schemas/src/index.ts`.
- [ ] **Infrastructure:** Append a new `azurerm_cosmosdb_sql_container.tasks` resource to the **existing** `infra/cosmos.tf` file. Container name: `"Tasks"`, partition key: `/workspaceId`. Reference the existing `azurerm_cosmosdb_account.cosmos` and `azurerm_cosmosdb_sql_database.main`. Do NOT create a new Cosmos DB account, database, RBAC role, output, or app setting — all already exist from `webhook-dispatcher`.
- [ ] **APIM Gateway:** Update `infra/api-specs/api-sample.openapi.yaml` to include `GET /tasks`, `POST /tasks`, and `PATCH /tasks/{id}/status` with full request/response schema definitions (`Task`, `CreateTask`, `UpdateTaskStatus`, `TaskStatus` enum). The existing `azurerm_api_management_api.sample` resource auto-imports this file and applies dual-mode auth policies — no APIM Terraform changes needed.
- [ ] **Backend API:** Create `backend/src/functions/fn-tasks.ts` with three Azure Functions v4 HTTP triggers:
  - `GET /api/tasks` — List all tasks for `workspaceId = "default"`. Return `200` with `Task[]`.
  - `POST /api/tasks` — Validate body with `CreateTaskSchema.safeParse()`. Generate `id` via `crypto.randomUUID()`, default status `"TODO"`, set `createdAt`/`updatedAt`. **Enforce `MAX_TASKS_PER_WORKSPACE`** (env var, default `500`): query task count per workspace before creating; return `429` if limit exceeded. Return `201` with the created `Task`.
  - `PATCH /api/tasks/{id}/status` — Validate body with `UpdateTaskStatusSchema.safeParse()`. Read existing item via `container.item(id, "default")`, update `status` + `updatedAt`, replace. Return `200` with updated `Task`. Return `404` if item not found.
  - Use `DefaultAzureCredential` for Cosmos auth (hard rule #4 — zero API keys). Lazy-init singleton `CosmosClient` and container reference. `@azure/cosmos` and `@azure/identity` are **already installed** — do NOT modify `backend/package.json`.
- [ ] **Self-Mutating Hook:** Append a curl check for `GET /api/tasks` to `.apm/hooks/validate-app.sh` before the `exit 0` line. Pattern: `curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$BACKEND_URL/tasks" -H "x-functions-key: $FUNC_KEY"` — expect `200`. Guard on `BACKEND_URL` being set. Report diagnostic on failure.
- [ ] **Frontend UI:** Create a `"use client"` page at `frontend/src/app/tasks/page.tsx`:
  - Display 3 distinct visual columns: "To Do", "In Progress", and "Done" — filter from single `tasks[]` state array.
  - Include a "New Task" `Input` + `Button` at the top of the "To Do" column (import from `@/components/ui/primitives`).
  - Each task card has status transition buttons: TODO → "Start" (→ IN_PROGRESS); IN_PROGRESS → "Done" (→ DONE), "Back to To Do" (→ TODO); DONE → "Reopen" (→ TODO).
  - **Optimistic UI:** Update local state immediately on button click, revert on API error.
  - On mount: `apiFetch<Task[]>("/tasks", {}, z.array(TaskSchema))` to load tasks.
  - Use existing design tokens: `bg-surface-card`, `border-border`, `text-text-primary`, `text-text-secondary`, `bg-primary`, `rounded-lg`, etc.
  - Add a "Task Board" `<Link href="/tasks">` to `NavBar.tsx` after the "About" link, using the existing `navLinkClass("/tasks", pathname)` helper.
- [ ] **E2E Tests:** Create `e2e/tasks.spec.ts` using the `authenticatedPage` fixture from `e2e/fixtures/demo-auth.fixture.ts`. The test must:
  1. Navigate to `/tasks`.
  2. Type a unique task title in the new task input.
  3. Click the create button → verify the task appears in the "To Do" column.
  4. Click the "Start" button on the task → verify it moves to the "In Progress" column.
  5. Reload the page (`authenticatedPage.reload()`).
  6. Verify the task persisted in the "In Progress" column after reload.
- [ ] **CI/CD Modification:** Modify `.github/workflows/deploy-backend.yml`. Add a new step after "Login to Azure (OIDC)" and before "Deploy to Azure Functions" that runs:
  ```yaml
  - name: Set application settings
    run: |
      az functionapp config appsettings set \
        --name ${{ vars.AZURE_FUNCTION_APP_NAME }} \
        --resource-group ${{ vars.AZURE_RESOURCE_GROUP || 'rg-sample-app-dev' }} \
        --settings MAX_TASKS_PER_WORKSPACE=500
  ```
- [ ] **Integration Test:** Create `backend/src/functions/__tests__/tasks.integration.test.ts` following the `smoke.integration.test.ts` pattern (`describeIntegration` guard, `BASE_URL`, `FUNC_KEY`). The test must:
  - CRUD flow: `POST /tasks` → `201`, `GET /tasks` → includes created task, `PATCH /tasks/{id}/status` → `200` with updated status.
  - **`MAX_TASKS_PER_WORKSPACE` validation:** Execute `az functionapp config appsettings list --name <app> --resource-group <rg>` via `child_process.execSync`, parse the JSON output, and assert that `MAX_TASKS_PER_WORKSPACE` equals `"500"`.
  - *Constraint:* If the setting is missing or incorrect, the test MUST `console.error` and `fail()` with exactly: `"MAX_TASKS_PER_WORKSPACE is missing. You must update deploy-backend.yml, commit it to the cicd scope, and ensure it deploys."`

## Scope

- **Schema:** Create `packages/schemas/src/tasks.ts` (new). Update `packages/schemas/src/index.ts` (barrel export). Zod v3 (`^3.24.0`) — match existing dependency, not Zod v4.
- **Backend:** Create `backend/src/functions/fn-tasks.ts` (3 HTTP triggers). Create `backend/src/functions/__tests__/tasks.integration.test.ts`. Do NOT modify `backend/package.json` — deps already present.
- **Frontend:** Create `frontend/src/app/tasks/page.tsx` (Kanban board). Update `frontend/src/components/NavBar.tsx` (nav link). No drag-and-drop — buttons only.
- **Infra/APIM:** Append `azurerm_cosmosdb_sql_container.tasks` to `infra/cosmos.tf`. Update `infra/api-specs/api-sample.openapi.yaml` (3 paths + schemas). Do NOT modify `main.tf`, `outputs.tf`, `variables.tf`, or `dev.tfvars` for Cosmos DB.
- **CI/CD & Hooks:** Modify `.github/workflows/deploy-backend.yml` (app setting step). Append to `.apm/hooks/validate-app.sh` (curl check).

## Testing Mandate (CRITICAL)

- **Unit Tests:** Backend agent MUST generate Jest unit tests for `fn-tasks.ts` business logic (input validation, 404 handling, 429 limit enforcement). Frontend agent SHOULD test the Kanban page component.
- **Integration Tests:** `tasks.integration.test.ts` MUST assert `MAX_TASKS_PER_WORKSPACE=500` via `az CLI` against the live environment. CRUD operations must be tested against the deployed Function App.
- **End-to-End (E2E):** `tasks.spec.ts` MUST cover: create task → appears in To Do → move to In Progress → reload → persisted in In Progress.

## Acceptance Criteria

1. Cosmos DB `Tasks` container is provisioned via `cosmos.tf` (no duplicate resources — `terraform validate` clean).
2. The UI renders 3 distinct columns and allows creating tasks and moving them across columns with optimistic updates.
3. APIM routes `GET`, `POST`, and `PATCH` requests correctly through dual-mode auth policies.
4. `POST /api/tasks` enforces `MAX_TASKS_PER_WORKSPACE=500` — returns `429` when limit exceeded.
5. CI/CD workflow is modified with the app setting injection, and the integration test validates it via `az CLI` control plane query.
6. E2E tests pass: create → move → reload → persisted.
7. `validate-app.sh` hook includes a curl check for `GET /api/tasks`.

## Architectural Decisions

| Decision | Resolution | Rationale |
|---|---|---|
| `workspaceId` | Hardcoded `"default"` | Partition key in place for future multi-tenancy; no workspace resolution needed now |
| Cosmos DB auth | `DefaultAzureCredential` only | Hard rule #4 — zero API keys in code. No connection string fallback. Developers `az login` locally |
| Cosmos DB infra | Reuse from `webhook-dispatcher` | PR #35 already provisioned account, database, RBAC, app settings, outputs, and npm deps |
| New container location | Append to `infra/cosmos.tf` | NOT `main.tf` — prevents duplicate resource errors, follows established file separation |
| Task count enforcement | Active in POST handler | Count query per workspace → 429 if >= `MAX_TASKS_PER_WORKSPACE` (env, default 500) |
| Integration test for env var | `az functionapp config appsettings list` | Queries Azure control plane — secure, doesn't expose env vars via data-plane API |
| Zod version | v3 (`^3.24.0`) | Matches actual installed dependency across the monorepo |
| Task movement UX | Buttons only, no drag-and-drop | Per requirements: "buttons or a dropdown" — simpler, more testable |
| Optimistic UI | Update state → revert on error | Polished UX; revert ensures consistency on failure |
| APIM routing | No Terraform changes | `azurerm_api_management_api.sample` auto-imports `api-sample.openapi.yaml`; dual-mode policies cover new paths |
| Backend `package.json` | Do NOT modify | `@azure/cosmos` and `@azure/identity` already installed from `webhook-dispatcher` |

## File Manifest

### Create
| File | Agent | Description |
|---|---|---|
| `packages/schemas/src/tasks.ts` | `@schema-dev` | TaskStatus, Task, CreateTask, UpdateTaskStatus Zod schemas + types |
| `backend/src/functions/fn-tasks.ts` | `@backend-dev` | 3 Azure Function HTTP triggers (list, create, update-status) |
| `frontend/src/app/tasks/page.tsx` | `@frontend-dev` | Kanban board — 3 columns, optimistic UI, apiFetch integration |
| `e2e/tasks.spec.ts` | `@e2e-dev` | Playwright E2E: create → move → reload → verify persistence |
| `backend/src/functions/__tests__/tasks.integration.test.ts` | `@backend-dev` | Integration: CRUD + MAX_TASKS_PER_WORKSPACE az CLI validation |

### Modify
| File | Agent | Description |
|---|---|---|
| `packages/schemas/src/index.ts` | `@schema-dev` | Add barrel exports for task schemas and types |
| `infra/cosmos.tf` | `@infra-architect` | Append `azurerm_cosmosdb_sql_container.tasks` ONLY |
| `infra/api-specs/api-sample.openapi.yaml` | `@infra-architect` | Add GET/POST/PATCH task paths + OpenAPI schemas |
| `frontend/src/components/NavBar.tsx` | `@frontend-dev` | Add "Task Board" nav link after "About" |
| `.apm/hooks/validate-app.sh` | `@backend-dev` | Append curl check for GET /api/tasks |
| `.github/workflows/deploy-backend.yml` | `@cicd-dev` | Add `az functionapp config appsettings set` step |

### Do NOT Touch
| File | Reason |
|---|---|
| `infra/main.tf` | Cosmos DB account, RBAC, and app settings already provisioned via `cosmos.tf` |
| `infra/outputs.tf` | Cosmos outputs already exist from `webhook-dispatcher` |
| `infra/variables.tf` | No new variables needed |
| `infra/dev.tfvars` | No new variable values needed |
| `backend/package.json` | `@azure/cosmos` and `@azure/identity` already installed |

## References
- Existing patterns: `fn-hello.ts`, `fn-demo-login.ts` (Azure Functions v4 HTTP trigger registration)
- Existing patterns: `hello.ts`, `auth.ts`, `errors.ts` (Zod schema definitions in `packages/schemas`)
- Existing patterns: `smoke.integration.test.ts` (integration test guard + helpers)
- Existing patterns: `demo-auth.fixture.ts` (Playwright authenticated page fixture)
- Existing patterns: `apiClient.ts` → `apiFetch()` (dual-mode auth fetch wrapper with Zod validation)
- Existing patterns: `NavBar.tsx` → `navLinkClass()` (active nav link styling)
- Existing patterns: `ui/primitives.tsx` → `Button`, `Input` components
- Existing patterns: `globals.css` → design tokens (`--surface-card`, `--border`, `--text-primary`, etc.)
- Infrastructure: `cosmos.tf` from `feature/webhook-dispatcher` (PR #35) — Cosmos DB account, database, RBAC
- CI/CD: `deploy-backend.yml` → `Azure/functions-action@v1`, OIDC login pattern
