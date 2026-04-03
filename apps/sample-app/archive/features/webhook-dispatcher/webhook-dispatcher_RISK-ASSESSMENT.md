# Risk Assessment: webhook-dispatcher

## Key Architectural Decision Records (ADRs)

### ADR-1: Cosmos DB Serverless with Zero-Key RBAC Auth

- **Decision:** Provision Azure Cosmos DB with serverless capacity mode and authenticate via `DefaultAzureCredential` + Cosmos DB Built-in Data Contributor RBAC role assignment instead of connection strings.
- **Context:** The project enforces a hard rule of zero API keys in code. Serverless mode eliminates pre-provisioned throughput costs for a dev/sample application. RBAC-based auth aligns with Azure security best practices and the existing Key Vault + managed identity patterns used elsewhere in the stack.
- **Consequences:** Serverless mode has a 1,000 RU/s burst limit and 1 TB storage cap — unsuitable for production-scale workloads without migration to provisioned throughput. RBAC propagation can take up to 10 minutes after initial deployment, which may cause transient 403 errors during first deploy.

### ADR-2: APIM Gateway as Single Ingress Point

- **Decision:** All webhook API traffic is routed through Azure API Management. The OpenAPI spec (`api-sample.openapi.yaml`) was extended with `GET /webhooks` and `POST /webhooks` paths.
- **Context:** The existing architecture uses APIM as a mandatory gateway layer that enforces auth policies (demo token check-header or Entra ID JWT validation). Without explicit path declarations in the OpenAPI spec, APIM returns 404 — the "silent blocker" pattern documented in the spec.
- **Consequences:** Any new API endpoint requires a corresponding OpenAPI spec update and infrastructure redeployment. This adds a deployment coupling between backend code and infrastructure that must be coordinated across CI/CD scopes.

### ADR-3: Shared Zod Schemas as API Contract

- **Decision:** Define all webhook data types as Zod schemas in `@branded/schemas`, consumed by both backend validation and frontend type inference.
- **Context:** The existing pattern (`hello.ts`, `auth.ts`) uses Zod as the single source of truth for API contracts. This eliminates type drift between frontend and backend and enables runtime validation on both sides.
- **Consequences:** Schema changes require rebuilding the `@branded/schemas` package before either consumer can use them. Breaking schema changes affect both frontend and backend simultaneously.

## Blast Radius

**Roam PR Risk Score:** 37/100 — **MODERATE**

| Metric | Value |
|--------|-------|
| Files directly modified | 15 (source files) |
| Files transitively affected | ~20 (including tests, configs, pipeline artifacts) |
| Total files in diff | 35 |
| Total insertions | 5,613 lines |
| Modules touched | 6 (schemas, backend, frontend, infra, CI/CD, E2E) |
| Risk level | MODERATE |

### Affected Modules/Components

| Module | Files Changed | Risk |
|--------|--------------|------|
| **Shared Schemas** (`packages/schemas/`) | 3 (webhooks.ts, index.ts, schemas.test.ts) | LOW — additive only, no breaking changes to existing exports |
| **Backend** (`backend/`) | 4 (fn-webhooks.ts, package.json, 2 test files) | MEDIUM — new Cosmos DB dependency, new Azure Functions handlers |
| **Frontend** (`frontend/`) | 2 (webhooks/page.tsx, NavBar.tsx) | LOW — new page, minor NavBar modification |
| **Infrastructure** (`infra/`) | 4 (cosmos.tf, main.tf, outputs.tf, openapi.yaml) | HIGH — new Cosmos DB account, RBAC role, APIM path changes |
| **CI/CD** (`.github/workflows/`) | 1 (deploy-backend.yml) | MEDIUM — env variable injection into deployment pipeline |
| **E2E Tests** (`e2e/`) | 1 (webhooks.spec.ts) | LOW — additive test suite |

**Overall blast radius: MODERATE.** The feature is largely additive (new files) with surgical modifications to existing files. The highest-risk changes are in infrastructure (new Cosmos DB resources + RBAC) and CI/CD (deployment workflow modification).

## Short-Term Risks

### 1. Cosmos DB RBAC Propagation Delay (HIGH)
Azure RBAC role assignments for Cosmos DB can take **5–10 minutes** to propagate after initial deployment. During this window, the Function App will receive 403 Forbidden responses from Cosmos DB. The self-mutating validation hook (`validate-app.sh`) may fail on first deployment if run before propagation completes.

**Mitigation:** The integration test validates data-plane reachability. CI/CD should include a retry/wait mechanism or accept transient failures on first deploy.

### 2. APIM OpenAPI Spec Sync (MEDIUM)
The OpenAPI spec must be deployed **before** the backend is exercised. If infrastructure and backend deployments occur out of order, APIM will return 404 for `/api/webhooks` even though the Function App is ready.

**Mitigation:** Deployment pipeline sequences infrastructure before backend. The `validate-app.sh` hook checks endpoint reachability post-deployment.

### 3. No Pagination on GET /webhooks (LOW)
The current `GET /api/webhooks` handler executes `SELECT * FROM c` without pagination. For the sample app scope this is acceptable, but could return excessively large payloads if webhook volume grows.

**Mitigation:** Accept for current scope; document as long-term debt item.

## Long-Term Technical Debt

### 1. Missing Pagination and Filtering
The `listWebhooks` handler returns all documents with no continuation token or limit parameter. As data accumulates, response sizes will grow unbounded. A `limit`/`offset` or Cosmos DB continuation token pattern should be introduced.

### 2. No Webhook Dispatch Engine
The current feature only **registers** webhook URLs — it does not dispatch events to them. The name "webhook-dispatcher" implies future dispatch capability. When implemented, this will require:
- An event source (e.g., Event Grid, Service Bus)
- A dispatch function with retry logic, circuit breaking, and dead-letter handling
- Timeout configuration (the `WEBHOOK_TIMEOUT_MS=5000` env var is already provisioned for this)

### 3. Hardcoded Default Workspace ID
The frontend uses `DEFAULT_WORKSPACE_ID = "ws-default"` as a constant. In a true multi-tenant scenario, this should be derived from the authenticated user's context or session.

### 4. Cosmos DB Serverless Scaling Limits
Serverless Cosmos DB has a 1,000 RU/s burst ceiling and 1 TB storage maximum. If the application grows beyond sample/dev usage, migration to provisioned throughput (with autoscale) will be necessary. This is a planned upgrade path, not an oversight.

## Suggested Reviewers

| Reviewer | Reason | Lines Contributed |
|----------|--------|-------------------|
| **RomanKaliupinMelonusa** | Primary author and sole code owner across all modules | 7,286 |

> **Note:** This is a single-author project. For production readiness, a second reviewer with Azure infrastructure expertise (Cosmos DB RBAC, APIM policies) is recommended.

## Appendix: Roam Structural Analysis

- **Roam PR Risk:** 37/100 (MODERATE) — novelty score 0.75 (new patterns), 0 dead exports introduced
- **Roam Codebase Health:** 17/100 (pre-existing debt in monorepo tooling, not feature-specific)
- **Key Symbol PageRank:** `azurerm_cosmosdb_account.main` = 0.2456 (high centrality — 12 dependants in infra graph)
- **Cognitive Load:** `fn-webhooks.ts` = 23.3, `page.tsx` = 38.3, `cosmos.tf` = 14.0
- **Limitation:** `roam_diff` and `roam_impact` returned validation errors during analysis; blast radius was inferred from `git diff --name-status` and `roam_pr_risk` output.
