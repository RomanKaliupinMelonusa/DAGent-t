# Risk Assessment: health-check-ci

## Key Architectural Decision Records (ADRs)

### ADR-1: Anonymous Auth Level for Health Endpoint

- **Decision:** The `fn-health` function uses `authLevel: "anonymous"` instead of `authLevel: "function"` (used by all other endpoints).
- **Context:** CI pipelines and infrastructure probes (load balancers, uptime monitors) must reach the health endpoint without function keys or APIM gateway tokens. Requiring credentials would create a circular dependency — the health check itself would need auth infrastructure to be working, defeating its purpose as a deployment smoke test.
- **Consequences:** The `/api/health` endpoint is publicly reachable without any authentication. This is acceptable because it returns only a static status string and the `STRICT_HEALTH_MODE` flag value (always `"true"` or `"disabled"`), with no user data, secrets, or internal system details. However, it widens the public attack surface by one endpoint — rate limiting at the Azure Functions consumption plan level is the only protection against abuse.

### ADR-2: Environment Variable Injection via CI/CD (Not Terraform)

- **Decision:** `STRICT_HEALTH_MODE` is injected as an Azure App Setting via `az functionapp config appsettings set` in the GitHub Actions workflow, rather than through Terraform infrastructure-as-code.
- **Context:** The health mode setting is a deployment-time signal, not an infrastructure resource. Managing it in Terraform would require a full infra plan/apply cycle for what is essentially a CI/CD concern. The `deploy-backend.yml` workflow already has Azure CLI access via OIDC federated credentials.
- **Consequences:** This creates a configuration drift vector — Terraform state does not know about this app setting, and a `terraform apply` could theoretically overwrite it if `app_settings` blocks are added later. The setting is also not visible in the Terraform outputs. This is a conscious trade-off: speed and simplicity over full IaC coverage for a non-critical flag.

### ADR-3: Minimal Response Shape (Diverges from Schema Package)

- **Decision:** The endpoint returns `{status: "ok", mode: "<value>"}` rather than the richer `HealthCheckResponseSchema` defined in `packages/schemas/src/health.ts`.
- **Context:** The spec called for a simple status + mode response for CI probes. The full schema (`HealthStatus`, `HealthCheckEntry[]`, `timestamp`, `version`) was added to `@branded/schemas` as a forward-looking contract for when dependency health checks (database, cache, etc.) are added.
- **Consequences:** There is a schema/implementation gap — the live endpoint does not conform to its own shared schema. This is intentional for the MVP but should be reconciled when the endpoint is extended. Consumers relying on the schema types may be surprised by the simpler actual response.

## Blast Radius

| Metric | Value |
|--------|-------|
| Files directly modified | 8 (4 new, 4 modified) |
| Files transitively affected | 0 (no downstream consumers yet) |
| Risk score (Roam) | **MODERATE (50/100)** |

**Affected modules:**

| Module | Files | Impact |
|--------|-------|--------|
| Backend Functions | `fn-health.ts` | New endpoint — no existing code affected |
| Backend Tests | `fn-health.test.ts`, `health.integration.test.ts` | New test files — additive only |
| Shared Schemas | `health.ts`, `index.ts`, `schemas.test.ts` | New exports added — no breaking changes to existing exports |
| CI/CD | `deploy-backend.yml` | Appended step — existing deploy steps unchanged |
| DevOps Hooks | `validate-app.sh` | Appended check — existing checks unchanged |

**Blast radius assessment:** LOW. All changes are additive. No existing function signatures, API contracts, or infrastructure resources were modified. The feature is fully isolated — removing the health endpoint would require deleting new files and reverting 3 append-only changes.

## Short-Term Risks

### 1. Deployment Race Condition (Severity: MEDIUM)

The `deploy-backend.yml` workflow deploys the function package first, then sets `STRICT_HEALTH_MODE` in a separate step. During the window between deployment and setting injection (~5-15 seconds), the health endpoint returns `mode: "disabled"` instead of `mode: "true"`. The integration test explicitly fails on `"disabled"` mode, which caused the first deployment attempt failure (HTTP 404 due to stale deployment). If the `az` CLI step fails silently, the endpoint will permanently report `"disabled"`.

**Mitigation:** The `validate-app.sh` hook checks reachability but does not validate the response body. Consider adding a body assertion to the hook.

### 2. Unauthenticated Public Endpoint (Severity: LOW)

`fn-health` with `authLevel: "anonymous"` is directly reachable at `https://func-sample-app-001.azurewebsites.net/api/health` without any authentication. While the response contains no sensitive data, it confirms the existence and reachability of the Function App. There is no rate limiting beyond Azure's built-in consumption plan throttling.

**Mitigation:** Acceptable for a health endpoint. If abuse occurs, add IP allowlisting or move to APIM with a separate product/subscription that doesn't require user auth.

### 3. Schema/Implementation Divergence (Severity: LOW)

The `HealthCheckResponseSchema` in `packages/schemas` expects `{status: HealthStatus, timestamp, version?, checks?}` with status values of `"healthy" | "degraded" | "unhealthy"`. The actual endpoint returns `{status: "ok", mode: "..."}`. The string `"ok"` is not a valid `HealthStatus` enum value. Any consumer that imports the schema and validates the real response will get a Zod validation error.

**Mitigation:** Either update `fn-health.ts` to conform to the schema, or document the schema as aspirational/v2 and add a separate `HealthProbeResponseSchema` for the current shape.

## Long-Term Technical Debt

### 1. Configuration Drift: CI/CD vs Terraform

`STRICT_HEALTH_MODE` is managed outside Terraform state. As the infrastructure grows, this creates a precedent for "shadow configuration" that isn't captured in IaC. If Terraform modules later define `app_settings` blocks comprehensively, they may overwrite or conflict with CI-injected settings.

**Recommendation:** When the next Terraform PR touches Function App settings, consolidate all app settings into a single Terraform `app_settings` map with `lifecycle { ignore_changes }` for CI-managed keys, or move `STRICT_HEALTH_MODE` into Terraform variables.

### 2. No APIM Policy for Health Endpoint

All other backend endpoints are proxied through APIM (`apim-sample-app-001`), which provides rate limiting, request logging, and auth policy enforcement. The health endpoint bypasses APIM entirely — it's accessed via the direct Function App URL. This means health endpoint traffic is not visible in APIM analytics, and there's no centralized rate limiting.

**Recommendation:** Consider adding an APIM operation for `/health` with a pass-through policy (no auth required) to get unified traffic visibility.

### 3. Hardcoded `STRICT_HEALTH_MODE=true` Value

The value `true` is hardcoded in `deploy-backend.yml`. There's no mechanism to set it to `false` or any other value per environment. If multiple environments (dev/staging/prod) are introduced, the setting cannot be differentiated. The endpoint also doesn't validate the value — any string is accepted and echoed back.

**Recommendation:** Parameterize via GitHub Actions environment variables or Terraform `var.strict_health_mode` per deployment environment.

## Suggested Reviewers

| Reviewer | Rationale | Lines Changed |
|----------|-----------|---------------|
| RomanKaliupinMelonusa | Primary author and sole contributor to the feature branch | 1,764 |

> **Note:** Bus factor is 1 — a single contributor authored all changes. Recommend a second reviewer with Azure Functions or CI/CD expertise for the `deploy-backend.yml` and `authLevel: "anonymous"` design decisions.
