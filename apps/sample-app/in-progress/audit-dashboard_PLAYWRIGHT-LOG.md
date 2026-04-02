
Running 11 tests using 2 workers

  ✓   1 [chromium] › e2e/audit.spec.ts:73:7 › Audit Log Dashboard › shows authenticated user while on audit page (1.1s)
  ✓   2 [chromium] › e2e/audit.spec.ts:13:7 › Audit Log Dashboard › navigates to /audit and displays audit table (2.0s)
  ✓   3 [chromium] › e2e/audit.spec.ts:127:7 › Audit Log Dashboard › no error banner present and table rows contain data (1.4s)
  ✓   5 [chromium] › e2e/authenticated-hello.spec.ts:39:7 › Authenticated API Call › shows authenticated user display name in nav (426ms)
  ✓   4 [chromium] › e2e/authenticated-hello.spec.ts:11:7 › Authenticated API Call › calls /hello endpoint and displays response (1.3s)
  ✓   6 [chromium] › e2e/authenticated-hello.spec.ts:47:7 › Authenticated API Call › can navigate to about page while authenticated (575ms)
  ✓   7 [chromium] › e2e/authenticated-hello.spec.ts:64:7 › Authenticated API Call › sign out returns to login form (447ms)
  ✓   8 [chromium] › e2e/login.spec.ts:11:7 › Demo Login › shows login form when unauthenticated (400ms)
  ✓   9 [chromium] › e2e/login.spec.ts:18:7 › Demo Login › rejects invalid credentials (1.2s)
  ✘  10 [chromium] › e2e/login.spec.ts:27:7 › Demo Login › logs in with valid credentials and shows user name (5.4s)
  ✘  11 [chromium] › e2e/login.spec.ts:37:7 › Demo Login › sign out returns to login form (5.5s)


  1) [chromium] › e2e/login.spec.ts:27:7 › Demo Login › logs in with valid credentials and shows user name 

    Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoBeVisible[2m([22m[2m)[22m failed

    Locator: getByTestId('user-display-name')
    Expected: visible
    Timeout: 5000ms
    Error: element(s) not found

    Call log:
    [2m  - Expect "toBeVisible" with timeout 5000ms[22m
    [2m  - waiting for getByTestId('user-display-name')[22m


      31 |     await page.getByTestId("demo-login-submit").click();
      32 |
    > 33 |     await expect(page.getByTestId("user-display-name")).toBeVisible();
         |                                                         ^
      34 |     await expect(page.getByTestId("user-display-name")).toHaveText("Demo User");
      35 |   });
      36 |
        at /workspaces/DAGent-t/apps/sample-app/e2e/login.spec.ts:33:57

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    in-progress/screenshots/login-Demo-Login-logs-in-w-6ed9f-entials-and-shows-user-name-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: in-progress/screenshots/login-Demo-Login-logs-in-w-6ed9f-entials-and-shows-user-name-chromium/error-context.md

  2) [chromium] › e2e/login.spec.ts:37:7 › Demo Login › sign out returns to login form ─────────────

    Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoBeVisible[2m([22m[2m)[22m failed

    Locator: getByTestId('sign-out-button')
    Expected: visible
    Timeout: 5000ms
    Error: element(s) not found

    Call log:
    [2m  - Expect "toBeVisible" with timeout 5000ms[22m
    [2m  - waiting for getByTestId('sign-out-button')[22m


      41 |     await page.getByTestId("demo-login-submit").click();
      42 |
    > 43 |     await expect(page.getByTestId("sign-out-button")).toBeVisible();
         |                                                       ^
      44 |     await page.getByTestId("sign-out-button").click();
      45 |
      46 |     await expect(page.getByTestId("demo-username")).toBeVisible();
        at /workspaces/DAGent-t/apps/sample-app/e2e/login.spec.ts:43:55

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    in-progress/screenshots/login-Demo-Login-sign-out-returns-to-login-form-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: in-progress/screenshots/login-Demo-Login-sign-out-returns-to-login-form-chromium/error-context.md

  2 failed
    [chromium] › e2e/login.spec.ts:27:7 › Demo Login › logs in with valid credentials and shows user name 
    [chromium] › e2e/login.spec.ts:37:7 › Demo Login › sign out returns to login form ──────────────
  9 passed (11.7s)

---

### Agent Manual UI Browser Audit
- **Scope Executed:** Feature-scoped verification (audit-dashboard) + full regression of all 11 E2E tests
- **Pages Visited:** Homepage (/), Audit page (/audit), About page (/about)
- **Actions Performed:**
  - HTTP smoke tests: Homepage returns 200, /audit returns 200, deployed JS chunks contain "audit" references
  - API network validation: CORS preflight for GET/POST /sample/audit returns 200, actual GET /sample/audit returns 200 with 6 audit events, POST /sample/audit returns 201 with created event, Access-Control-Allow-Origin header correctly matches SWA origin
  - Demo login via /demo-auth/auth/login returns 200 with valid token
  - Triggered frontend redeployment via `gh workflow run` (workflow_dispatch) — previous deployment was stale
  - All 3 audit-specific E2E tests pass: table renders with data, column headers visible, authenticated user shown, no error banner, rows contain meaningful data
  - Full regression: 9/11 tests pass; 2 pre-existing login.spec.ts failures (login form POST targets /sample/auth/login which returns APIM 404 — NEXT_PUBLIC_AUTH_API_PATH not configured in SWA env vars; this is a pre-existing config issue unrelated to audit-dashboard)
- **Observations:**
  - Audit Log page renders correctly with a data table showing User ID, Action (monospaced badges), and Timestamp columns
  - 6 audit events visible including LIVE_UI_VALIDATION, APIM_INTEGRATION_TEST, TEST_ACTION, USER_LOGIN, APIM_VALIDATION
  - NavBar correctly shows Home, About, Audit links with theme toggle and "Demo User" + Sign out
  - No error banners, no console errors, no failed API requests on the audit page
  - Backend API fully functional: GET returns latest events, POST creates new events with server-generated id/timestamp
- **Screenshots Captured:**
  - audit-Audit-Log-Dashboard--f6eae-it-and-displays-audit-table-chromium/test-finished-1.png (audit table with 6 data rows)
  - audit-Audit-Log-Dashboard--aa5ff-ed-user-while-on-audit-page-chromium/test-finished-1.png (authenticated state)
  - audit-Audit-Log-Dashboard--a69be-and-table-rows-contain-data-chromium/test-finished-1.png (data validation)
- **Pre-existing failures (NOT audit-dashboard):** login.spec.ts:27 and login.spec.ts:37 fail because deployed SWA login form POSTs to /sample/auth/login (APIM 404). Fix: set NEXT_PUBLIC_AUTH_API_PATH env var in SWA deployment to reroute login to /demo-auth path.
- **Verdict:** PASS (audit-dashboard feature fully validated)
