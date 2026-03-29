# Playwright E2E Test Results — user-profile-2 (Attempt 2)

## Environment
- **SWA URL:** https://wonderful-grass-0ef9b920f.4.azurestaticapps.net
- **APIM Gateway:** https://apim-sample-app-001.azure-api.net
- **APIM Sample API Base:** https://apim-sample-app-001.azure-api.net/sample
- **APIM Demo Auth Base:** https://apim-sample-app-001.azure-api.net/demo-auth
- **Auth Mode:** demo
- **Date:** 2026-03-29T20:30:00Z

## Previous Failure Resolution

Attempt 1 failed because `NEXT_PUBLIC_API_BASE_URL` GitHub secret was set to `https://apim-sample-app-001.azure-api.net` (APIM root) instead of `https://apim-sample-app-001.azure-api.net/sample` (with path prefix). The frontend-dev agent correctly separated `NEXT_PUBLIC_DEMO_AUTH_URL` from `NEXT_PUBLIC_API_BASE_URL` in code, but the GitHub secrets were not updated.

**Fix applied in this session:**
1. Updated `NEXT_PUBLIC_API_BASE_URL` secret → `https://apim-sample-app-001.azure-api.net/sample`
2. Created `NEXT_PUBLIC_DEMO_AUTH_URL` secret → `https://apim-sample-app-001.azure-api.net/demo-auth`
3. Triggered frontend redeploy via `workflow_dispatch` (run ID: 23718313478) — completed successfully

**Verification:** Confirmed baked JS URLs in deployed bundles:
- apiClient: `https://apim-sample-app-001.azure-api.net/sample${path}` ✅
- demoAuth: `https://apim-sample-app-001.azure-api.net/demo-auth/auth/login` ✅

## Phase 1: HTTP Smoke Tests — ✅ PASSED
- HTTP status: 200
- HTML shell loads correctly (Next.js root div present)
- Demo login form renders
- Profile page route returns 200

## Phase 2: API Network Validation — ✅ PASSED
- Demo login via APIM: POST /demo-auth/auth/login → 200 (token received)
- CORS preflight GET /sample/profile: 200 (Access-Control-Allow-Origin matches SWA)
- CORS preflight PATCH /sample/profile: 200 (Access-Control-Allow-Origin matches SWA)
- GET /sample/profile with token: 200 → `{"id":"00000000-...","displayName":"Demo User","email":"demo@example.com","theme":"system"}`
- PATCH /sample/profile with token: 200 → `{"id":"00000000-...","displayName":"Test User","email":"demo@example.com","theme":"dark"}`

## Phase 3: E2E Test Audit — ✅ PASSED
- `e2e/profile.spec.ts` exists with 3 test cases covering:
  - Happy path: load profile, verify data, save changes, verify success banner
  - Negative test: intercepted 400 response, verify error banner
  - Navigation: Profile link in NavBar, click navigates to /profile
- Deep diagnostic instrumentation (console errors, failed requests) present in all tests
- Functional assertions verified: data loading, API response validation, success/error banners

## Phase 4: Playwright E2E Results — ✅ ALL PASSED (11/11)

### Feature-Scoped Tests (profile.spec.ts) — 3/3 ✅
- ✅ loads profile and saves updated display name (1.8s)
- ✅ shows error banner on 400 validation error (1.8s)
- ✅ shows Profile link in navigation (1.9s)

### Full Regression Suite — 11/11 ✅
- ✅ authenticated-hello.spec.ts — 4/4 passed
- ✅ login.spec.ts — 4/4 passed
- ✅ profile.spec.ts — 3/3 passed
- Total: 11 passed in 5.3s

## Phase 5: Agent Manual UI Browser Audit

### Agent Manual UI Browser Audit
- **Scope Executed:** Feature/Infra-Scoped verification (APIM routing fix validated)
- **Pages Visited:** / (login), /profile (profile page), /about (navigation check)
- **Actions Performed:**
  - Verified demo login form renders on /
  - Authenticated via APIM demo-auth endpoint (POST /demo-auth/auth/login → 200 with token)
  - Verified CORS preflight passes for both GET and PATCH /sample/profile
  - Verified GET /sample/profile returns correct profile data (displayName, email, theme)
  - Verified PATCH /sample/profile updates and returns merged profile
  - Full Playwright E2E suite run covers all interactive workflows
- **Observations:**
  - APIM routing correctly routes /sample/* to Function App /api/* endpoints
  - Demo auth URL correctly separated from API base URL
  - All CORS headers present and correct
  - No console errors, no failed requests, no error banners
  - Profile form loads with initial data, saves successfully, shows success banner
  - Error handling works correctly (400 response shows error banner)
  - NavBar shows Profile link, navigation works end-to-end
- **Verdict:** PASS
