# Transition Log — fullstack-deploy-test

## Workflow
- **Type:** Full-Stack
- **Started:** 2026-03-23
- **Deployed URL:** [To be filled after deployment]

## Implementation Notes
[To be filled by Dev agents during implementation]

## Checklist
### Pre-Deploy
- [x] Development Complete — Schemas (@schema-dev)
- [x] Development Complete — Backend (@backend-dev)
- [x] Development Complete — Frontend (@frontend-dev)
- [x] Unit Tests Passed — Backend (@backend-test)
- [x] Unit Tests Passed — Frontend (@frontend-ui-test)
### Deploy
- [ ] Code Pushed to Origin (@deploy-manager)
- [ ] CI Workflows Passed (@deploy-manager)
### Post-Deploy
- [ ] Integration Tests Passed (@backend-test)
- [ ] Live UI Validated (@frontend-ui-test)
### Finalize
- [ ] Dead Code Eliminated (@code-cleanup)
- [ ] Docs Updated & Archived (@docs-expert)
- [ ] PR Created & Merged to Main (@pr-creator)

## Error Log
### 2026-03-23T18:29:04.798Z — poll-ci
Deploy Backend PASSED, Deploy Frontend PASSED, Deploy Infrastructure FAILED (pre-existing: OIDC SP lacks Entra ID app-registration privileges — 403 Authorization_RequestDenied; infra was already applied locally)

### 2026-03-23T18:34:11.832Z — poll-ci
Deploy Backend PASSED, Deploy Frontend PASSED, Deploy Infrastructure FAILED (same pre-existing issue, 2nd attempt): OIDC SP lacks Entra ID Application.ReadWrite.All privileges — 403 Authorization_RequestDenied on azuread_application.main and azuread_application.cicd; also azurerm_resource_group.main already exists and needs state import. This is an Azure IAM permissions issue, not fixable from code. Infra was already applied locally.

### 2026-03-23T18:39:08.733Z — poll-ci
Deploy Backend PASSED, Deploy Frontend PASSED, Deploy Infrastructure FAILED (3rd attempt, same root cause): OIDC service principal lacks Entra ID Application.ReadWrite.All — 403 Authorization_RequestDenied on azuread_application.main and azuread_application.cicd; azurerm_resource_group.main needs state import. No code changes since last attempt. Requires Azure IAM admin to grant Application.ReadWrite.All to the GitHub Actions OIDC SP, and terraform state import for the pre-existing resource group. Infrastructure was already applied locally.

### 2026-03-23T19:11:12.499Z — poll-ci
Timeout after 1800000ms waiting for session.idle

### 2026-03-23T19:43:20.943Z — integration-test
{"fault_domain":"backend","diagnostic_trace":"Function app func-sample-app-001 has 0 functions loaded. All endpoints return HTTP 404. Root cause from App Insights (2026-03-23T19:38:15Z): ERR_MODULE_NOT_FOUND — Worker was unable to load entry point dist/src/functions/fn-demo-login.js: Cannot find package \u0027zod\u0027 imported from /home/site/wwwroot/dist/src/schemas/index.js. The zod dependency is missing from the deployed package. The deploy-backend CI zip likely excluded node_modules or zod is not in backend/package.json dependencies. Fix: ensure zod is listed in backend/package.json dependencies (not just devDependencies) and that the CI zip includes node_modules. Affected endpoints: GET /api/hello (404), POST /api/auth/login (404). No integration tests could run — 0 functions are registered."}

### 2026-03-23T19:45:08.875Z — reset-for-dev
Redevelopment cycle 1/5: Function app func-sample-app-001 has 0 functions loaded. All endpoints return HTTP 404. Root cause from App Insights (2026-03-23T19:38:15Z): ERR_MODULE_NOT_FOUND — Worker was unable to load entry point dist/src/functions/fn-demo-login.js: Cannot find package 'zod' imported from /home/site/wwwroot/dist/src/schemas/index.js. The zod dependency is missing from the deployed package. The deploy-backend CI zip likely excluded node_modules or zod is not in backend/package.json dependencies. Fix: ensure zod is listed in backend/package.json dependencies (not just devDependencies) and that the CI zip includes node_modules. Affected endpoints: GET /api/hello (404), POST /api/auth/login (404). No integration tests could run — 0 functions are registered.. Reset 5 items: backend-dev, backend-unit-test, integration-test, push-code, poll-ci

### 2026-03-23T19:56:08.272Z — live-ui
Timeout after 1200000ms waiting for session.idle

### 2026-03-23T19:56:09.496Z — reset-for-dev
Redevelopment cycle 2/5: Timeout after 1200000ms waiting for session.idle. Reset 5 items: backend-dev, backend-unit-test, live-ui, push-code, poll-ci

### 2026-03-23T20:25:34.972Z — integration-test
{"fault_domain":"backend","diagnostic_trace":"Function app func-sample-app-001 still has 0 functions loaded after esbuild fix (commit 11d1675). Previous error was ERR_MODULE_NOT_FOUND for zod. New error from App Insights (2026-03-23T20:21:54Z): Worker was unable to load entry point dist/src/functions/fn-demo-login.js: Dynamic require of \"util\" is not supported. Root cause: esbuild.config.mjs uses format:\"esm\" which cannot handle CJS require(\u0027util\u0027) calls in bundled dependencies. Fix: either (1) add \"util\" and other Node built-ins to the external array in esbuild.config.mjs, (2) switch format to \"cjs\", or (3) add banner with import { createRequire } from \"module\"; const require = createRequire(import.meta.url); to shim require() for Node built-ins. All endpoints return HTTP 404 — no integration tests could run."}

### 2026-03-23T20:38:20.462Z — reset-for-dev
Redevelopment cycle 3/5: Function app func-sample-app-001 still has 0 functions loaded after esbuild fix (commit 11d1675). Previous error was ERR_MODULE_NOT_FOUND for zod. New error from App Insights (2026-03-23T20:21:54Z): Worker was unable to load entry point dist/src/functions/fn-demo-login.js: Dynamic require of "util" is not supported. Root cause: esbuild.config.mjs uses format:"esm" which cannot handle CJS require('util') calls in bundled dependencies. Fix: either (1) add "util" and other Node built-ins to the external array in esbuild.config.mjs, (2) switch format to "cjs", or (3) add banner with import { createRequire } from "module"; const require = createRequire(import.meta.url); to shim require() for Node built-ins. All endpoints return HTTP 404 — no integration tests could run.. Reset 5 items: backend-dev, backend-unit-test, integration-test, push-code, poll-ci


> ⚠️ This file is auto-generated by `npm run pipeline:status`. Do not edit manually.
