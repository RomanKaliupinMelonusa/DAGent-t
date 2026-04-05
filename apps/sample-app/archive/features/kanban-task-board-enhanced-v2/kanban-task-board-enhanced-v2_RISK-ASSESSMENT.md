# Risk Assessment: kanban-task-board-enhanced-v2

## Key Architectural Decision Records (ADRs)

### ADR-1: Reuse Cosmos DB Infrastructure from webhook-dispatcher

- **Decision:** Extend the existing `cosmos.tf` with a new `Tasks` container rather than provisioning a separate Cosmos DB account or database.
- **Context:** PR #35 (`webhook-dispatcher`) already provisioned the Cosmos DB account (serverless), SQL database, RBAC role assignment, and all app settings. Duplicating these resources would cause Terraform `Duplicate Resource` errors and waste serverless capacity.
- **Consequences:** Tight coupling between two features at the infrastructure layer. If `webhook-dispatcher` is rolled back, the `Tasks` container resource references become orphaned. However, this is the correct cost/complexity trade-off for a serverless workload sharing one account.

### ADR-2: Native HTML5 Drag-and-Drop API (Zero External Libraries)

- **Decision:** Implement drag-and-drop using the browser-native HTML5 Drag and Drop API instead of libraries like `react-beautiful-dnd` or `dnd-kit`.
- **Context:** The feature requires column-to-column moves only (no within-column reordering), making the native API sufficient. Adding a DnD library would increase the frontend bundle size and introduce a new dependency to maintain.
- **Consequences:** The native API has known limitations on mobile touch devices (no native touch support) — mitigated by fallback status-transition buttons. The DnD event model is more verbose than library abstractions, resulting in ~80 lines of handler code in the component.

### ADR-3: Optimistic UI with Server-Reconciled Revert

- **Decision:** Update local React state immediately on user interaction (drag-drop or button click), then fire the API call and revert on failure.
- **Context:** Kanban boards are latency-sensitive — users expect instant visual feedback when moving cards. Waiting for a round-trip through APIM → Functions → Cosmos would create a perceptible delay.
- **Consequences:** Brief UI inconsistency window if the API fails. The revert mechanism must correctly restore the previous state snapshot. All 46 frontend unit tests validate this flow, including error scenarios.

## Blast Radius

**Roam PR Risk Score: 35/100 (MODERATE)**

| Metric | Value |
|---|---|
| Files directly modified | 6 (source) + 8 (new files created) |
| Files transitively affected | Low — new feature surface with minimal coupling to existing code |
| Clusters touched | 0 existing clusters impacted (self-contained feature) |
| Bus factor risk | Low — single-author codebase, consistent with project norms |

### Affected Modules

| Module | Direct Changes | Transitive Impact |
|---|---|---|
| `packages/schemas` | 2 files (new schema + barrel export) | Consumed by backend + frontend — additive only, no breaking changes |
| `backend/src/functions` | 1 new file (`fn-tasks.ts`) | New function triggers — no changes to existing functions |
| `frontend/src/app/tasks` | 1 new file (`page.tsx`) | New route — no changes to existing pages |
| `frontend/src/components` | 1 modification (`NavBar.tsx`) | Additive `<Link>` — no existing behavior altered |
| `infra/` | 1 file (`cosmos.tf`) + 1 file (`api-sample.openapi.yaml`) | New Cosmos container + APIM routes — no changes to existing resources |
| `.github/workflows` | 1 modification (`deploy-backend.yml`) | New step after OIDC login — no changes to existing steps |

**Risk Level: LOW** — This is a greenfield feature addition with minimal coupling to existing code. The only modified existing files are `NavBar.tsx` (additive link), `index.ts` (additive export), `deploy-backend.yml` (additive step), `validate-app.sh` (additive check), and `api-sample.openapi.yaml` (additive paths). No existing behavior is altered.

## Short-Term Risks

### 1. Cosmos DB Container Provisioning Race Condition (MEDIUM)

The `Tasks` container is defined in `cosmos.tf` alongside the existing `Webhooks` container. If `terraform apply` fails partway through (e.g., transient Azure API error), the container may not be created while the Function App code expects it. **Mitigation:** The `validate-infra.sh` hook should catch this, and the backend's lazy `getContainer()` will return clear 500 errors.

### 2. MAX_TASKS_PER_WORKSPACE Count Query Performance (LOW)

The rate-limiting mechanism executes a `SELECT VALUE COUNT(1) FROM Tasks` query per `POST /api/tasks` call. On a serverless Cosmos account with the `Tasks` container partitioned by `/workspaceId`, this is a single-partition cross-item query. At the current 500-task limit this is negligible, but at scale (many concurrent writes) it could become a bottleneck. **Mitigation:** The count query is scoped to a single partition key, keeping RU cost low.

### 3. HTML5 DnD Mobile Touch Limitation (LOW)

The HTML5 Drag and Drop API does not natively support touch events on mobile devices. Users on iOS/Android must use the fallback status-transition buttons. **Mitigation:** Buttons are prominently displayed on each task card and cover all state transitions. The E2E tests validate both interaction paths.

## Long-Term Technical Debt

### 1. Hardcoded `workspaceId = "default"` (MEDIUM)

Both the backend (`WORKSPACE_ID` constant) and frontend assume a single "default" workspace. When multi-tenancy is introduced, this will require:
- Workspace resolution middleware in the backend
- Workspace context provider in the frontend
- Updated Cosmos queries with dynamic partition keys

The partition key infrastructure (`/workspaceId`) is already in place, so the data model is ready.

### 2. No Within-Column Reordering (LOW)

The native HTML5 DnD implementation supports column-to-column moves but not drag-to-reorder within a column. Adding this would likely require an `order` field in the Task schema and either a DnD library or significantly more complex native DnD logic. This is a deliberate scope cut documented in the spec.

### 3. TaskBoardPage Monolith Component (MEDIUM)

The `TaskBoardPage` component at 421 LOC (cognitive load score: 49.8) contains column rendering, drag-and-drop handlers, task creation, status updates, and error handling in a single file. As the feature evolves, this should be decomposed into:
- `TaskColumn` component
- `TaskCard` component  
- `useTaskBoard` custom hook (state management)
- `useDragAndDrop` custom hook (DnD event handlers)

### 4. No Pagination on Task List (LOW)

`GET /api/tasks` returns all tasks for the workspace in a single response. With the 500-task limit this is manageable (~50KB payload), but removing or raising the limit would require cursor-based pagination with Cosmos continuation tokens.

## Suggested Reviewers

| Reviewer | Rationale | Lines Changed |
|---|---|---|
| **RomanKaliupinMelonusa** | Primary code owner — authored 99%+ of the codebase including all infrastructure, backend patterns, and frontend architecture | 6,657+ |

## Test Coverage Summary

| Test Suite | File | Tests | LOC | Coverage Area |
|---|---|---|---|---|
| Backend Unit | `fn-tasks.test.ts` | Multiple | 379 | Input validation, 404/429 handling, CRUD logic |
| Backend Integration | `tasks.integration.test.ts` | CRUD + config | 184 | Live API against deployed Function App, `az CLI` app setting verification |
| Frontend Unit | `page.test.tsx` | 46 | 811 | Rendering, DnD events, status transitions, optimistic UI, error handling |
| E2E | `tasks.spec.ts` | 4 scenarios | 265 | Create → DnD move → reload persistence → button fallback → same-column no-op |

**Total test code: 1,639 LOC** covering the 798 LOC of feature code (2.05:1 test-to-code ratio).

## Codebase Health Context

| Metric | Value | Assessment |
|---|---|---|
| Overall health score | 14/100 | Pre-existing — driven by tooling complexity, not this feature |
| Feature health impact | Neutral | New files have individual scores of 5–9.5/10; no degradation |
| Dependency cycles | 9 (pre-existing) | This feature introduces 0 new cycles |
| Dead exports | 74 (pre-existing) | This feature introduces 0 new dead exports |
| Cognitive complexity | `fn-tasks.ts`: 36.3, `page.tsx`: 49.8 | `page.tsx` is elevated — see Tech Debt item #3 |
