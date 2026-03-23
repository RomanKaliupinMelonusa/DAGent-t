
Running 4 tests using 4 workers

[1A[2K[1/4] [chromium] › e2e/login.spec.ts:37:7 › Demo Login › sign out returns to login form
[1A[2K[2/4] [chromium] › e2e/login.spec.ts:18:7 › Demo Login › rejects invalid credentials
[1A[2K[3/4] [chromium] › e2e/login.spec.ts:27:7 › Demo Login › logs in with valid credentials and shows user name
[1A[2K[4/4] [chromium] › e2e/login.spec.ts:11:7 › Demo Login › shows login form when unauthenticated
[1A[2K  4 passed (8.1s)

To open last HTML report run:
[36m[39m
[36m  npx playwright show-report[39m
[36m[39m

### Agent Manual UI Browser Audit
- **Scope Executed:** Feature/Infra-Scoped verification (APIM unified API + frontend URL routing)
- **Pages Visited:** Homepage (login form), authenticated state (post-login)
- **Actions Performed:**
  1. Navigated to SWA URL — verified HTML loads, login form renders with all three testids (demo-username, demo-password, demo-login-submit)
  2. Entered demo/demopass credentials and clicked Sign In
  3. Intercepted login API call — confirmed POST https://apim-sample-app-001.azure-api.net/auth/login returned HTTP 200
  4. Verified authenticated state shows "Demo User" display name
  5. Clicked sign-out button — confirmed return to login form
  6. Monitored browser console — zero JavaScript errors
  7. Checked for data-testid="error-banner" at every step — never visible
- **Observations:**
  - The previous failure (attempt 4) was caused by APIM having separate `/demo-auth` and `/sample` path prefixes, but the frontend calling without prefixes. This was fixed by the backend-dev consolidating both into a unified API at root path="" (commit e51ffcd).
  - CORS preflight returns 200 for both /auth/login and /hello
  - Access-Control-Allow-Origin correctly returns the SWA origin
  - Login API returns valid token and "Demo User" display name
  - All 4 Playwright E2E tests pass (form renders, invalid creds rejected, valid login works, sign-out works)
- **Verdict:** PASS
