# Pipeline Updates — Hardening + Stack Decoupling

> **Branch:** `update/pipeline-hardening`
> **Scope:** 38 files changed, +1,077 / −323 lines across 4 commits
> **Tests:** 167 passing (107 triage + 8 manifest-schema + 30 apm-parity + 22 pipeline-fail-validation)

---

## Why These Changes Exist

A post-mortem of the `health-badge` pipeline run revealed **$130+ in wasted compute** caused by two systemic bugs:

1. **Premature code pushes** — `commitAndPushState()` pushed all local commits (including dev agent code) alongside state commits, triggering deploy workflows before the pipeline's official `push-app` step. When `push-app` later ran, the code was already remote → path filters didn't match → deployments never re-triggered.

2. **Reactive staleness detection only** — Agents discovered stale deployments _after_ running full test suites ($37 for live-ui, $8 for integration-test), with no proactive check before sessions.

Additionally, an architectural review identified that the orchestrator engine was tightly coupled to Azure-specific CLI commands, hardcoded workflow filenames, and cloud-specific agent identity text — making it impossible to use with any other cloud provider or framework.

---

## What Changed — End-to-End Flow

### Before (Broken Flow)

```
Dev agents write code → commitAndPushState() pushes EVERYTHING
  ↓
Deploy workflows trigger prematurely (against incomplete code)
  ↓
push-app runs → nothing new to push → deploy never re-triggers
  ↓
Post-deploy agents discover stale deployment → burn $37–93 diagnosing
  ↓
Triage has no "stale deployment" concept → routes to frontend-dev/backend-dev
  ↓
Dev agents re-run needlessly → another $96 wasted
  ↓
No proactive freshness check → expensive reactive loop repeats
```

**Orchestrator was also hardcoded:**
- `az functionapp function list` inline in TypeScript
- `az account show` hardcoded in preflight check
- Agent prompts baked with "Azure Functions v4", "Terraform (azurerm)", "SWA"
- CI workflow filenames hardcoded as string literals
- No separation between engine logic and app-specific cloud operations

### After (Fixed Flow)

```
Dev agents write code → commitAndPushState() checks: unpushed code files?
  ↓ YES → skip push (state stays local, pushed later by push-app)
  ↓ NO  → push with [skip ci] (safe — only in-progress/* files)
  ↓
push-app runs → pushes all code → deploy workflows trigger correctly
  ↓
poll-app-ci succeeds → verifyDeploymentFreshness() via HOOK
  ↓ (hook runs app-specific verification — e.g. az functionapp function list)
  ↓ warnings logged, non-fatal
  ↓
Before post-deploy agent session → runPreDeploySmokeCheck() via HOOK
  ↓ hook checks deployment freshness per item type
  ↓ EXIT 1 → deployment-stale reroute (skip agent, save $37)
  ↓ EXIT 0 → proceed to agent session
  ↓
Agent detects staleness → emits fault_domain: "deployment-stale"
  ↓
Triage routes to push-app + poll-app-ci ONLY (no dev resets)
  ↓
Re-deploy without re-running dev agents → save $96
```

**Orchestrator is now stack-agnostic:**
- Cloud CLI commands live in `.apm/hooks/` (bash scripts per app)
- Agent identity text lives in `.apm/instructions/` (markdown per app)
- CI workflow filenames come from `config.ciWorkflows` in `apm.yml`
- Environment variables come from `config.environment` dictionary
- Engine TypeScript has zero cloud CLI imports

---

## Changes by Category

### 1. Deploy Lifecycle Hardening

| Change | File | What |
|--------|------|------|
| Push guard | `watchdog.ts` | `commitAndPushState()` skips push when unpushed code files exist outside `in-progress/` and `archive/` — prevents premature deploy triggers |
| Deployment freshness check | `session-runner.ts` | `verifyDeploymentFreshness()` runs after `poll-app-ci` succeeds — warns if deployed artifacts don't match branch code |
| Pre-deploy smoke check | `session-runner.ts` | `runPreDeploySmokeCheck()` runs before post-deploy agent sessions — if stale, triggers `deployment-stale` reroute without burning an agent session ($8–37 saved per incident) |
| Post-deploy propagation delay | `session-runner.ts` | Increased from 30s to 60s, now applies on ALL attempts (not just first) |
| Scoped push SHAs | `session-runner.ts` | `lastPushedShas: Record<string, string>` per push item — prevents cross-contamination if `push-infra` and `push-app` run in same batch |

### 2. Triage & Fault Domain Improvements

| Change | File | What |
|--------|------|------|
| `deployment-stale` fault domain | `triage-schema.mjs`, `triage.ts`, `types.ts` | New fault domain that routes to `push-app + poll-app-ci` only — no dev item resets. Saves $96 per stale-deployment incident |
| Tier 3 keyword detection | `triage.ts` | "deployment stale", "NOT in deployed build", "never re-triggered" → auto-classified as `deployment-stale` |
| Agent diagnostic guidance | `agents.ts` | Post-deploy agents taught to emit `deployment-stale` instead of `frontend+infra` when they detect outdated artifacts |
| Cascading post-deploy resets | `pipeline-state.mjs` | `resetForDev()` now cascades to "done" post-deploy items when deploy items are reset — prevents stale `integration-test: done` after re-deploy |

### 3. Session Timeout Resilience

| Change | File | What |
|--------|------|------|
| Pre-timeout wrap-up signal | `session-runner.ts` | At 80% of session timeout (16 min for DEV items), injects a "commit what you have NOW" directive |
| Timeout salvage-for-draft | `session-runner.ts` | After 3+ timeout failures on a DEV item, triggers `salvageForDraft()` → opens Draft PR for human review instead of halting |

### 4. Stack Decoupling — Generic Environment Dictionary

| Before | After | File |
|--------|-------|------|
| `ctx.defaultSwaUrl`, `ctx.functionAppUrl`, etc. (5 Azure-specific fields) | `ctx.environment?.FRONTEND_URL`, `ctx.environment?.BACKEND_URL`, etc. | `agents.ts` (AgentContext interface) |
| `config.urls.swa`, `config.azureResources.functionAppName`, etc. | `config.environment: Record<string, string>` | `apm-types.ts` (ApmConfigSchema) |
| `urls:` + `azureResources:` blocks in apm.yml | Flat `environment:` dictionary with `${ENV_VAR}` interpolation | `apm.yml` |
| Hardcoded `"deploy-infra.yml"` string | `config.ciWorkflows.infraPlanFile` | `session-runner.ts` |
| Hardcoded CI filename lists | `config.ciWorkflows.filePatterns` array | `triage.ts`, `context-injection.ts` |

### 5. Stack Decoupling — Lifecycle Hooks

**Core change:** Cloud-specific shell commands extracted from TypeScript engine into app-provided bash scripts.

| Before (inline in engine) | After (hook delegation) | Hook script |
|---------------------------|------------------------|-------------|
| `az functionapp function list` in `verifyDeploymentFreshness()` | Delegates to `hooks.verifyDeployment` | `.apm/hooks/verify-deployment.sh` |
| `az functionapp function list` + `curl` anonymous endpoints in `runPreDeploySmokeCheck()` | Delegates to `hooks.smokeCheck` | `.apm/hooks/smoke-check.sh` |
| `az account show` in `checkAzureAuth()` | Delegates to `hooks.preflightAuth` | `.apm/hooks/preflight-auth.sh` |

New engine module: **`hooks.ts`** — `executeHook()` + `buildHookEnv()` utility. Hooks receive `config.environment` vars as env vars, plus orchestrator context (`APP_ROOT`, `REPO_ROOT`, `ITEM_KEY`).

**Hook contract:**

| Hook | Receives | Exit 0 | Exit 1 | Stdout |
|------|----------|--------|--------|--------|
| `verifyDeployment` | env vars | Always | N/A | Warnings (one per line) |
| `smokeCheck` | env vars + `ITEM_KEY` | Pass or inconclusive | Detected failure | Failure reason |
| `preflightAuth` | env vars | Authenticated | Not authenticated | Status message |

### 6. Stack Decoupling — Agent Prompt Identity

**Core change:** Cloud-specific agent identity moved from hardcoded TypeScript template strings to APM instruction `.md` files.

| Before (hardcoded in agents.ts) | After (APM instruction file) |
|---------------------------------|------------------------------|
| "specializing in **Azure Functions v4 with TypeScript** and **Terraform** (azurerm + azapi + azuread)" | Generic "senior backend developer" — identity from `backend/identity.md` |
| `az functionapp keys list --name ... --resource-group ...` auth script | Moved to `backend/integration-auth.md` |
| 40-line Terraform Validation Gate in `completionBlock()` | Moved to `infra/identity.md` |
| "validate the live SWA deployment" | Generic "validate the live frontend deployment" |
| "specializing in **Terraform** (azurerm + azapi + azuread)" | Generic "senior infrastructure engineer" — identity from `infra/identity.md` |
| Pre-completion esbuild validation with `fn-*.js` pattern | Moved to `backend/identity.md` |

New instruction files (`apps/sample-app/.apm/instructions/`):
- `backend/identity.md` — Azure Functions v4 + Terraform identity, CJS build validation
- `backend/integration-auth.md` — Function key retrieval via `az functionapp keys list`
- `infra/identity.md` — Terraform providers + validation gate (init/validate/plan)
- `backend/integration-testing.md` — Enhanced with integration test coverage mandate

The engine's `agents.ts` now renders a generic `## Environment` section from `ctx.environment` using a new `environmentContext()` helper, replacing hardcoded cloud variable references.

---

## Configuration Changes (apm.yml)

```yaml
# NEW: Lifecycle hooks
config:
  hooks:
    verifyDeployment: "bash .apm/hooks/verify-deployment.sh"
    smokeCheck: "bash .apm/hooks/smoke-check.sh"
    preflightAuth: "bash .apm/hooks/preflight-auth.sh"

  # CHANGED: flat dictionary replaces urls + azureResources blocks
  environment:
    FRONTEND_URL: "${SWA_URL}"
    BACKEND_URL: "${FUNCTION_APP_URL}"
    APIM_URL: "${APIM_URL}"
    FUNC_APP_NAME: "${AZURE_FUNCTION_APP_NAME}"
    RESOURCE_GROUP: "${AZURE_RESOURCE_GROUP}"
    APP_INSIGHTS_NAME: "${AZURE_APP_INSIGHTS_NAME}"

  # NEW: CI workflow patterns for dynamic signal detection
  ciWorkflows:
    filePatterns: ["deploy-backend.yml", "deploy-frontend.yml", ...]
    infraPlanFile: "deploy-infra.yml"
```

---

## New File Inventory

| File | Purpose |
|------|---------|
| `tools/autonomous-factory/src/hooks.ts` | Hook execution engine (`executeHook` + `buildHookEnv`) |
| `apps/sample-app/.apm/hooks/verify-deployment.sh` | Azure: compare local fn-*.ts functions against `az functionapp function list` |
| `apps/sample-app/.apm/hooks/smoke-check.sh` | Azure: pre-deploy staleness check per item type |
| `apps/sample-app/.apm/hooks/preflight-auth.sh` | Azure: verify `az account show` succeeds |
| `apps/sample-app/.apm/instructions/backend/identity.md` | Azure Functions v4 identity + build validation |
| `apps/sample-app/.apm/instructions/backend/integration-auth.md` | Function key retrieval auth script |
| `apps/sample-app/.apm/instructions/infra/identity.md` | Terraform provider list + validation gate |

---

## How to Adapt for a Different Cloud Stack

To port the pipeline to a non-Azure stack (e.g., AWS Lambda + CloudFront):

1. **Replace hook scripts** in `.apm/hooks/`:
   - `verify-deployment.sh` → `aws lambda list-functions` comparison
   - `smoke-check.sh` → `curl` against CloudFront distribution
   - `preflight-auth.sh` → `aws sts get-caller-identity`

2. **Replace instruction files** in `.apm/instructions/`:
   - `backend/identity.md` → Lambda + SAM/CDK identity
   - `backend/integration-auth.md` → AWS Secrets Manager key retrieval
   - `infra/identity.md` → CDK/CloudFormation validation gate

3. **Update `apm.yml` environment dictionary:**
   ```yaml
   environment:
     FRONTEND_URL: "${CLOUDFRONT_URL}"
     BACKEND_URL: "${API_GATEWAY_URL}"
     LAMBDA_FUNCTION_PREFIX: "${LAMBDA_PREFIX}"
     AWS_REGION: "${AWS_REGION}"
   ```

4. **Update CI workflow filenames** in `ciWorkflows.filePatterns`.

The orchestrator engine (`watchdog.ts`, `session-runner.ts`, `agents.ts`, `triage.ts`) requires **zero changes**.

---

## Known Limitations

| Limitation | Scope | Future Work |
|------------|-------|-------------|
| **GitHub CLI coupling** | 5× `gh` commands in `session-runner.ts` (PR posting, run download) | SCM adapter pattern (Phase 4) |
| **GitHub Actions assumption** | CI polling via `poll-ci.sh` assumes GH Actions API | Pluggable CI poller |
| **`fn-*` naming convention** | Hook scripts reference `fn-*.ts` pattern for Azure Functions | Configurable via hook env vars — no engine change needed |

---

## Test Coverage

All existing + new tests pass: **167 total**

| Suite | Tests | Covers |
|-------|-------|--------|
| `triage.test.ts` | 107 | `deployment-stale` routing, keyword detection, config-driven signals |
| `manifest-schema.test.ts` | 8 | `hooks`, `environment` dict, `ciWorkflows` schema validation |
| `apm-parity.test.ts` | 30 | All 16 agents compile, instruction files resolve, token budgets respected |
| `pipeline-fail-validation.test.ts` | 22 | `deployment-stale` in Zod fault domain enum, salvage-for-draft behavior |
