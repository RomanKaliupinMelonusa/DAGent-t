Running 10 tests using 1 worker

[1A[2K[1/10] [chromium] › e2e/product-quick-view.spec.ts:109:9 › Product Quick View › Quick View button renders on PLP product tiles
[1A[2K  1) [chromium] › e2e/product-quick-view.spec.ts:109:9 › Product Quick View › Quick View button renders on PLP product tiles 

    TimeoutError: locator.waitFor: Timeout 30000ms exceeded.
    Call log:
    [2m  - waiting for locator('[data-testid="product-tile"], .product-tile, article').first() to be visible[22m


      79 |         .locator('[data-testid="product-tile"], .product-tile, article')
      80 |         .first()
    > 81 |         .waitFor({state: 'visible', timeout: 30_000})
         |          ^
      82 | }
      83 |
      84 | /**
        at navigateToPLP (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:81:10)
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:110:9

    [31mTest timeout of 60000ms exceeded.[39m




[1A[2K[2/10] [chromium] › e2e/product-quick-view.spec.ts:124:9 › Product Quick View › clicking Quick View button opens modal with product content
[1A[2K[chromium] › e2e/product-quick-view.spec.ts:124:9 › Product Quick View › clicking Quick View button opens modal with product content

--- Browser Diagnostics for "clicking Quick View button opens modal with product content" ---

[1A[2KFailed requests: [ [32m'GET http://localhost:3000/ - net::ERR_CONNECTION_REFUSED'[39m ]

[1A[2K  2) [chromium] › e2e/product-quick-view.spec.ts:124:9 › Product Quick View › clicking Quick View button opens modal with product content 

    Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/
    Call log:
    [2m  - navigating to "http://localhost:3000/", waiting until "domcontentloaded"[22m


      61 |  */
      62 | async function navigateToPLP(page: Page) {
    > 63 |     await page.goto('/', {waitUntil: 'domcontentloaded'})
         |                ^
      64 |
      65 |     // Try clicking a category nav link to reach a PLP
      66 |     const navLink = page.locator('nav a, [role="navigation"] a').first()
        at navigateToPLP (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:63:16)
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:125:15

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Product-5b0ee--modal-with-product-content-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[3/10] [chromium] › e2e/product-quick-view.spec.ts:191:9 › Product Quick View › Quick View modal closes with the close button
[1A[2K[chromium] › e2e/product-quick-view.spec.ts:191:9 › Product Quick View › Quick View modal closes with the close button

--- Browser Diagnostics for "Quick View modal closes with the close button" ---

[1A[2KFailed requests: [ [32m'GET http://localhost:3000/ - net::ERR_CONNECTION_REFUSED'[39m ]

[1A[2K  3) [chromium] › e2e/product-quick-view.spec.ts:191:9 › Product Quick View › Quick View modal closes with the close button 

    Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/
    Call log:
    [2m  - navigating to "http://localhost:3000/", waiting until "domcontentloaded"[22m


      61 |  */
      62 | async function navigateToPLP(page: Page) {
    > 63 |     await page.goto('/', {waitUntil: 'domcontentloaded'})
         |                ^
      64 |
      65 |     // Try clicking a category nav link to reach a PLP
      66 |     const navLink = page.locator('nav a, [role="navigation"] a').first()
        at navigateToPLP (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:63:16)
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:192:15

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Product-7d1af-loses-with-the-close-button-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[4/10] [chromium] › e2e/product-quick-view.spec.ts:215:9 › Product Quick View › Quick View modal closes with Escape key
[1A[2K[chromium] › e2e/product-quick-view.spec.ts:215:9 › Product Quick View › Quick View modal closes with Escape key

--- Browser Diagnostics for "Quick View modal closes with Escape key" ---

[1A[2KFailed requests: [ [32m'GET http://localhost:3000/ - net::ERR_CONNECTION_REFUSED'[39m ]

[1A[2K  4) [chromium] › e2e/product-quick-view.spec.ts:215:9 › Product Quick View › Quick View modal closes with Escape key 

    Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/
    Call log:
    [2m  - navigating to "http://localhost:3000/", waiting until "domcontentloaded"[22m


      61 |  */
      62 | async function navigateToPLP(page: Page) {
    > 63 |     await page.goto('/', {waitUntil: 'domcontentloaded'})
         |                ^
      64 |
      65 |     // Try clicking a category nav link to reach a PLP
      66 |     const navLink = page.locator('nav a, [role="navigation"] a').first()
        at navigateToPLP (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:63:16)
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:216:15

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Product-4addc-odal-closes-with-Escape-key-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[5/10] [chromium] › e2e/product-quick-view.spec.ts:238:9 › Product Quick View › Quick View button has accessible aria-label
[1A[2K[chromium] › e2e/product-quick-view.spec.ts:238:9 › Product Quick View › Quick View button has accessible aria-label

--- Browser Diagnostics for "Quick View button has accessible aria-label" ---

[1A[2KFailed requests: [ [32m'GET http://localhost:3000/ - net::ERR_CONNECTION_REFUSED'[39m ]

[1A[2K  5) [chromium] › e2e/product-quick-view.spec.ts:238:9 › Product Quick View › Quick View button has accessible aria-label 

    Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/
    Call log:
    [2m  - navigating to "http://localhost:3000/", waiting until "domcontentloaded"[22m


      61 |  */
      62 | async function navigateToPLP(page: Page) {
    > 63 |     await page.goto('/', {waitUntil: 'domcontentloaded'})
         |                ^
      64 |
      65 |     // Try clicking a category nav link to reach a PLP
      66 |     const navLink = page.locator('nav a, [role="navigation"] a').first()
        at navigateToPLP (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:63:16)
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:239:15

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Product-1f737-n-has-accessible-aria-label-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[6/10] [chromium] › e2e/product-quick-view.spec.ts:255:9 › Product Quick View › Quick View does not navigate away from PLP
[1A[2K[chromium] › e2e/product-quick-view.spec.ts:255:9 › Product Quick View › Quick View does not navigate away from PLP

--- Browser Diagnostics for "Quick View does not navigate away from PLP" ---

[1A[2KFailed requests: [ [32m'GET http://localhost:3000/ - net::ERR_CONNECTION_REFUSED'[39m ]

[1A[2K  6) [chromium] › e2e/product-quick-view.spec.ts:255:9 › Product Quick View › Quick View does not navigate away from PLP 

    Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/
    Call log:
    [2m  - navigating to "http://localhost:3000/", waiting until "domcontentloaded"[22m


      61 |  */
      62 | async function navigateToPLP(page: Page) {
    > 63 |     await page.goto('/', {waitUntil: 'domcontentloaded'})
         |                ^
      64 |
      65 |     // Try clicking a category nav link to reach a PLP
      66 |     const navLink = page.locator('nav a, [role="navigation"] a').first()
        at navigateToPLP (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:63:16)
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:256:15

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Product-a22d8--not-navigate-away-from-PLP-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[7/10] [chromium] › e2e/product-quick-view.spec.ts:283:9 › Product Quick View › Quick View modal shows loading spinner then content or error
[1A[2K[chromium] › e2e/product-quick-view.spec.ts:283:9 › Product Quick View › Quick View modal shows loading spinner then content or error

--- Browser Diagnostics for "Quick View modal shows loading spinner then content or error" ---

[1A[2KFailed requests: [ [32m'GET http://localhost:3000/ - net::ERR_CONNECTION_REFUSED'[39m ]

[1A[2K  7) [chromium] › e2e/product-quick-view.spec.ts:283:9 › Product Quick View › Quick View modal shows loading spinner then content or error 

    Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/
    Call log:
    [2m  - navigating to "http://localhost:3000/", waiting until "domcontentloaded"[22m


      61 |  */
      62 | async function navigateToPLP(page: Page) {
    > 63 |     await page.goto('/', {waitUntil: 'domcontentloaded'})
         |                ^
      64 |
      65 |     // Try clicking a category nav link to reach a PLP
      66 |     const navLink = page.locator('nav a, [role="navigation"] a').first()
        at navigateToPLP (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:63:16)
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:284:15

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Product-abc59-inner-then-content-or-error-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[8/10] [chromium] › e2e/storefront-smoke.spec.ts:52:7 › Storefront Smoke Tests › homepage loads and renders
[1A[2K[chromium] › e2e/storefront-smoke.spec.ts:52:7 › Storefront Smoke Tests › homepage loads and renders

--- Browser Diagnostics for "homepage loads and renders" ---

[1A[2KFailed requests: [ [32m'GET http://localhost:3000/ - net::ERR_CONNECTION_REFUSED'[39m ]

[1A[2K  8) [chromium] › e2e/storefront-smoke.spec.ts:52:7 › Storefront Smoke Tests › homepage loads and renders 

    Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/
    Call log:
    [2m  - navigating to "http://localhost:3000/", waiting until "load"[22m


      51 | test.describe('Storefront Smoke Tests', () => {
      52 |   test('homepage loads and renders', async ({ page }) => {
    > 53 |     await page.goto('/');
         |                ^
      54 |     await expect(page).toHaveTitle(/.+/); // Page has a title
      55 |     // The Retail React App renders a main content area
      56 |     await expect(page.locator('main, [role="main"], #app')).toBeVisible();
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/storefront-smoke.spec.ts:53:16

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/storefront-smoke-Storefron-1e0f7--homepage-loads-and-renders-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[9/10] [chromium] › e2e/storefront-smoke.spec.ts:59:7 › Storefront Smoke Tests › can navigate to a category/PLP page
[1A[2K[chromium] › e2e/storefront-smoke.spec.ts:59:7 › Storefront Smoke Tests › can navigate to a category/PLP page

--- Browser Diagnostics for "can navigate to a category/PLP page" ---

[1A[2KFailed requests: [ [32m'GET http://localhost:3000/ - net::ERR_CONNECTION_REFUSED'[39m ]

[1A[2K  9) [chromium] › e2e/storefront-smoke.spec.ts:59:7 › Storefront Smoke Tests › can navigate to a category/PLP page 

    Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/
    Call log:
    [2m  - navigating to "http://localhost:3000/", waiting until "load"[22m


      58 |
      59 |   test('can navigate to a category/PLP page', async ({ page }) => {
    > 60 |     await page.goto('/');
         |                ^
      61 |     // Look for navigation links (categories)
      62 |     const navLink = page.locator('nav a, [role="navigation"] a').first();
      63 |     if (await navLink.isVisible()) {
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/storefront-smoke.spec.ts:60:16

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/storefront-smoke-Storefron-7c1cd-gate-to-a-category-PLP-page-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[10/10] [chromium] › e2e/storefront-smoke.spec.ts:71:7 › Storefront Smoke Tests › product detail page shows product info
[1A[2K[chromium] › e2e/storefront-smoke.spec.ts:71:7 › Storefront Smoke Tests › product detail page shows product info

--- Browser Diagnostics for "product detail page shows product info" ---

[1A[2KFailed requests: [ [32m'GET http://localhost:3000/ - net::ERR_CONNECTION_REFUSED'[39m ]

[1A[2K  10) [chromium] › e2e/storefront-smoke.spec.ts:71:7 › Storefront Smoke Tests › product detail page shows product info 

    Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/
    Call log:
    [2m  - navigating to "http://localhost:3000/", waiting until "load"[22m


      70 |
      71 |   test('product detail page shows product info', async ({ page }) => {
    > 72 |     await page.goto('/');
         |                ^
      73 |     // Navigate to a product (find any product link)
      74 |     const productLink = page.locator('a[href*="/product/"], a[href*="/products/"]').first();
      75 |     if (await productLink.isVisible({ timeout: 10_000 })) {
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/storefront-smoke.spec.ts:72:16

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/storefront-smoke-Storefron-b1f09-ail-page-shows-product-info-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K  10 failed
    [chromium] › e2e/product-quick-view.spec.ts:109:9 › Product Quick View › Quick View button renders on PLP product tiles 
    [chromium] › e2e/product-quick-view.spec.ts:124:9 › Product Quick View › clicking Quick View button opens modal with product content 
    [chromium] › e2e/product-quick-view.spec.ts:191:9 › Product Quick View › Quick View modal closes with the close button 
    [chromium] › e2e/product-quick-view.spec.ts:215:9 › Product Quick View › Quick View modal closes with Escape key 
    [chromium] › e2e/product-quick-view.spec.ts:238:9 › Product Quick View › Quick View button has accessible aria-label 
    [chromium] › e2e/product-quick-view.spec.ts:255:9 › Product Quick View › Quick View does not navigate away from PLP 
    [chromium] › e2e/product-quick-view.spec.ts:283:9 › Product Quick View › Quick View modal shows loading spinner then content or error 
    [chromium] › e2e/storefront-smoke.spec.ts:52:7 › Storefront Smoke Tests › homepage loads and renders 
    [chromium] › e2e/storefront-smoke.spec.ts:59:7 › Storefront Smoke Tests › can navigate to a category/PLP page 
    [chromium] › e2e/storefront-smoke.spec.ts:71:7 › Storefront Smoke Tests › product detail page shows product info 
[1A[2K[2m[WebServer] [22m(node:6806) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
[2m[WebServer] [22m(Use `node --trace-deprecation ...` to show where the warning was created)
[1A[2K[2m[WebServer] [22m(node:6830) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
[2m[WebServer] [22m(Use `node --trace-deprecation ...` to show where the warning was created)
[1A[2K[2m[WebServer] [22mKilled