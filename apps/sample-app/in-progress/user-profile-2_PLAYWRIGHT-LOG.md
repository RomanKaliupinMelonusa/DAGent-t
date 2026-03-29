# Playwright E2E Test Results — user-profile-2

## Environment
- **SWA URL:** https://wonderful-grass-0ef9b920f.4.azurestaticapps.net
- **APIM Gateway:** https://apim-sample-app-001.azure-api.net
- **APIM Sample API Base:** https://apim-sample-app-001.azure-api.net/sample
- **Auth Mode:** demo
- **Date:** 2026-03-29T20:04:00Z

## Phase 1: HTTP Smoke Tests — ✅ PASSED
- HTTP status: 200
- HTML shell loads correctly (Next.js root div present)
- Demo login form renders (data-testid="demo-login-submit" found)

## Phase 2: API Network Validation — ✅ PASSED
- CORS preflight GET /profile: 200 (Access-Control-Allow-Origin correct)
- CORS preflight PATCH /profile: 200 (Access-Control-Allow-Origin correct)
- GET /sample/profile: 200 (correct response body)
- PATCH /sample/profile: 200 (merged response body correct)

## Phase 3: E2E Test Audit
- `e2e/profile.spec.ts` exists with 3 test cases
- Enhanced happy path test to verify: initial data loads (value="Demo User"), API response 200, success banner
- Enhanced nav link test to verify URL navigation + form load
- Deep diagnostic instrumentation (console errors, failed requests) present in all tests

## Phase 4: Playwright E2E Results — ❌ PARTIAL FAILURE (2/3 passed)

### ✅ shows Profile link in navigation (1.8s)
### ✅ shows error banner on 400 validation error (2.0s)
### ❌ loads profile and saves updated display name (6.7s)

**Root cause:** The deployed frontend calls `GET https://apim-sample-app-001.azure-api.net/profile` which returns 404. The correct URL is `https://apim-sample-app-001.azure-api.net/sample/profile` (with `/sample` path prefix).

**Diagnostic:** The `NEXT_PUBLIC_API_BASE_URL` GitHub secret is set to `https://apim-sample-app-001.azure-api.net` (APIM gateway root), but the sample API in APIM is registered with path prefix `"sample"` (Terraform: `azurerm_api_management_api.sample.path = "sample"`). The frontend's `apiClient.ts` builds URLs as `${NEXT_PUBLIC_API_BASE_URL}${path}`, producing `https://apim-sample-app-001.azure-api.net/profile` instead of `https://apim-sample-app-001.azure-api.net/sample/profile`.

**Why existing endpoints still work:** `/hello` and `/auth/login` appear to have root-level duplicate routes in APIM (from a legacy or parallel API configuration), so they respond at both `/hello` and `/sample/hello`. The new `/profile` endpoint was only added to the sample API (path prefix = `"sample"`), so it only works at `/sample/profile`.

**Browser diagnostics captured:**
```
Console errors:
Failed to load resource: the server responded with a status of 404 (Resource Not Found)

Failed requests:
GET https://apim-sample-app-001.azure-api.net/profile - 404
```

## Fix Required
Update the GitHub secret `NEXT_PUBLIC_API_BASE_URL` from `https://apim-sample-app-001.azure-api.net` to `https://apim-sample-app-001.azure-api.net/sample`. Note: this may require also setting `NEXT_PUBLIC_AUTH_API_PATH` to a value that resolves the demo-auth login path correctly, since `demoAuthContext.tsx` builds the login URL as `${NEXT_PUBLIC_API_BASE_URL}${NEXT_PUBLIC_AUTH_API_PATH}/auth/login`.

Alternative fix: Add the `/profile` operations to a root-level APIM API (without path prefix) so all endpoints are accessible at both `/profile` and `/sample/profile`.
