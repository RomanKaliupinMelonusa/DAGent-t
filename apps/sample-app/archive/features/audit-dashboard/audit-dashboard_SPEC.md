# Feature: User Audit Log Dashboard

## Goal
Implement an internal audit system that tracks user actions (login, profile views, etc.) and an admin dashboard to browse the event history. This requires provisioning a new Azure Cosmos DB (Serverless, SQL API) to store telemetry separately from transactional data, wiring it securely to the backend via Managed Identity RBAC, and surfacing the data through a new frontend page.

## Requirements
- [ ] Provision a new Azure Cosmos DB account (Serverless capacity, SQL API) with a database `AuditDB` and container `AuditLogs` (partition key `/userId`).
- [ ] Grant the Function App Managed Identity the `Cosmos DB Built-in Data Contributor` RBAC role — zero connection-string keys (`DefaultAzureCredential` only).
- [ ] Add `COSMOS_ENDPOINT` app setting to the Function App pointing to the Cosmos DB account endpoint.
- [ ] Export `cosmosdb_account_name` and `cosmosdb_endpoint` as Terraform outputs.
- [ ] Add `POST /audit` and `GET /audit` path definitions to `api-specs/api-sample.openapi.yaml` so APIM routes them through the existing auth policy.
- [ ] Create a shared Zod schema `AuditLogSchema` with fields: `id` (UUID), `userId` (string), `action` (string), `timestamp` (ISO-8601 datetime).
- [ ] Create `AuditLogCreateSchema` (omits `id` and `timestamp` — server generates these).
- [ ] Create a backend endpoint `POST /api/audit` to record new audit events into the `AuditLogs` container.
- [ ] Create a backend endpoint `GET /api/audit` to retrieve the latest 50 events (`SELECT TOP 50 * FROM c ORDER BY c.timestamp DESC`).
- [ ] Create a new frontend page at `/audit` that displays a data table of audit logs (columns: User ID, Action, Timestamp) with loading, error, and empty states.
- [ ] Add an "Audit" link to the `NavBar` component (between About and the theme toggle).
- [ ] Update `DemoLoginForm` to fire a **fire-and-forget** `POST /api/audit` with `{ userId: username, action: "USER_LOGIN" }` upon successful authentication. Login must never be blocked by audit failure (`.catch(() => {})`).
- [ ] **Infrastructure Hook Mandate:** The `@infra-architect` agent MUST append a **data-plane** reachability check to `.apm/hooks/validate-infra.sh`. The check MUST use `terraform output -raw cosmosdb_endpoint` to resolve the endpoint URL, then `curl` it. Accept HTTP 200 or 401 as success (401 proves the data-plane is responding). Any other status fails the hook. Do NOT use control-plane `az cosmosdb list/show` commands.
- [ ] **App Hook Mandate:** The `@backend-dev` agent MUST append a curl check for `GET /api/audit` to `.apm/hooks/validate-app.sh`. Fail on HTTP 000/502/503.

## Scope
- **Schema:** `packages/schemas/src/audit.ts` (new) — `AuditLogSchema`, `AuditLogCreateSchema`, inferred types
- **Schema barrel:** `packages/schemas/src/index.ts` (modify) — add audit exports
- **Backend:** `backend/src/functions/fn-audit.ts` (new) — POST + GET handlers with lazy Cosmos client singleton (`DefaultAzureCredential`)
- **Backend deps:** `backend/package.json` (modify) — add `@azure/cosmos`, `@azure/identity`
- **Frontend page:** `frontend/src/app/audit/page.tsx` (new) — client component data table
- **Frontend nav:** `frontend/src/components/NavBar.tsx` (modify) — add Audit link
- **Frontend login:** `frontend/src/components/DemoLoginForm.tsx` (modify) — fire-and-forget audit POST
- **Infra - Cosmos:** `infra/cosmos.tf` (new) — account, SQL database, SQL container, RBAC role assignment
- **Infra - Function App:** `infra/main.tf` (modify) — add `COSMOS_ENDPOINT` app setting
- **Infra - Outputs:** `infra/outputs.tf` (modify) — add `cosmosdb_account_name`, `cosmosdb_endpoint`
- **Infra - APIM spec:** `infra/api-specs/api-sample.openapi.yaml` (modify) — add `/audit` GET + POST paths
- **Hooks:** `.apm/hooks/validate-infra.sh` (modify), `.apm/hooks/validate-app.sh` (modify)

## Testing Mandate (CRITICAL)
- **Unit Tests (Schema):** Append test cases to `packages/schemas/src/__tests__/schemas.test.ts` for `AuditLogSchema` — valid data passes, missing fields rejected, invalid datetime rejected.
- **Unit Tests (Backend):** Create `backend/src/functions/__tests__/fn-audit.test.ts` with mocked `@azure/cosmos` and `@azure/identity`. Cover: POST valid→201, POST invalid→400, POST Cosmos error→500, GET items→200, GET empty→200, GET error→500. Validate responses against `AuditLogSchema`.
- **Unit Tests (Frontend):** Create `frontend/src/app/audit/__tests__/page.test.tsx` with mocked `apiFetch`. Cover: renders table with data, error state on failure, empty state when no logs.
- **End-to-End (E2E):** Create `e2e/audit.spec.ts` using the `demo-auth.fixture`. Tests: navigate to `/audit` and assert `data-testid="audit-table"` is visible, verify at least one `data-testid="audit-row"` exists (the fixture login fires a USER_LOGIN event), verify table columns render (User ID, Action, Timestamp).

## Acceptance Criteria
1. Cosmos DB (Serverless, SQL API) is provisioned via Terraform with `AuditDB` database and `AuditLogs` container.
2. Function App MI has `Cosmos DB Built-in Data Contributor` RBAC — no connection string keys anywhere.
3. `validate-infra.sh` performs a true data-plane ping of the Cosmos DB endpoint via `terraform output -raw cosmosdb_endpoint` + `curl` (accept 200 or 401).
4. `validate-app.sh` performs a curl check against `GET /api/audit` (fail on 000/502/503).
5. Schema, backend, and frontend unit tests all pass (`npx jest --verbose` in each package).
6. `POST /api/audit` writes to Cosmos DB and returns 201; `GET /api/audit` returns the latest 50 events.
7. The `/audit` page renders a data table with User ID, Action, and Timestamp columns.
8. `DemoLoginForm` fires a non-blocking audit POST on successful login.
9. APIM routes `/audit` GET and POST through the existing dual-mode auth policy.
10. E2E Playwright tests pass — authenticated user navigates to `/audit`, table renders with at least one row.
11. `@doc-architect` generates C4 diagrams showing the new Cosmos DB dependency and assesses the technical debt of this event-driven architecture.

## References
- Existing backend pattern: `backend/src/functions/fn-hello.ts`, `fn-demo-login.ts`
- Existing schema pattern: `packages/schemas/src/hello.ts`, `auth.ts`
- Existing e2e pattern: `e2e/authenticated-hello.spec.ts` with `fixtures/demo-auth.fixture.ts`
- Existing APIM spec: `infra/api-specs/api-sample.openapi.yaml` (explicit path mapping, not wildcard)
- Azure Cosmos DB RBAC: `Cosmos DB Built-in Data Contributor` role definition ID `00000000-0000-0000-0000-000000000002`
- Hook contracts: `.apm/hooks/validate-infra.sh` (self-mutating, exit 0/1), `.apm/hooks/validate-app.sh` (self-mutating, exit 0/1)
