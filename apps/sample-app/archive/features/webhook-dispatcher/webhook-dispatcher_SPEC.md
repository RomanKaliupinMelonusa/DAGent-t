# Feature: Event-Driven Webhook Dispatcher

## Goal
Implement a webhook management system where admins can register payload URLs and the system can dispatch event payloads to those URLs. This stress-tests full-stack integration, data-plane reachability, APIM gateway routing, and strict CI/CD configuration management across every layer of the Autonomous Software Factory.

## Requirements
- [ ] **Infrastructure:** Provision a new Azure Cosmos DB SQL container named `Webhooks` (partition key `/workspaceId`). Output the necessary config. Add `COSMOSDB_ENDPOINT` app setting to Function App for zero-key auth via `DefaultAzureCredential`.
- [ ] **APIM Gateway:** Add `POST /webhooks` and `GET /webhooks` paths to `infra/api-specs/api-sample.openapi.yaml`. Without this, APIM blocks all traffic to `/api/webhooks` with 404 (frontend talks to APIM, not the Function App directly).
- [ ] **Backend API:** Create `backend/src/functions/fn-webhooks.ts`. Implement `POST /api/webhooks` to register a URL and `GET /api/webhooks` to list them. Use `@azure/cosmos` with `DefaultAzureCredential` (zero API keys). Validate requests with shared Zod schemas.
- [ ] **Self-Mutating Hook (MANDATORY):** Append a curl check for `GET /api/webhooks` to `.apm/hooks/validate-app.sh` to verify data-plane reachability.
- [ ] **Frontend UI:** Create a new page at `/webhooks` with a form to register a new Webhook URL and a list/table displaying registered webhooks. Add a "Webhooks" link to the NavBar.
- [ ] **E2E Tests:** Add `e2e/webhooks.spec.ts` to navigate to `/webhooks`, register a mock URL, and verify it appears in the list.
- [ ] **CI/CD Modification (MANDATORY):** Modify `.github/workflows/deploy-backend.yml`. Inject an App Setting `WEBHOOK_TIMEOUT_MS=5000` into the deployment configuration.
- [ ] **Integration Test (The Trap):** Create `backend/src/functions/__tests__/webhooks.integration.test.ts`. This test MUST assert that the deployed backend environment has `WEBHOOK_TIMEOUT_MS` set to `5000`. If the test fails, it MUST explicitly `console.error` and `fail()` with this exact string: `"WEBHOOK_TIMEOUT_MS is missing. You must update .github/workflows/deploy-backend.yml, commit it to the working-tree, and ensure it deploys."`

## Scope

### Schema
- **CREATE** `packages/schemas/src/webhooks.ts` — Zod schemas:
  - `WebhookSchema`: `z.object({ id: z.string(), workspaceId: z.string(), url: z.string().url(), createdAt: z.string().datetime() })`
  - `CreateWebhookRequestSchema`: `z.object({ url: z.string().url(), workspaceId: z.string() })`
  - `WebhookListResponseSchema`: `z.object({ webhooks: z.array(WebhookSchema) })`
  - All types exported via `z.infer<>`
- **MODIFY** `packages/schemas/src/index.ts` — Re-export all webhook schemas and types (follow existing barrel pattern from `hello.ts`/`auth.ts`)

### Backend
- **MODIFY** `backend/package.json` — Add `@azure/cosmos` and `@azure/identity` to dependencies
- **CREATE** `backend/src/functions/fn-webhooks.ts`:
  - Import `{ app, HttpRequest, HttpResponseInit, InvocationContext }` from `@azure/functions`
  - Import `{ CosmosClient }` from `@azure/cosmos` + `{ DefaultAzureCredential }` from `@azure/identity`
  - Import schemas from `@branded/schemas`
  - Lazy-initialize CosmosClient singleton with `DefaultAzureCredential` + `process.env.COSMOSDB_ENDPOINT`
  - **POST /api/webhooks** handler:
    - Parse & validate body with `CreateWebhookRequestSchema.safeParse()`
    - Generate `id` via `crypto.randomUUID()`
    - Upsert to `Webhooks` container with `{ id, workspaceId, url, createdAt }`
    - Return 201 with created webhook
  - **GET /api/webhooks** handler:
    - Query `SELECT * FROM c` (optionally filter by `workspaceId` query param)
    - Return 200 with `{ webhooks: [...] }`
  - Register both via `app.http()` with `authLevel: "function"`, route `"webhooks"`
  - Follow existing patterns: structured error responses, Zod validation, `context.log`
- **CREATE** `backend/src/functions/__tests__/fn-webhooks.test.ts` — Unit tests:
  - Follow `fn-hello.test.ts` pattern: `createMockContext()`, `createMockRequest()`
  - Mock `@azure/cosmos` and `@azure/identity`
  - Test POST returns 201 with valid body, 400 with invalid body
  - Test GET returns 200 with webhooks array
- **CREATE** `backend/src/functions/__tests__/webhooks.integration.test.ts` — Integration tests:
  - Follow `smoke.integration.test.ts` pattern: `describeIntegration` guard, `apiFetch` helper
  - Test 1: Assert `GET /api/webhooks` returns 200
  - Test 2: Assert `POST /api/webhooks` registers and returns 201
  - **Test 3 (THE TRAP):** Assert `WEBHOOK_TIMEOUT_MS === "5000"` from environment. If missing:
    ```ts
    console.error("WEBHOOK_TIMEOUT_MS is missing. You must update .github/workflows/deploy-backend.yml, commit it to the working-tree, and ensure it deploys.");
    fail("WEBHOOK_TIMEOUT_MS is missing. You must update .github/workflows/deploy-backend.yml, commit it to the working-tree, and ensure it deploys.");
    ```
- **MODIFY** `.apm/hooks/validate-app.sh` — Append curl check before `exit 0`:
  ```bash
  # ─── Webhook endpoint reachability ────────────────────────────────────────
  if [[ -n "${BACKEND_URL:-}" ]]; then
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${BACKEND_URL}/webhooks" 2>/dev/null || echo "000")
    if [[ "$STATUS" == "000" || "$STATUS" == "502" || "$STATUS" == "503" ]]; then
      echo "Webhook endpoint at ${BACKEND_URL}/webhooks unreachable (HTTP $STATUS)"
      exit 1
    fi
  fi
  ```

### Frontend
- **CREATE** `frontend/src/app/webhooks/page.tsx`:
  - `"use client"` component (required for static export compatibility with `output: "export"`)
  - Form: text input for URL (`data-testid="webhook-url-input"`), submit button (`data-testid="webhook-submit"`)
  - On submit: `apiFetch<Webhook>("/webhooks", { method: "POST", body }, CreateWebhookRequestSchema)` (following `page.tsx` HomePage pattern)
  - List/table of webhooks: fetch on mount via `apiFetch<WebhookListResponse>("/webhooks", {}, WebhookListResponseSchema)`
  - Each row shows URL + createdAt (`data-testid="webhook-list"` on container, `data-testid="webhook-row"` per item)
  - Loading/error states following existing pattern (`useState`, `ApiError` handling)
- **MODIFY** `frontend/src/components/NavBar.tsx` — Add "Webhooks" link in `NavBarShell` after the "About" link:
  ```tsx
  <Link href="/webhooks" className={navLinkClass("/webhooks", pathname)}>
    Webhooks
  </Link>
  ```

### Infra
- **CREATE** `infra/cosmos.tf`:
  - `azurerm_cosmosdb_account.main`: name `cosmos-sample-app-${var.resource_suffix}`, serverless capacity mode, SQL API, location `var.location`, RG `azurerm_resource_group.main`, tags `local.tags`, consistency `Session`
  - `azurerm_cosmosdb_sql_database.main`: name `sample-app-db`
  - `azurerm_cosmosdb_sql_container.webhooks`: name `Webhooks`, partition key `/workspaceId`
  - `azurerm_cosmosdb_sql_role_assignment`: Function App MI → `Cosmos DB Built-in Data Contributor` (built-in role def `00000000-0000-0000-0000-000000000002`) scoped to account
- **MODIFY** `infra/outputs.tf` — Add:
  - `cosmosdb_endpoint` (account endpoint URL)
  - `cosmosdb_account_name`
- **MODIFY** `infra/main.tf` — Add `COSMOSDB_ENDPOINT` app setting to `azurerm_linux_function_app.main` `app_settings` block, referencing the Cosmos DB endpoint. Zero-key auth via `DefaultAzureCredential`.
- **MODIFY** `infra/api-specs/api-sample.openapi.yaml` — Add:
  - `GET /webhooks`: operationId `listWebhooks`, 200 response with array of webhook objects
  - `POST /webhooks`: operationId `createWebhook`, request body with `url` + `workspaceId`, 201 response with created webhook
  - Without these paths, APIM returns 404 for all `/api/webhooks` traffic

### CI/CD
- **MODIFY** `.github/workflows/deploy-backend.yml` — Add a step after "Login to Azure (OIDC)" to inject `WEBHOOK_TIMEOUT_MS=5000` as an app setting via `az functionapp config appsettings set`

## Testing Mandate (CRITICAL)

### Unit Tests
- **Backend:** `backend/src/functions/__tests__/fn-webhooks.test.ts`
  - Mock `@azure/cosmos` CosmosClient and `@azure/identity` DefaultAzureCredential
  - Follow `fn-hello.test.ts` pattern: `createMockContext()`, `createMockRequest()` helpers
  - POST handler: returns 201 with valid body, returns 400 with invalid/missing body, validates Zod schema rejection paths
  - GET handler: returns 200 with `{ webhooks: [...] }`, handles empty results

### Integration Tests
- **Backend:** `backend/src/functions/__tests__/webhooks.integration.test.ts`
  - Follow `smoke.integration.test.ts` pattern: `describeIntegration` guard (`RUN_INTEGRATION=true`), shared `apiFetch` helper with `INTEGRATION_API_BASE_URL` and `INTEGRATION_FUNCTION_KEY`
  - Test: `GET /api/webhooks` returns 200
  - Test: `POST /api/webhooks` with valid payload returns 201
  - **Test (THE TRAP):** Assert `process.env.WEBHOOK_TIMEOUT_MS === "5000"`. On failure:
    ```ts
    console.error("WEBHOOK_TIMEOUT_MS is missing. You must update .github/workflows/deploy-backend.yml, commit it to the working-tree, and ensure it deploys.");
    fail("WEBHOOK_TIMEOUT_MS is missing. You must update .github/workflows/deploy-backend.yml, commit it to the working-tree, and ensure it deploys.");
    ```

### End-to-End (E2E)
- **Playwright:** `e2e/webhooks.spec.ts`
  - Import `{ test, expect }` from `./fixtures/demo-auth.fixture` (uses `authenticatedPage` fixture for pre-authenticated sessions)
  - **Test: "shows webhook registration form"**
    - Navigate to `/webhooks`
    - Assert `webhook-url-input` (text input) is visible
    - Assert `webhook-submit` (submit button) is visible
  - **Test: "registers a new webhook URL and displays it in the list"**
    - Navigate to `/webhooks`
    - Fill `webhook-url-input` with `https://example.com/hook`
    - Click `webhook-submit`
    - Wait for the new entry to appear in `webhook-list`
    - Assert at least one `webhook-row` is visible
    - Assert the row text contains `https://example.com/hook`
  - **Test: "webhook list persists after page reload"**
    - Navigate to `/webhooks`
    - Register a webhook URL (e.g. `https://example.com/persist-test`)
    - Reload the page
    - Assert the previously registered webhook still appears in `webhook-list`
  - **Test: "can navigate to webhooks page from NavBar"**
    - From the authenticated home page, click the "Webhooks" nav link
    - Assert the URL path is `/webhooks`
    - Assert the registration form is visible

## Acceptance Criteria
1. Cosmos DB `Webhooks` container is provisioned via Terraform (`terraform plan` validates).
2. APIM OpenAPI spec includes `GET /webhooks` and `POST /webhooks` paths — frontend traffic reaches the Function App.
3. `validate-app.sh` dynamically pings `GET ${BACKEND_URL}/webhooks` for data-plane reachability.
4. CI/CD workflow (`deploy-backend.yml`) is modified with `WEBHOOK_TIMEOUT_MS=5000` and committed in the `cicd` scope.
5. Integration test asserts `WEBHOOK_TIMEOUT_MS` is present; fails with the exact prescribed error string if missing.
6. E2E tests pass: form renders, webhook registers, list displays, NavBar links work, data persists across reload.
7. `@doc-architect` documents the new Webhook architecture and risk profile.

## Commit Scoping (per agent-commit.sh)

| Scope | Files | Rationale |
|---|---|---|
| `backend` | `backend/package.json`, `backend/src/functions/fn-webhooks.ts`, `backend/src/functions/__tests__/*`, `packages/schemas/src/webhooks.ts`, `packages/schemas/src/index.ts`, `.apm/hooks/validate-app.sh` | Backend scope auto-includes `packages/`, `.apm/hooks/` |
| `infra` | `infra/cosmos.tf`, `infra/outputs.tf`, `infra/main.tf`, `infra/api-specs/api-sample.openapi.yaml` | Infra scope auto-includes all `infra/` subdirectories |
| `cicd` | `.github/workflows/deploy-backend.yml` | CI/CD scope for workflow files |
| `frontend` | `frontend/src/app/webhooks/page.tsx`, `frontend/src/components/NavBar.tsx`, `e2e/webhooks.spec.ts` | Frontend scope auto-includes `e2e/`, `packages/` |

> **⚠️ CRITICAL:** There are NO standalone `hooks`, `schemas`, or `e2e` scopes in `agent-commit.sh`. Do NOT hallucinate them.
> - `backend` scope covers: `backend/`, `packages/`, `infra/`, `.apm/hooks/`, `in-progress/`
> - `frontend` scope covers: `frontend/`, `packages/`, `e2e/`, `in-progress/`
> - `infra` scope covers: `infra/`, `.apm/hooks/`, `in-progress/`

## Architecture Decisions
- **Cosmos DB capacity:** Serverless (cost-efficient for dev/sample, no pre-provisioned throughput)
- **Auth for Cosmos:** `DefaultAzureCredential` via Function App managed identity — zero API keys in code (project hard rule)
- **Separate `cosmos.tf`:** Follows existing pattern of `swa.tf`, `apim.tf`, `cicd.tf` for separation of concerns
- **Partition key `/workspaceId`:** Enables multi-tenant isolation per requirements
- **Static export compatibility:** Frontend is `output: "export"` (static), so `/webhooks` page is `"use client"` (client-side SPA)
- **APIM gateway routing:** Frontend → APIM → Function App. OpenAPI spec must declare all paths or APIM returns 404.

## Verification Checklist
1. `cd packages/schemas && npm run build` — schemas compile
2. `cd backend && npm run lint` — TypeScript compiles clean
3. `cd backend && npm test` — unit tests pass (mocked Cosmos)
4. `RUN_INTEGRATION=true cd backend && npm run test:integration` — integration tests pass (requires live env)
5. `cd frontend && npm run build` — Next.js static export succeeds
6. `npx playwright test e2e/webhooks.spec.ts` — E2E tests pass
7. `cd infra && terraform plan -var-file=dev.tfvars` — Cosmos DB config validates
8. `bash .apm/hooks/validate-app.sh` — curl check syntax is valid
9. Inspect `deploy-backend.yml` for `WEBHOOK_TIMEOUT_MS=5000` app setting

## References
- Existing backend pattern: `backend/src/functions/fn-hello.ts`, `fn-demo-login.ts`
- Existing test pattern: `backend/src/functions/__tests__/fn-hello.test.ts`, `smoke.integration.test.ts`
- Existing E2E pattern: `e2e/authenticated-hello.spec.ts`, `e2e/fixtures/demo-auth.fixture.ts`
- Existing frontend pattern: `frontend/src/app/page.tsx`, `frontend/src/lib/apiClient.ts`
- Existing infra pattern: `infra/main.tf`, `infra/swa.tf`, `infra/apim.tf`
- APIM OpenAPI spec: `infra/api-specs/api-sample.openapi.yaml`
- Git commit wrapper: `tools/autonomous-factory/agent-commit.sh` (scope definitions)
- Self-mutating hook: `.apm/hooks/validate-app.sh`
