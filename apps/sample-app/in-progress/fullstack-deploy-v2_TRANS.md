# Transition Log — fullstack-deploy-v2

## Workflow
- **Type:** Full-Stack
- **Started:** 2026-03-24
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
### 2026-03-24T01:09:37.691Z — push-code
Timeout after 900000ms waiting for session.idle

### 2026-03-24T01:28:35.858Z — integration-test
{"fault_domain":"backend","diagnostic_trace":"All endpoints return HTTP 404 — 0 functions loaded on func-sample-app-001. App Insights error trace (2026-03-24T01:22:42): Error [ERR_MODULE_NOT_FOUND]: Worker was unable to load entry point dist/src/functions/fn-demo-login.js: Cannot find package @branded/schemas imported from /home/site/wwwroot/dist/src/functions/fn-demo-login.js. Root cause: deploy-backend.yml Prepare deploy artifact step only packages @azure/functions dependency, but fn-demo-login.js has a runtime import of @branded/schemas (DemoLoginRequestSchema used for request validation). The compiled JS preserves this import. Fix: Either (1) add @branded/schemas + zod to the deploy package.json dependencies, or (2) switch backend build to esbuild bundling so all dependencies are inlined and no external packages are needed at deploy time. This also causes fn-hello to be unreachable because the function host reports 0 functions loaded / No HTTP routes mapped when any entry point file fails to import."}

### 2026-03-24T01:30:51.784Z — reset-for-dev
Redevelopment cycle 1/5: All endpoints return HTTP 404 — 0 functions loaded on func-sample-app-001. App Insights error trace (2026-03-24T01:22:42): Error [ERR_MODULE_NOT_FOUND]: Worker was unable to load entry point dist/src/functions/fn-demo-login.js: Cannot find package @branded/schemas imported from /home/site/wwwroot/dist/src/functions/fn-demo-login.js. Root cause: deploy-backend.yml Prepare deploy artifact step only packages @azure/functions dependency, but fn-demo-login.js has a runtime import of @branded/schemas (DemoLoginRequestSchema used for request validation). The compiled JS preserves this import. Fix: Either (1) add @branded/schemas + zod to the deploy package.json dependencies, or (2) switch backend build to esbuild bundling so all dependencies are inlined and no external packages are needed at deploy time. This also causes fn-hello to be unreachable because the function host reports 0 functions loaded / No HTTP routes mapped when any entry point file fails to import.. Reset 5 items: backend-dev, backend-unit-test, integration-test, push-code, poll-ci

### 2026-03-24T01:48:48.142Z — integration-test
{"fault_domain":"backend+infra","diagnostic_trace":"All 7 integration tests fail — every endpoint returns HTTP 404 (0 functions loaded on func-sample-app-001). Root cause: deploy-backend.yml Prepare deploy artifact step copies type: pkg.type into the deploy package.json, producing {\"type\":\"module\"} in the deployed artifact. But esbuild.config.mjs outputs format: \"cjs\" (CommonJS). Node.js sees type=module and tries to parse CJS files as ESM, failing with require-is-not-defined before the function host initializes (App Insights shows zero telemetry — crash happens pre-init). Fix: In .github/workflows/deploy-backend.yml, remove the line `type: pkg.type` from the Prepare deploy artifact step (line ~91 in committed code). An unstaged local fix already exists in the working tree but was never committed. The deploy package.json must NOT include type:module when esbuild outputs CJS. Additionally: backend package.json test:integration script uses deprecated --testPathPattern (should be --testPathPatterns for Jest 30+) — fixed locally. Failed tests: fn-hello(live): returns 200 default greeting (got 404), returns 200 custom greeting (got 404), returns 400 long name (got 404); fn-demo-login(live): returns 200 valid creds (got 404), returns 401 invalid creds (got 404), returns 400 missing fields (got 404), returns 400 invalid JSON (got 404)."}

### 2026-03-24T01:49:04.006Z — reset-for-dev
Redevelopment cycle 2/5: All 7 integration tests fail — every endpoint returns HTTP 404 (0 functions loaded on func-sample-app-001). Root cause: deploy-backend.yml Prepare deploy artifact step copies type: pkg.type into the deploy package.json, producing {"type":"module"} in the deployed artifact. But esbuild.config.mjs outputs format: "cjs" (CommonJS). Node.js sees type=module and tries to parse CJS files as ESM, failing with require-is-not-defined before the function host initializes (App Insights shows zero telemetry — crash happens pre-init). Fix: In .github/workflows/deploy-backend.yml, remove the line `type: pkg.type` from the Prepare deploy artifact step (line ~91 in committed code). An unstaged local fix already exists in the working tree but was never committed. The deploy package.json must NOT include type:module when esbuild outputs CJS. Additionally: backend package.json test:integration script uses deprecated --testPathPattern (should be --testPathPatterns for Jest 30+) — fixed locally. Failed tests: fn-hello(live): returns 200 default greeting (got 404), returns 200 custom greeting (got 404), returns 400 long name (got 404); fn-demo-login(live): returns 200 valid creds (got 404), returns 401 invalid creds (got 404), returns 400 missing fields (got 404), returns 400 invalid JSON (got 404).. Reset 5 items: backend-dev, backend-unit-test, integration-test, push-code, poll-ci

### 2026-03-24T02:01:10.503Z — integration-test
{"fault_domain":"backend+infra","diagnostic_trace":"All 7 integration tests fail with HTTP 404 (0 functions loaded on func-sample-app-001). App Insights has zero telemetry — crash happens pre-init. Root cause: TWO unfixed issues in committed code at HEAD (21aa823): (1) .github/workflows/deploy-backend.yml line 94 still has `type: pkg.type` which copies type:module into the deploy package.json. (2) apps/sample-app/backend/package.json still has \"type\":\"module\". esbuild outputs format:cjs but Node.js sees type=module and rejects CJS with require-is-not-defined before Functions host starts. A working-tree fix exists in .github/workflows/deploy-backend.yml (removes the type: pkg.type line) but was NEVER COMMITTED — git status shows `M .github/workflows/deploy-backend.yml`. Fix: commit the existing working-tree change to .github/workflows/deploy-backend.yml (remove line 94: type: pkg.type) and redeploy. The deploy package.json must NOT include type:module when esbuild outputs CJS. Failed tests: fn-hello(live) returns 200 default greeting (got 404), returns 200 custom greeting (got 404), returns 400 long name (got 404); fn-demo-login(live) returns 200 valid creds (got 404), returns 401 invalid creds (got 404), returns 400 missing fields (got 404), returns 400 invalid JSON (got 404)."}

### 2026-03-24T02:01:21.333Z — reset-for-dev
Redevelopment cycle 3/5: All 7 integration tests fail with HTTP 404 (0 functions loaded on func-sample-app-001). App Insights has zero telemetry — crash happens pre-init. Root cause: TWO unfixed issues in committed code at HEAD (21aa823): (1) .github/workflows/deploy-backend.yml line 94 still has `type: pkg.type` which copies type:module into the deploy package.json. (2) apps/sample-app/backend/package.json still has "type":"module". esbuild outputs format:cjs but Node.js sees type=module and rejects CJS with require-is-not-defined before Functions host starts. A working-tree fix exists in .github/workflows/deploy-backend.yml (removes the type: pkg.type line) but was NEVER COMMITTED — git status shows `M .github/workflows/deploy-backend.yml`. Fix: commit the existing working-tree change to .github/workflows/deploy-backend.yml (remove line 94: type: pkg.type) and redeploy. The deploy package.json must NOT include type:module when esbuild outputs CJS. Failed tests: fn-hello(live) returns 200 default greeting (got 404), returns 200 custom greeting (got 404), returns 400 long name (got 404); fn-demo-login(live) returns 200 valid creds (got 404), returns 401 invalid creds (got 404), returns 400 missing fields (got 404), returns 400 invalid JSON (got 404).. Reset 5 items: backend-dev, backend-unit-test, integration-test, push-code, poll-ci

### 2026-03-24T02:12:41.160Z — integration-test
{"fault_domain":"backend+infra","diagnostic_trace":"All 7 integration tests fail with HTTP 404 (0 functions loaded). App Insights confirms: ReferenceError: Worker was unable to load entry point dist/src/functions/fn-demo-login.js: module is not defined in ES module scope. /home/site/wwwroot/package.json contains type:module but esbuild outputs CJS (format:cjs). Root cause: .github/workflows/deploy-backend.yml line 94 still has type: pkg.type in committed code at HEAD (43e1155), which copies type:module into the deploy package.json. A working-tree fix exists (git status shows M .github/workflows/deploy-backend.yml removing that line) but was NEVER COMMITTED — commit ff85a2f only changed state/log files, not the workflow file itself. Fix: (1) commit the existing working-tree change to .github/workflows/deploy-backend.yml (remove line 94: type: pkg.type), (2) push and redeploy. The deploy package.json must NOT include type:module when esbuild outputs CJS. Failed tests: fn-hello(live) 3/3 failed (expected 200/200/400, all got 404); fn-demo-login(live) 4/4 failed (expected 200/401/400/400, all got 404)."}

### 2026-03-24T02:12:58.520Z — reset-for-dev
Redevelopment cycle 4/5: All 7 integration tests fail with HTTP 404 (0 functions loaded). App Insights confirms: ReferenceError: Worker was unable to load entry point dist/src/functions/fn-demo-login.js: module is not defined in ES module scope. /home/site/wwwroot/package.json contains type:module but esbuild outputs CJS (format:cjs). Root cause: .github/workflows/deploy-backend.yml line 94 still has type: pkg.type in committed code at HEAD (43e1155), which copies type:module into the deploy package.json. A working-tree fix exists (git status shows M .github/workflows/deploy-backend.yml removing that line) but was NEVER COMMITTED — commit ff85a2f only changed state/log files, not the workflow file itself. Fix: (1) commit the existing working-tree change to .github/workflows/deploy-backend.yml (remove line 94: type: pkg.type), (2) push and redeploy. The deploy package.json must NOT include type:module when esbuild outputs CJS. Failed tests: fn-hello(live) 3/3 failed (expected 200/200/400, all got 404); fn-demo-login(live) 4/4 failed (expected 200/401/400/400, all got 404).. Reset 5 items: backend-dev, backend-unit-test, integration-test, push-code, poll-ci


> ⚠️ This file is auto-generated by `npm run pipeline:status`. Do not edit manually.
