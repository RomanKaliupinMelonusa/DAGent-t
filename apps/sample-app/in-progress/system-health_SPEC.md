# Feature: System Health & CI Integration

## Goal
Implement a secure health-check endpoint for the backend that reports deployment status via a CI-injected environment variable, proving the end-to-end self-healing loop from integration test failure through triage-driven CI/CD reset.

## Requirements
- [ ] **Backend Endpoint:** Create `apps/sample-app/backend/src/functions/fn-health.ts` serving `GET /api/health`.
- [ ] **Endpoint Logic:** Return `{ status: "ok", mode: process.env.STRICT_HEALTH_MODE || "disabled" }`.
- [ ] **CI/CD Modification:** Modify `.github/workflows/deploy-backend.yml` — add a post-deploy step that injects `STRICT_HEALTH_MODE=true` as an Azure Function App Setting via `az functionapp config appsettings set`.
- [ ] **Integration Test:** Create `apps/sample-app/backend/src/functions/__tests__/health.integration.test.ts` asserting the deployed `/api/health` endpoint returns `mode: "true"`. On failure (mode is `"disabled"`), the test MUST print: `"STRICT_HEALTH_MODE is missing. You must update .github/workflows/deploy-backend.yml, commit it to the working-tree, and ensure it deploys."`

## Scope
- **Schema:** None — the health response is a plain JSON object with no shared schema dependency.
- **Backend:** New Azure Function `fn-health.ts` at route `GET /api/health`, `authLevel: "anonymous"` (must be reachable by infrastructure probes without function keys).
- **Frontend:** None.
- **Infra:** No Terraform changes — the environment variable is injected by CI/CD, not IaC.

## Implementation Notes

### Phase 1 — Backend Endpoint (`fn-health.ts`)
- Follow the `fn-hello.ts` registration pattern: import from `@azure/functions`, register with `app.http()`.
- Route: `health`, Method: `GET`, authLevel: `anonymous`.
- Handler returns `{ status: "ok", mode: process.env.STRICT_HEALTH_MODE || "disabled" }`.
- No input validation needed — no parameters accepted.

### Phase 2 — CI/CD Workflow Modification (`deploy-backend.yml`)
- Add a new step **after** "Deploy to Azure Functions" (and after "Login to Azure (OIDC)"):
  ```yaml
  - name: Set STRICT_HEALTH_MODE app setting
    run: |
      az functionapp config appsettings set \
        --name ${{ vars.AZURE_FUNCTION_APP_NAME }} \
        --resource-group ${{ vars.AZURE_RESOURCE_GROUP }} \
        --settings STRICT_HEALTH_MODE=true
  ```
- Rationale: `Azure/functions-action@v1` deploys code only — it does not manage App Settings. A step-level `env:` would only affect the GitHub Actions runner, NOT the deployed Azure Function. The `az` CLI command mutates the data-plane configuration directly.
- Uses existing `vars.AZURE_RESOURCE_GROUP` (already configured for `regression-tests.yml`).

### Phase 3 — Integration Test (`health.integration.test.ts`)
- Follow the `smoke.integration.test.ts` pattern: `describeIntegration` gated by `RUN_INTEGRATION=true`, `apiFetch()` helper with `BASE_URL`.
- Assert `GET /health` returns `200` with `{ status: "ok", mode: "true" }`.
- On failure where `mode === "disabled"`: emit diagnostic via `console.error()` then `fail()` with the exact string: `"STRICT_HEALTH_MODE is missing. You must update .github/workflows/deploy-backend.yml, commit it to the working-tree, and ensure it deploys."`
- This diagnostic string contains `.github/workflows/` which triggers the Triage Engine to override the fault domain to `cicd` and reset deployment nodes — proving the self-healing loop.

### Phase 4 — Git Commit Strategy (STRICT: Two Separate Scoped Commits)
**Do NOT use `agent-commit.sh all`.** Cross-scope changes require separate commits per `git-operations.md`:
1. `bash tools/autonomous-factory/agent-commit.sh backend "feat(backend): add health endpoint"`
2. `bash tools/autonomous-factory/agent-commit.sh cicd "feat(ci): inject STRICT_HEALTH_MODE into deployment"`

These MUST run sequentially (backend first, then cicd) to prevent parallel-agent race conditions.

## Testing Mandate (CRITICAL)
- **Unit Tests:** Not required — the function has zero branching logic beyond a single env var fallback. The integration test covers the deployed behavior.
- **End-to-End (E2E):** The integration test (`health.integration.test.ts`) serves as the E2E validation. It runs against the live deployed endpoint gated by `RUN_INTEGRATION=true`.

## Launch Commands
```bash
# 1. Initialize the Full-Stack state machine
APP_ROOT=apps/sample-app npm run pipeline:init health-check-ci Full-Stack

# 2. Launch the orchestrator
APP_ROOT=apps/sample-app npm run agent:run -- --app apps/sample-app health-check-ci
```

## Acceptance Criteria
1. `GET /api/health` is live and returns `{ status: "ok", mode: "true" }` when `STRICT_HEALTH_MODE` is set.
2. `GET /api/health` returns `{ status: "ok", mode: "disabled" }` when `STRICT_HEALTH_MODE` is absent (local dev fallback).
3. `.github/workflows/deploy-backend.yml` contains the `az functionapp config appsettings set` step after the deploy step.
4. Integration test passes against the deployed endpoint and emits the diagnostic string on CI misconfiguration.
5. Backend and CI/CD changes are committed as **two separate scoped commits** (not a single `all`-scope commit).

## References
- `apps/sample-app/backend/src/functions/fn-hello.ts` — function registration pattern template.
- `apps/sample-app/backend/src/functions/__tests__/smoke.integration.test.ts` — integration test pattern template.
- `.github/workflows/deploy-backend.yml` — target CI/CD workflow to modify.
- `apps/sample-app/.apm/instructions/always/git-operations.md` — authoritative git scope rules.
- `tools/autonomous-factory/agent-commit.sh` — commit wrapper (use `backend` and `cicd` scopes separately).
