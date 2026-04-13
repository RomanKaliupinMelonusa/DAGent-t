Running 3 tests using 1 worker

[1A[2K[1/3] [chromium] › e2e/storefront-smoke.spec.ts:52:7 › Storefront Smoke Tests › homepage loads and renders
[1A[2K[chromium] › e2e/storefront-smoke.spec.ts:52:7 › Storefront Smoke Tests › homepage loads and renders

--- Browser Diagnostics for "homepage loads and renders" ---

[1A[2KFailed requests: [
  [32m'GET http://localhost:3000/__mrt/clear-browser-data - net::ERR_ABORTED'[39m
]

[1A[2K  1) [chromium] › e2e/storefront-smoke.spec.ts:52:7 › Storefront Smoke Tests › homepage loads and renders 

    Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoBeVisible[2m([22m[2m)[22m failed

    Locator: locator('#app-main')
    Expected: visible
    Timeout: 5000ms
    Error: element(s) not found

    Call log:
    [2m  - Expect "toBeVisible" with timeout 5000ms[22m
    [2m  - waiting for locator('#app-main')[22m


      54 |     await expect(page).toHaveTitle(/.+/); // Page has a title
      55 |     // The Retail React App renders a main content area (#app-main)
    > 56 |     await expect(page.locator('#app-main')).toBeVisible();
         |                                             ^
      57 |   });
      58 |
      59 |   test('can navigate to a category/PLP page', async ({ page }) => {
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/storefront-smoke.spec.ts:56:45

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/storefront-smoke-Storefron-1e0f7--homepage-loads-and-renders-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/storefront-smoke-Storefron-1e0f7--homepage-loads-and-renders-chromium/error-context.md


[1A[2K[2/3] [chromium] › e2e/storefront-smoke.spec.ts:59:7 › Storefront Smoke Tests › can navigate to a category/PLP page
[1A[2K[3/3] [chromium] › e2e/storefront-smoke.spec.ts:71:7 › Storefront Smoke Tests › product detail page shows product info
[1A[2K  1 failed
    [chromium] › e2e/storefront-smoke.spec.ts:52:7 › Storefront Smoke Tests › homepage loads and renders 
  2 passed (16.1s)
[1A[2K[2m[WebServer] [22m(node:23970) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
[2m[WebServer] [22m(Use `node --trace-deprecation ...` to show where the warning was created)