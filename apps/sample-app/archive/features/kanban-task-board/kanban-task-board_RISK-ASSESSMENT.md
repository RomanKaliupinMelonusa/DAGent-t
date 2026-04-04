# Risk Assessment: kanban-task-board

## Key Architectural Decision Records (ADRs)

### ADR-1: DefaultAzureCredential for Cosmos DB Auth (Zero API Keys)

- **Decision:** All Cosmos DB access uses `DefaultAzureCredential` — no connection strings or API keys anywhere in code.
- **Context:** Hard rule #4 mandates zero API keys. The managed identity RBAC role (`Cosmos DB Built-in Data Contributor`) was already provisioned by `webhook-dispatcher`. This approach ensures credentials never leak in logs, environment variables, or source control.
- **Consequences:** Local development requires `az login` before running the function app. Cold-start latency includes a token acquisition step (~50-200ms first call). No fallback if RBAC misconfiguration occurs — the function returns 500 with a clear error message.

### ADR-2: Hardcoded `workspaceId = "default"` with Partition Key Pre-Positioned

- **Decision:** All tasks are stored under `workspaceId = "default"`. The Cosmos DB container uses `/workspaceId` as its partition key.
- **Context:** Multi-tenancy is a future requirement. Pre-positioning the partition key avoids a breaking container migration later. The current implementation is simpler (no workspace resolution middleware needed), while the data model is already multi-tenant-ready.
- **Consequences:** All tasks share one logical partition. At scale (>20GB per partition), this will need a workspace-resolution layer. Query performance is optimal for the current single-workspace scenario since all data is co-located.

### ADR-3: Server-Side Task Limit Enforcement via Environment Variable

- **Decision:** `MAX_TASKS_PER_WORKSPACE` (default 500) is enforced in the POST handler by counting existing tasks before creation. The value is injected via CI/CD as an app setting.
- **Context:** Prevents runaway task creation that could exhaust Cosmos DB RUs or storage. The limit is configurable per environment without code changes. The integration test validates the setting is deployed correctly via `az CLI` control-plane query.
- **Consequences:** The count query adds ~5-15ms latency to every POST. A race condition exists where two concurrent POSTs could both pass the count check (eventual consistency). This is acceptable for the current use case — the limit is a safety net, not a hard quota.

## Blast Radius

**Roam PR Risk Score:** 37/100 (MODERATE)

| Metric | Value |
|--------|-------|
| Files directly created/modified | 13 (7 new, 6 modified) |
| Shared schema dependents | 4 files (fn-tasks.ts, page.tsx, fn-tasks.test.ts, page.test.tsx) |
| Infrastructure resources added | 1 (Cosmos DB container `Tasks`) |
| APIM routes added | 3 (GET, POST, PATCH) |
| CI/CD workflows modified | 1 (deploy-backend.yml) |
| Test files added | 4 (unit × 2, integration × 1, e2e × 1) |

**Affected Modules:**

| Module | Impact | Risk |
|--------|--------|------|
| `packages/schemas` | New schemas exported — no breaking changes to existing exports | LOW |
| `backend/functions` | New function file — isolated, no changes to existing functions | LOW |
| `infra/cosmos.tf` | Appended container — reuses existing account/database/RBAC | LOW |
| `infra/api-specs` | Extended OpenAPI spec — additive paths only | LOW |
| `frontend/app/tasks` | New page — isolated route, no changes to existing pages | LOW |
| `frontend/components/NavBar` | Added nav link — minor DOM change, low regression risk | LOW |
| `.github/workflows` | Added step to deploy-backend — ordering-sensitive | MEDIUM |
| `.apm/hooks/validate-app.sh` | Appended check — additive, no change to existing checks | LOW |

**Overall Risk Level:** LOW-MEDIUM — The feature is primarily additive with minimal cross-cutting concerns.

## Short-Term Risks

### 1. Race Condition in Task Count Enforcement

**Severity:** LOW  
The `MAX_TASKS_PER_WORKSPACE` check queries the current count and then creates. Under concurrent POST requests, two requests could both pass the count check and create tasks, exceeding the limit by 1. Cosmos DB's session consistency does not prevent this. Mitigation: The limit is a safety net (500 tasks), and overshooting by 1-2 is acceptable. A stored procedure with atomic check-and-create would eliminate this if stricter enforcement is needed.

### 2. Missing PATCH Idempotency

**Severity:** LOW  
The `PATCH /tasks/{id}/status` endpoint is not idempotent — calling it twice with the same status succeeds both times and updates `updatedAt`. This is correct behavior for status transitions but could cause confusing audit trails if retry logic is added. Mitigation: Not needed currently; status transitions are user-initiated, not automated.

### 3. Single Partition Hot Spot

**Severity:** LOW (currently), MEDIUM (at scale)  
All tasks land in the `workspaceId = "default"` partition. Cosmos DB serverless handles this well up to ~20GB / 10K RU/s per partition. Beyond that, workspace sharding is needed. Mitigation: The partition key is already in place; adding workspace resolution is a backend-only change.

## Long-Term Technical Debt

### 1. No Soft Delete or Task Archival

Tasks can only be moved between columns — there is no delete or archive mechanism. Over time, the `DONE` column will accumulate tasks with no way to clean up except direct Cosmos DB operations. **Recommendation:** Add a `DELETE /tasks/{id}` endpoint or an automatic archival policy in a future iteration.

### 2. Hardcoded Workspace Resolution

The `WORKSPACE_ID = "default"` constant in `fn-tasks.ts` bypasses any workspace resolution logic. When multi-tenancy is implemented, this constant must be replaced with middleware that extracts `workspaceId` from the authenticated user's context. **Recommendation:** Extract workspace resolution into a shared middleware function when the second workspace is needed.

### 3. No Pagination on Task Listing

`GET /tasks` returns all tasks for a workspace with no cursor or limit parameter. At 500 tasks (the max), the response payload could reach ~200KB. **Recommendation:** Add `?limit=50&continuationToken=...` pagination before increasing `MAX_TASKS_PER_WORKSPACE` beyond 500.

### 4. Frontend State Management

The Kanban page manages all state with local `useState` hooks. This is appropriate for the current scope but does not support cross-tab synchronization or real-time collaboration. **Recommendation:** Consider React Query or SWR for server state management if task boards become collaborative.

## Suggested Reviewers

| Reviewer | Basis | Focus Area |
|----------|-------|------------|
| RomanKaliupinMelonusa | Primary contributor (6,251 lines), full codebase familiarity | Architecture, Cosmos DB patterns, CI/CD integration |
| Infrastructure owner | Cosmos DB container config, RBAC reuse from webhook-dispatcher | `cosmos.tf` changes, partition key design |
| Frontend owner | React patterns, optimistic UI, design token usage | `page.tsx`, NavBar integration |
