# Playwright E2E Test Results — fullstack-deploy-test

**Date:** 2026-03-23T20:55:00Z
**SWA URL:** https://wonderful-grass-0ef9b920f.4.azurestaticapps.net
**Auth Mode:** demo

## Phase 1: HTTP Smoke Tests — ✅ PASSED

| Check | Result |
|---|---|
| SWA HTTP status | 200 ✅ |
| HTML shell loads | ✅ `__next` root found |
| Backend fn-hello (direct) | 401 ✅ (function loaded, requires auth) |
| Backend fn-demo-login (direct) | Listed ✅ |
| Functions loaded | 2/2 ✅ (fn-hello, fn-demo-login) |

## Phase 2: API Network Validation — ⚠️ PARTIAL PASS

### APIM with correct paths (manual curl)
| Endpoint | Method | Status | CORS |
|---|---|---|---|
| `/demo-auth/auth/login` | POST | 200 ✅ | `Access-Control-Allow-Origin` present ✅ |
| `/sample/hello` | GET | 200 ✅ | `Access-Control-Allow-Origin` present ✅ |
| CORS preflight `/demo-auth/auth/login` | OPTIONS | 200 ✅ | Headers correct ✅ |
| CORS preflight `/sample/hello` | OPTIONS | 200 ✅ | Headers correct ✅ |

### Frontend's actual URLs (what the deployed JS calls)
| Endpoint | Method | Status | Issue |
|---|---|---|---|
| `/auth/login` (no prefix) | POST | 404 ❌ | APIM has no API at this path |
| `/hello` (no prefix) | GET | 404 ❌ | APIM has no API at this path |

**Root Cause:** The deployed frontend's `NEXT_PUBLIC_API_BASE_URL` is set to `https://apim-sample-app-001.azure-api.net` (no path prefix), but APIM APIs are registered at `/demo-auth` and `/sample` path prefixes. The frontend calls `/auth/login` and `/hello` without prefixes, which returns APIM 404 (no CORS headers), causing browser "Failed to fetch" errors.

## Phase 4: Automated E2E Tests — ❌ 2 FAILED, 2 PASSED

```
Running 4 tests using 4 workers

✓ shows login form when unauthenticated (1.9s)
✓ rejects invalid credentials (3.1s)  ← passes because "Failed to fetch" still triggers error display
✘ logs in with valid credentials and shows user name (7.2s)
✘ sign out returns to login form (7.2s)

Error: "Failed to fetch" — login API call to /auth/login returns APIM 404 (no CORS headers),
browser blocks response, fetch() throws network error.
```

### Error Context (Page Snapshot on Failure)
```yaml
- heading "Sample App"
- paragraph: Sign in to continue
- textbox "Username": demo
- textbox "Password": demopass
- alert:
  - paragraph: Failed to fetch    ← CORS error from wrong APIM URL
- button "Sign in"
```

## Phase 5: Agent Manual UI Browser Audit

### Scope Executed: Infra-Scoped Verification (CORS/API connectivity)
- **Pages Visited:** / (login page)
- **Actions Performed:** Filled demo credentials, clicked Sign in
- **Observations:** Login fails with "Failed to fetch". Frontend calls `https://apim-sample-app-001.azure-api.net/auth/login` but APIM expects `/demo-auth/auth/login`. The APIM 404 response lacks CORS headers, so the browser blocks it entirely.
- **Verdict:** FAIL

## Diagnosis

### The URL Mismatch Problem

The frontend has TWO code paths that construct API URLs differently:

1. **demoAuthContext.tsx** (login):
   - `${BASE_URL}${AUTH_API_PATH}/auth/login`
   - Deployed: `https://apim-sample-app-001.azure-api.net/auth/login` ❌
   - Correct:  `https://apim-sample-app-001.azure-api.net/demo-auth/auth/login`

2. **apiClient.ts** (hello and other APIs):
   - `${BASE_URL}${path}` where path is `/hello`
   - Deployed: `https://apim-sample-app-001.azure-api.net/hello` ❌
   - Correct:  `https://apim-sample-app-001.azure-api.net/sample/hello`

Both share `NEXT_PUBLIC_API_BASE_URL` but need different APIM path prefixes.

### Recommended Fix

**Option A (Frontend code change):** Add `NEXT_PUBLIC_AUTH_BASE_URL` env var to `demoAuthContext.tsx` and set:
- `NEXT_PUBLIC_API_BASE_URL=https://apim-sample-app-001.azure-api.net/sample`
- `NEXT_PUBLIC_AUTH_BASE_URL=https://apim-sample-app-001.azure-api.net/demo-auth`

**Option B (Infra change):** Consolidate both APIM APIs into a single API at path `/api`, matching the function app's path structure. Then `NEXT_PUBLIC_API_BASE_URL=https://apim-sample-app-001.azure-api.net/api` works for all endpoints.
