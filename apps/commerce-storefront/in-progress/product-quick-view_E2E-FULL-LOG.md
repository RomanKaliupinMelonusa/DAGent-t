Running 21 tests using 1 worker

[1A[2K[1/21] [chromium] › e2e/product-quick-view.spec.ts:151:9 › Quick View Overlay Bar (PLP) › product tiles on PLP render Quick View buttons
[1A[2K[chromium] › e2e/product-quick-view.spec.ts:151:9 › Quick View Overlay Bar (PLP) › product tiles on PLP render Quick View buttons

--- Browser Diagnostics for "product tiles on PLP render Quick View buttons" ---

[1A[2KFailed requests: [
  [32m'GET http://localhost:3000/__mrt/clear-browser-data - net::ERR_ABORTED'[39m
]

[1A[2K  1) [chromium] › e2e/product-quick-view.spec.ts:151:9 › Quick View Overlay Bar (PLP) › product tiles on PLP render Quick View buttons 

    Error: page.goto: Page crashed
    Call log:
    [2m  - navigating to "http://localhost:3000/", waiting until "domcontentloaded"[22m


      76 |
      77 |     // Fallback: go to homepage and click the first nav link to find a PLP
    > 78 |     await page.goto('/', {waitUntil: 'domcontentloaded'})
         |                ^
      79 |     const navLink = page.locator('nav a, [role="navigation"] a').first()
      80 |     const navVisible = await navLink
      81 |         .waitFor({state: 'visible', timeout: 10_000})
        at navigateToPLP (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:78:16)
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:152:9




[1A[2K[2/21] [chromium] › e2e/product-quick-view.spec.ts:160:9 › Quick View Overlay Bar (PLP) › Quick View button has accessible aria-label with product name
[1A[2K[chromium] › e2e/product-quick-view.spec.ts:160:9 › Quick View Overlay Bar (PLP) › Quick View button has accessible aria-label with product name

--- Browser Diagnostics for "Quick View button has accessible aria-label with product name" ---

[1A[2KFailed requests: [
  [32m'GET http://localhost:3000/category/womens - net::ERR_CONNECTION_REFUSED'[39m
]

[1A[2K  2) [chromium] › e2e/product-quick-view.spec.ts:160:9 › Quick View Overlay Bar (PLP) › Quick View button has accessible aria-label with product name 

    Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/category/womens
    Call log:
    [2m  - navigating to "http://localhost:3000/category/womens", waiting until "domcontentloaded"[22m


      60 | async function navigateToPLP(page: Page): Promise<void> {
      61 |     // Try the well-known RefArch "Womens" category first
    > 62 |     await page.goto('/category/womens', {waitUntil: 'domcontentloaded'})
         |                ^
      63 |
      64 |     // Wait for at least one product tile or quick-view-btn to appear
      65 |     const productContent = page.locator(
        at navigateToPLP (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:62:16)
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:161:15

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Quick-V-fef32-ria-label-with-product-name-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[3/21] [chromium] › e2e/product-quick-view.spec.ts:172:9 › Quick View Overlay Bar (PLP) › Quick View button contains "Quick View" text
[1A[2K[chromium] › e2e/product-quick-view.spec.ts:172:9 › Quick View Overlay Bar (PLP) › Quick View button contains "Quick View" text

--- Browser Diagnostics for "Quick View button contains "Quick View" text" ---

[1A[2KFailed requests: [
  [32m'GET http://localhost:3000/category/womens - net::ERR_CONNECTION_REFUSED'[39m
]

[1A[2K  3) [chromium] › e2e/product-quick-view.spec.ts:172:9 › Quick View Overlay Bar (PLP) › Quick View button contains "Quick View" text 

    Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/category/womens
    Call log:
    [2m  - navigating to "http://localhost:3000/category/womens", waiting until "domcontentloaded"[22m


      60 | async function navigateToPLP(page: Page): Promise<void> {
      61 |     // Try the well-known RefArch "Womens" category first
    > 62 |     await page.goto('/category/womens', {waitUntil: 'domcontentloaded'})
         |                ^
      63 |
      64 |     // Wait for at least one product tile or quick-view-btn to appear
      65 |     const productContent = page.locator(
        at navigateToPLP (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:62:16)
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:173:15

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Quick-V-bd9cb-on-contains-Quick-View-text-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[4/21] [chromium] › e2e/product-quick-view.spec.ts:183:9 › Quick View Overlay Bar (PLP) › clicking Quick View does NOT navigate away from PLP
[1A[2K[chromium] › e2e/product-quick-view.spec.ts:183:9 › Quick View Overlay Bar (PLP) › clicking Quick View does NOT navigate away from PLP

--- Browser Diagnostics for "clicking Quick View does NOT navigate away from PLP" ---

[1A[2KFailed requests: [
  [32m'GET http://localhost:3000/category/womens - net::ERR_CONNECTION_REFUSED'[39m
]

[1A[2K  4) [chromium] › e2e/product-quick-view.spec.ts:183:9 › Quick View Overlay Bar (PLP) › clicking Quick View does NOT navigate away from PLP 

    Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/category/womens
    Call log:
    [2m  - navigating to "http://localhost:3000/category/womens", waiting until "domcontentloaded"[22m


      60 | async function navigateToPLP(page: Page): Promise<void> {
      61 |     // Try the well-known RefArch "Womens" category first
    > 62 |     await page.goto('/category/womens', {waitUntil: 'domcontentloaded'})
         |                ^
      63 |
      64 |     // Wait for at least one product tile or quick-view-btn to appear
      65 |     const productContent = page.locator(
        at navigateToPLP (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:62:16)
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:184:15

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Quick-V-2fa3f--NOT-navigate-away-from-PLP-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[5/21] [chromium] › e2e/product-quick-view.spec.ts:205:9 › Quick View Modal › clicking Quick View button opens the modal with spinner or content
[1A[2K[chromium] › e2e/product-quick-view.spec.ts:205:9 › Quick View Modal › clicking Quick View button opens the modal with spinner or content

--- Browser Diagnostics for "clicking Quick View button opens the modal with spinner or content" ---

[1A[2KFailed requests: [
  [32m'GET http://localhost:3000/category/womens - net::ERR_CONNECTION_REFUSED'[39m
]

[1A[2K  5) [chromium] › e2e/product-quick-view.spec.ts:205:9 › Quick View Modal › clicking Quick View button opens the modal with spinner or content 

    Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/category/womens
    Call log:
    [2m  - navigating to "http://localhost:3000/category/womens", waiting until "domcontentloaded"[22m


      60 | async function navigateToPLP(page: Page): Promise<void> {
      61 |     // Try the well-known RefArch "Womens" category first
    > 62 |     await page.goto('/category/womens', {waitUntil: 'domcontentloaded'})
         |                ^
      63 |
      64 |     // Wait for at least one product tile or quick-view-btn to appear
      65 |     const productContent = page.locator(
        at navigateToPLP (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:62:16)
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:206:15

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Quick-V-cbd73-dal-with-spinner-or-content-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[6/21] [chromium] › e2e/product-quick-view.spec.ts:218:9 › Quick View Modal › modal displays a loading spinner before content loads
[1A[2K[chromium] › e2e/product-quick-view.spec.ts:218:9 › Quick View Modal › modal displays a loading spinner before content loads

--- Browser Diagnostics for "modal displays a loading spinner before content loads" ---

[1A[2KFailed requests: [
  [32m'GET http://localhost:3000/category/womens - net::ERR_CONNECTION_REFUSED'[39m
]

[1A[2K  6) [chromium] › e2e/product-quick-view.spec.ts:218:9 › Quick View Modal › modal displays a loading spinner before content loads 

    Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/category/womens
    Call log:
    [2m  - navigating to "http://localhost:3000/category/womens", waiting until "domcontentloaded"[22m


      60 | async function navigateToPLP(page: Page): Promise<void> {
      61 |     // Try the well-known RefArch "Womens" category first
    > 62 |     await page.goto('/category/womens', {waitUntil: 'domcontentloaded'})
         |                ^
      63 |
      64 |     // Wait for at least one product tile or quick-view-btn to appear
      65 |     const productContent = page.locator(
        at navigateToPLP (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:62:16)
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:219:15

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Quick-V-05efb-pinner-before-content-loads-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[7/21] [chromium] › e2e/product-quick-view.spec.ts:243:9 › Quick View Modal › modal has data-testid="quick-view-modal"
[1A[2K[chromium] › e2e/product-quick-view.spec.ts:243:9 › Quick View Modal › modal has data-testid="quick-view-modal"

--- Browser Diagnostics for "modal has data-testid="quick-view-modal"" ---

[1A[2KFailed requests: [
  [32m'GET http://localhost:3000/category/womens - net::ERR_CONNECTION_REFUSED'[39m
]

[1A[2K  7) [chromium] › e2e/product-quick-view.spec.ts:243:9 › Quick View Modal › modal has data-testid="quick-view-modal" 

    Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/category/womens
    Call log:
    [2m  - navigating to "http://localhost:3000/category/womens", waiting until "domcontentloaded"[22m


      60 | async function navigateToPLP(page: Page): Promise<void> {
      61 |     // Try the well-known RefArch "Womens" category first
    > 62 |     await page.goto('/category/womens', {waitUntil: 'domcontentloaded'})
         |                ^
      63 |
      64 |     // Wait for at least one product tile or quick-view-btn to appear
      65 |     const productContent = page.locator(
        at navigateToPLP (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:62:16)
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:244:15

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Quick-V-60172-ta-testid-quick-view-modal--chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[8/21] [chromium] › e2e/product-quick-view.spec.ts:256:9 › Quick View Modal › modal has accessible aria-label containing product name
[1A[2K[chromium] › e2e/product-quick-view.spec.ts:256:9 › Quick View Modal › modal has accessible aria-label containing product name

--- Browser Diagnostics for "modal has accessible aria-label containing product name" ---

[1A[2KFailed requests: [
  [32m'GET http://localhost:3000/category/womens - net::ERR_CONNECTION_REFUSED'[39m
]

[1A[2K  8) [chromium] › e2e/product-quick-view.spec.ts:256:9 › Quick View Modal › modal has accessible aria-label containing product name 

    Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/category/womens
    Call log:
    [2m  - navigating to "http://localhost:3000/category/womens", waiting until "domcontentloaded"[22m


      60 | async function navigateToPLP(page: Page): Promise<void> {
      61 |     // Try the well-known RefArch "Womens" category first
    > 62 |     await page.goto('/category/womens', {waitUntil: 'domcontentloaded'})
         |                ^
      63 |
      64 |     // Wait for at least one product tile or quick-view-btn to appear
      65 |     const productContent = page.locator(
        at navigateToPLP (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:62:16)
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:257:15

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Quick-V-b9c91-bel-containing-product-name-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[9/21] [chromium] › e2e/product-quick-view.spec.ts:273:9 › Quick View Modal › modal can be closed via the close button
[1A[2K[chromium] › e2e/product-quick-view.spec.ts:273:9 › Quick View Modal › modal can be closed via the close button

--- Browser Diagnostics for "modal can be closed via the close button" ---

[1A[2KFailed requests: [
  [32m'GET http://localhost:3000/category/womens - net::ERR_CONNECTION_REFUSED'[39m
]

[1A[2K  9) [chromium] › e2e/product-quick-view.spec.ts:273:9 › Quick View Modal › modal can be closed via the close button 

    Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/category/womens
    Call log:
    [2m  - navigating to "http://localhost:3000/category/womens", waiting until "domcontentloaded"[22m


      60 | async function navigateToPLP(page: Page): Promise<void> {
      61 |     // Try the well-known RefArch "Womens" category first
    > 62 |     await page.goto('/category/womens', {waitUntil: 'domcontentloaded'})
         |                ^
      63 |
      64 |     // Wait for at least one product tile or quick-view-btn to appear
      65 |     const productContent = page.locator(
        at navigateToPLP (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:62:16)
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:274:15

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Quick-V-5c6b4-closed-via-the-close-button-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[10/21] [chromium] › e2e/product-quick-view.spec.ts:293:9 › Quick View Modal › modal can be closed via Escape key
[1A[2K[chromium] › e2e/product-quick-view.spec.ts:293:9 › Quick View Modal › modal can be closed via Escape key

--- Browser Diagnostics for "modal can be closed via Escape key" ---

[1A[2KFailed requests: [
  [32m'GET http://localhost:3000/category/womens - net::ERR_CONNECTION_REFUSED'[39m
]

[1A[2K  10) [chromium] › e2e/product-quick-view.spec.ts:293:9 › Quick View Modal › modal can be closed via Escape key 

    Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/category/womens
    Call log:
    [2m  - navigating to "http://localhost:3000/category/womens", waiting until "domcontentloaded"[22m


      60 | async function navigateToPLP(page: Page): Promise<void> {
      61 |     // Try the well-known RefArch "Womens" category first
    > 62 |     await page.goto('/category/womens', {waitUntil: 'domcontentloaded'})
         |                ^
      63 |
      64 |     // Wait for at least one product tile or quick-view-btn to appear
      65 |     const productContent = page.locator(
        at navigateToPLP (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:62:16)
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:294:15

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Quick-V-7d07f-an-be-closed-via-Escape-key-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[11/21] [chromium] › e2e/product-quick-view.spec.ts:341:9 › Quick View Modal Content › modal displays product name
[1A[2K[chromium] › e2e/product-quick-view.spec.ts:341:9 › Quick View Modal Content › modal displays product name

--- Browser Diagnostics for "modal displays product name" ---

[1A[2KFailed requests: [
  [32m'GET http://localhost:3000/category/womens - net::ERR_CONNECTION_REFUSED'[39m
]

[1A[2K  11) [chromium] › e2e/product-quick-view.spec.ts:341:9 › Quick View Modal Content › modal displays product name 

    Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/category/womens
    Call log:
    [2m  - navigating to "http://localhost:3000/category/womens", waiting until "domcontentloaded"[22m


      60 | async function navigateToPLP(page: Page): Promise<void> {
      61 |     // Try the well-known RefArch "Womens" category first
    > 62 |     await page.goto('/category/womens', {waitUntil: 'domcontentloaded'})
         |                ^
      63 |
      64 |     // Wait for at least one product tile or quick-view-btn to appear
      65 |     const productContent = page.locator(
        at navigateToPLP (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:62:16)
        at openQuickViewAndWaitForContent (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:320:15)
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:342:15

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Quick-V-96986-modal-displays-product-name-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[12/21] [chromium] › e2e/product-quick-view.spec.ts:353:9 › Quick View Modal Content › modal displays product price
[1A[2K[chromium] › e2e/product-quick-view.spec.ts:353:9 › Quick View Modal Content › modal displays product price

--- Browser Diagnostics for "modal displays product price" ---

[1A[2KFailed requests: [
  [32m'GET http://localhost:3000/category/womens - net::ERR_CONNECTION_REFUSED'[39m
]

[1A[2K  12) [chromium] › e2e/product-quick-view.spec.ts:353:9 › Quick View Modal Content › modal displays product price 

    Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/category/womens
    Call log:
    [2m  - navigating to "http://localhost:3000/category/womens", waiting until "domcontentloaded"[22m


      60 | async function navigateToPLP(page: Page): Promise<void> {
      61 |     // Try the well-known RefArch "Womens" category first
    > 62 |     await page.goto('/category/womens', {waitUntil: 'domcontentloaded'})
         |                ^
      63 |
      64 |     // Wait for at least one product tile or quick-view-btn to appear
      65 |     const productContent = page.locator(
        at navigateToPLP (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:62:16)
        at openQuickViewAndWaitForContent (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:320:15)
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:354:15

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Quick-V-ef85e-odal-displays-product-price-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[13/21] [chromium] › e2e/product-quick-view.spec.ts:367:9 › Quick View Modal Content › modal displays Add to Cart button
[1A[2K[chromium] › e2e/product-quick-view.spec.ts:367:9 › Quick View Modal Content › modal displays Add to Cart button

--- Browser Diagnostics for "modal displays Add to Cart button" ---

[1A[2KFailed requests: [
  [32m'GET http://localhost:3000/category/womens - net::ERR_CONNECTION_REFUSED'[39m
]

[1A[2K  13) [chromium] › e2e/product-quick-view.spec.ts:367:9 › Quick View Modal Content › modal displays Add to Cart button 

    Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/category/womens
    Call log:
    [2m  - navigating to "http://localhost:3000/category/womens", waiting until "domcontentloaded"[22m


      60 | async function navigateToPLP(page: Page): Promise<void> {
      61 |     // Try the well-known RefArch "Womens" category first
    > 62 |     await page.goto('/category/womens', {waitUntil: 'domcontentloaded'})
         |                ^
      63 |
      64 |     // Wait for at least one product tile or quick-view-btn to appear
      65 |     const productContent = page.locator(
        at navigateToPLP (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:62:16)
        at openQuickViewAndWaitForContent (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:320:15)
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:368:15

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Quick-V-f3d4d-displays-Add-to-Cart-button-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[14/21] [chromium] › e2e/product-quick-view.spec.ts:378:9 › Quick View Modal Content › modal displays "View Full Details" link to PDP
[1A[2K[chromium] › e2e/product-quick-view.spec.ts:378:9 › Quick View Modal Content › modal displays "View Full Details" link to PDP

--- Browser Diagnostics for "modal displays "View Full Details" link to PDP" ---

[1A[2KFailed requests: [
  [32m'GET http://localhost:3000/category/womens - net::ERR_CONNECTION_REFUSED'[39m
]

[1A[2K  14) [chromium] › e2e/product-quick-view.spec.ts:378:9 › Quick View Modal Content › modal displays "View Full Details" link to PDP 

    Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/category/womens
    Call log:
    [2m  - navigating to "http://localhost:3000/category/womens", waiting until "domcontentloaded"[22m


      60 | async function navigateToPLP(page: Page): Promise<void> {
      61 |     // Try the well-known RefArch "Womens" category first
    > 62 |     await page.goto('/category/womens', {waitUntil: 'domcontentloaded'})
         |                ^
      63 |
      64 |     // Wait for at least one product tile or quick-view-btn to appear
      65 |     const productContent = page.locator(
        at navigateToPLP (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:62:16)
        at openQuickViewAndWaitForContent (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:320:15)
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:379:15

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Quick-V-2c7ad-ew-Full-Details-link-to-PDP-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[15/21] [chromium] › e2e/product-quick-view.spec.ts:393:9 › Quick View Modal Content › modal renders product image
[1A[2K[chromium] › e2e/product-quick-view.spec.ts:393:9 › Quick View Modal Content › modal renders product image

--- Browser Diagnostics for "modal renders product image" ---

[1A[2KFailed requests: [
  [32m'GET http://localhost:3000/category/womens - net::ERR_CONNECTION_REFUSED'[39m
]

[1A[2K  15) [chromium] › e2e/product-quick-view.spec.ts:393:9 › Quick View Modal Content › modal renders product image 

    Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/category/womens
    Call log:
    [2m  - navigating to "http://localhost:3000/category/womens", waiting until "domcontentloaded"[22m


      60 | async function navigateToPLP(page: Page): Promise<void> {
      61 |     // Try the well-known RefArch "Womens" category first
    > 62 |     await page.goto('/category/womens', {waitUntil: 'domcontentloaded'})
         |                ^
      63 |
      64 |     // Wait for at least one product tile or quick-view-btn to appear
      65 |     const productContent = page.locator(
        at navigateToPLP (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:62:16)
        at openQuickViewAndWaitForContent (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:320:15)
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:394:15

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Quick-V-c7dd9-modal-renders-product-image-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[16/21] [chromium] › e2e/product-quick-view.spec.ts:408:9 › Quick View Edge Cases › opening and closing modal preserves PLP URL
[1A[2K[chromium] › e2e/product-quick-view.spec.ts:408:9 › Quick View Edge Cases › opening and closing modal preserves PLP URL

--- Browser Diagnostics for "opening and closing modal preserves PLP URL" ---

[1A[2KFailed requests: [
  [32m'GET http://localhost:3000/category/womens - net::ERR_CONNECTION_REFUSED'[39m
]

[1A[2K  16) [chromium] › e2e/product-quick-view.spec.ts:408:9 › Quick View Edge Cases › opening and closing modal preserves PLP URL 

    Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/category/womens
    Call log:
    [2m  - navigating to "http://localhost:3000/category/womens", waiting until "domcontentloaded"[22m


      60 | async function navigateToPLP(page: Page): Promise<void> {
      61 |     // Try the well-known RefArch "Womens" category first
    > 62 |     await page.goto('/category/womens', {waitUntil: 'domcontentloaded'})
         |                ^
      63 |
      64 |     // Wait for at least one product tile or quick-view-btn to appear
      65 |     const productContent = page.locator(
        at navigateToPLP (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:62:16)
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:409:15

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Quick-V-67f49-ing-modal-preserves-PLP-URL-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[17/21] [chromium] › e2e/product-quick-view.spec.ts:429:9 › Quick View Edge Cases › multiple Quick View buttons exist for multiple products
[1A[2K[chromium] › e2e/product-quick-view.spec.ts:429:9 › Quick View Edge Cases › multiple Quick View buttons exist for multiple products

--- Browser Diagnostics for "multiple Quick View buttons exist for multiple products" ---

[1A[2KFailed requests: [
  [32m'GET http://localhost:3000/category/womens - net::ERR_CONNECTION_REFUSED'[39m
]

[1A[2K  17) [chromium] › e2e/product-quick-view.spec.ts:429:9 › Quick View Edge Cases › multiple Quick View buttons exist for multiple products 

    Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/category/womens
    Call log:
    [2m  - navigating to "http://localhost:3000/category/womens", waiting until "domcontentloaded"[22m


      60 | async function navigateToPLP(page: Page): Promise<void> {
      61 |     // Try the well-known RefArch "Womens" category first
    > 62 |     await page.goto('/category/womens', {waitUntil: 'domcontentloaded'})
         |                ^
      63 |
      64 |     // Wait for at least one product tile or quick-view-btn to appear
      65 |     const productContent = page.locator(
        at navigateToPLP (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:62:16)
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:430:15

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Quick-V-1c461-exist-for-multiple-products-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[18/21] [chromium] › e2e/product-quick-view.spec.ts:440:9 › Quick View Edge Cases › can open Quick View for different products sequentially
[1A[2K[chromium] › e2e/product-quick-view.spec.ts:440:9 › Quick View Edge Cases › can open Quick View for different products sequentially

--- Browser Diagnostics for "can open Quick View for different products sequentially" ---

[1A[2KFailed requests: [
  [32m'GET http://localhost:3000/category/womens - net::ERR_CONNECTION_REFUSED'[39m
]

[1A[2K  18) [chromium] › e2e/product-quick-view.spec.ts:440:9 › Quick View Edge Cases › can open Quick View for different products sequentially 

    Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/category/womens
    Call log:
    [2m  - navigating to "http://localhost:3000/category/womens", waiting until "domcontentloaded"[22m


      60 | async function navigateToPLP(page: Page): Promise<void> {
      61 |     // Try the well-known RefArch "Womens" category first
    > 62 |     await page.goto('/category/womens', {waitUntil: 'domcontentloaded'})
         |                ^
      63 |
      64 |     // Wait for at least one product tile or quick-view-btn to appear
      65 |     const productContent = page.locator(
        at navigateToPLP (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:62:16)
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:441:15

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Quick-V-9b241-erent-products-sequentially-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[19/21] [chromium] › e2e/storefront-smoke.spec.ts:52:7 › Storefront Smoke Tests › homepage loads and renders
[1A[2K[chromium] › e2e/storefront-smoke.spec.ts:52:7 › Storefront Smoke Tests › homepage loads and renders

--- Browser Diagnostics for "homepage loads and renders" ---

[1A[2KFailed requests: [ [32m'GET http://localhost:3000/ - net::ERR_CONNECTION_REFUSED'[39m ]

[1A[2K  19) [chromium] › e2e/storefront-smoke.spec.ts:52:7 › Storefront Smoke Tests › homepage loads and renders 

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


[1A[2K[20/21] [chromium] › e2e/storefront-smoke.spec.ts:59:7 › Storefront Smoke Tests › can navigate to a category/PLP page
[1A[2K[chromium] › e2e/storefront-smoke.spec.ts:59:7 › Storefront Smoke Tests › can navigate to a category/PLP page

--- Browser Diagnostics for "can navigate to a category/PLP page" ---

[1A[2KFailed requests: [ [32m'GET http://localhost:3000/ - net::ERR_CONNECTION_REFUSED'[39m ]

[1A[2K  20) [chromium] › e2e/storefront-smoke.spec.ts:59:7 › Storefront Smoke Tests › can navigate to a category/PLP page 

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


[1A[2K[21/21] [chromium] › e2e/storefront-smoke.spec.ts:71:7 › Storefront Smoke Tests › product detail page shows product info
[1A[2K[chromium] › e2e/storefront-smoke.spec.ts:71:7 › Storefront Smoke Tests › product detail page shows product info

--- Browser Diagnostics for "product detail page shows product info" ---

[1A[2KFailed requests: [ [32m'GET http://localhost:3000/ - net::ERR_CONNECTION_REFUSED'[39m ]

[1A[2K  21) [chromium] › e2e/storefront-smoke.spec.ts:71:7 › Storefront Smoke Tests › product detail page shows product info 

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


[1A[2K  21 failed
    [chromium] › e2e/product-quick-view.spec.ts:151:9 › Quick View Overlay Bar (PLP) › product tiles on PLP render Quick View buttons 
    [chromium] › e2e/product-quick-view.spec.ts:160:9 › Quick View Overlay Bar (PLP) › Quick View button has accessible aria-label with product name 
    [chromium] › e2e/product-quick-view.spec.ts:172:9 › Quick View Overlay Bar (PLP) › Quick View button contains "Quick View" text 
    [chromium] › e2e/product-quick-view.spec.ts:183:9 › Quick View Overlay Bar (PLP) › clicking Quick View does NOT navigate away from PLP 
    [chromium] › e2e/product-quick-view.spec.ts:205:9 › Quick View Modal › clicking Quick View button opens the modal with spinner or content 
    [chromium] › e2e/product-quick-view.spec.ts:218:9 › Quick View Modal › modal displays a loading spinner before content loads 
    [chromium] › e2e/product-quick-view.spec.ts:243:9 › Quick View Modal › modal has data-testid="quick-view-modal" 
    [chromium] › e2e/product-quick-view.spec.ts:256:9 › Quick View Modal › modal has accessible aria-label containing product name 
    [chromium] › e2e/product-quick-view.spec.ts:273:9 › Quick View Modal › modal can be closed via the close button 
    [chromium] › e2e/product-quick-view.spec.ts:293:9 › Quick View Modal › modal can be closed via Escape key 
    [chromium] › e2e/product-quick-view.spec.ts:341:9 › Quick View Modal Content › modal displays product name 
    [chromium] › e2e/product-quick-view.spec.ts:353:9 › Quick View Modal Content › modal displays product price 
    [chromium] › e2e/product-quick-view.spec.ts:367:9 › Quick View Modal Content › modal displays Add to Cart button 
    [chromium] › e2e/product-quick-view.spec.ts:378:9 › Quick View Modal Content › modal displays "View Full Details" link to PDP 
    [chromium] › e2e/product-quick-view.spec.ts:393:9 › Quick View Modal Content › modal renders product image 
    [chromium] › e2e/product-quick-view.spec.ts:408:9 › Quick View Edge Cases › opening and closing modal preserves PLP URL 
    [chromium] › e2e/product-quick-view.spec.ts:429:9 › Quick View Edge Cases › multiple Quick View buttons exist for multiple products 
    [chromium] › e2e/product-quick-view.spec.ts:440:9 › Quick View Edge Cases › can open Quick View for different products sequentially 
    [chromium] › e2e/storefront-smoke.spec.ts:52:7 › Storefront Smoke Tests › homepage loads and renders 
    [chromium] › e2e/storefront-smoke.spec.ts:59:7 › Storefront Smoke Tests › can navigate to a category/PLP page 
    [chromium] › e2e/storefront-smoke.spec.ts:71:7 › Storefront Smoke Tests › product detail page shows product info 
[1A[2K[2m[WebServer] [22m(node:88989) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
[2m[WebServer] [22m(Use `node --trace-deprecation ...` to show where the warning was created)
[1A[2K[2m[WebServer] [22m(node:89013) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
[2m[WebServer] [22m(Use `node --trace-deprecation ...` to show where the warning was created)
[1A[2K[2m[WebServer] [22mKilled