# Playwright E2E Test Results — audit-dashboard

## Test Run: Feature-Scoped (audit.spec.ts)

**Environment:**
- SWA_URL: https://wonderful-grass-0ef9b920f.4.azurestaticapps.net
- APIM_URL: https://apim-sample-app-001.azure-api.net
- AUTH_MODE: demo
- FUNCTION_APP_URL: https://apim-sample-app-001.azure-api.net/demo-auth

## Results: 2 FAILED / 0 PASSED

### Test 1: navigates to /audit and displays audit table — FAILED
- **Error:** `locator.click: Test timeout of 30000ms exceeded` — waiting for `getByRole('link', { name: 'Audit' })`
- **Root cause:** The deployed SWA build does NOT contain the "Audit" NavBar link. The NavBar only shows: Home, About, Profile.
- **Screenshot:** `in-progress/screenshots/audit-Audit-Log-Dashboard--f6eae-it-and-displays-audit-table-chromium/test-failed-1.png`

### Test 2: shows authenticated user while on audit page — FAILED
- **Error:** Same as Test 1 — "Audit" link not found in deployed NavBar.
- **Screenshot:** `in-progress/screenshots/audit-Audit-Log-Dashboard--aa5ff-ed-user-while-on-audit-page-chromium/test-failed-1.png`

## Diagnosis: DEPLOYMENT STALE

### Evidence
1. **Frontend `/audit` route returns Azure SWA native 404** (not a Next.js 404 page) — the page does not exist in the deployed build.
2. **No "audit" string found in ANY deployed JS chunk** — searched all 12 unique chunks, none contain the word "audit".
3. **Deployed NavBar has only 3 links: Home, About, Profile** — screenshot confirms no "Audit" link.
4. **The code builds locally with `/audit` route** — `next build` produces `out/audit.html` and the build output shows the `/audit` route.
5. **The commit adding the audit page (`c4206a4`) exists on the branch** — committed BEFORE the CI push (`c0c1e7d`), so the code was available at deploy time.
6. **The CI push commit (`c0c1e7d`) only modified `in-progress/` files** — which do NOT match the `apps/*/frontend/**` paths filter in `deploy-frontend.yml`, so it would NOT retrigger a frontend deployment.

### Backend API: FULLY WORKING
- `POST /demo-auth/auth/login` → 200 (token acquired)
- `GET /sample/audit` → 200 (returns audit log entries)
- `POST /sample/audit` → 201 (creates new audit log)
- CORS preflight for `/api/audit` → 200 with correct `Access-Control-Allow-Origin`

### Conclusion
The frontend deployment pipeline (`deploy-frontend.yml`) has NOT been triggered since the audit page was added. The `c4206a4` commit modified frontend files and should have triggered a build, but the subsequent `[skip ci]` state update commits may have interfered. The latest CI push (`c0c1e7d`) only touched `in-progress/` files, which do not match the `apps/*/frontend/**` path filter, so no frontend rebuild was triggered. A manual `workflow_dispatch` of `deploy-frontend.yml` or a new push modifying `apps/sample-app/frontend/**` is needed.

### Agent Manual UI Browser Audit
- **Scope Executed:** Feature/Infra-Scoped verification
- **Pages Visited:** / (home), /audit (404), /about (200)
- **Actions Performed:** HTTP smoke tests, API network validation, Playwright E2E test execution
- **Observations:** The deployed SWA shows Home/About/Profile nav links but NO Audit link. Navigating to /audit returns Azure SWA native 404. Login works, "Demo User" displayed. Backend API fully functional through APIM. CORS properly configured.
- **Screenshots Captured:** test-failed-1.png shows authenticated home page with NavBar containing only Home, About, Profile — no Audit link
- **Verdict:** FAIL (deployment-stale)
