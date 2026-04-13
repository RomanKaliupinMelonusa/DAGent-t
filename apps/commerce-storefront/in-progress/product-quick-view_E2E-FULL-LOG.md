Running 19 tests using 1 worker

[1A[2K[1/19] [chromium] › e2e/product-quick-view.spec.ts:148:9 › Product Quick View › Quick View Overlay Bar › Quick View button appears on product tiles on PLP
[1A[2K[chromium] › e2e/product-quick-view.spec.ts:148:9 › Product Quick View › Quick View Overlay Bar › Quick View button appears on product tiles on PLP

--- Browser Diagnostics for "Quick View button appears on product tiles on PLP" ---

[1A[2KFailed requests: [
  [32m'GET http://localhost:3000/__mrt/clear-browser-data - net::ERR_ABORTED'[39m
]

[1A[2K  1) [chromium] › e2e/product-quick-view.spec.ts:148:9 › Product Quick View › Quick View Overlay Bar › Quick View button appears on product tiles on PLP 

    Error: page.goto: Page crashed
    Call log:
    [2m  - navigating to "http://localhost:3000/category/womens", waiting until "domcontentloaded"[22m


      63 |
      64 |   for (const path of categoryPaths) {
    > 65 |     await page.goto(path, { waitUntil: 'domcontentloaded' });
         |                ^
      66 |
      67 |     // Check if we landed on a page with Quick View buttons
      68 |     const quickViewBtn = page.getByTestId('quick-view-btn').first();
        at navigateToPLP (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:65:16)
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:149:7

    Error: page.screenshot: Target crashed 
    Call log:
    [2m  - taking page screenshot[22m
    [2m  - waiting for fonts to load...[22m
    [2m  - fonts loaded[22m


      41 |       console.log('Failed requests:', failedRequests);
      42 |     }
    > 43 |     await page.screenshot({
         |                ^
      44 |       path: `test-results/failure-${testInfo.title.replace(/\s+/g, '-')}.png`,
      45 |     });
      46 |   }
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:43:16



[1A[2K[2/19] [chromium] › e2e/product-quick-view.spec.ts:158:9 › Product Quick View › Quick View Overlay Bar › Quick View button has correct accessible label
[1A[2K[chromium] › e2e/product-quick-view.spec.ts:158:9 › Product Quick View › Quick View Overlay Bar › Quick View button has correct accessible label

--- Browser Diagnostics for "Quick View button has correct accessible label" ---

[1A[2KFailed requests: [
  [32m'GET http://localhost:3000/category/newarrivals - net::ERR_CONNECTION_REFUSED'[39m
]

[1A[2K  2) [chromium] › e2e/product-quick-view.spec.ts:158:9 › Product Quick View › Quick View Overlay Bar › Quick View button has correct accessible label 

    Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/category/newarrivals
    Call log:
    [2m  - navigating to "http://localhost:3000/category/newarrivals", waiting until "domcontentloaded"[22m


      63 |
      64 |   for (const path of categoryPaths) {
    > 65 |     await page.goto(path, { waitUntil: 'domcontentloaded' });
         |                ^
      66 |
      67 |     // Check if we landed on a page with Quick View buttons
      68 |     const quickViewBtn = page.getByTestId('quick-view-btn').first();
        at navigateToPLP (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:65:16)
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:159:13

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Product-1f131-as-correct-accessible-label-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[3/19] [chromium] › e2e/product-quick-view.spec.ts:170:9 › Product Quick View › Quick View Overlay Bar › Quick View button contains "Quick View" text
[1A[2K[chromium] › e2e/product-quick-view.spec.ts:170:9 › Product Quick View › Quick View Overlay Bar › Quick View button contains "Quick View" text

--- Browser Diagnostics for "Quick View button contains "Quick View" text" ---

[1A[2KFailed requests: [
  [32m'GET http://localhost:3000/category/newarrivals - net::ERR_CONNECTION_REFUSED'[39m
]

[1A[2K  3) [chromium] › e2e/product-quick-view.spec.ts:170:9 › Product Quick View › Quick View Overlay Bar › Quick View button contains "Quick View" text 

    Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/category/newarrivals
    Call log:
    [2m  - navigating to "http://localhost:3000/category/newarrivals", waiting until "domcontentloaded"[22m


      63 |
      64 |   for (const path of categoryPaths) {
    > 65 |     await page.goto(path, { waitUntil: 'domcontentloaded' });
         |                ^
      66 |
      67 |     // Check if we landed on a page with Quick View buttons
      68 |     const quickViewBtn = page.getByTestId('quick-view-btn').first();
        at navigateToPLP (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:65:16)
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:171:13

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Product-21e44-on-contains-Quick-View-text-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[4/19] [chromium] › e2e/product-quick-view.spec.ts:181:9 › Product Quick View › Quick View Overlay Bar › Quick View button becomes visible on hover (desktop)
[1A[2K[chromium] › e2e/product-quick-view.spec.ts:181:9 › Product Quick View › Quick View Overlay Bar › Quick View button becomes visible on hover (desktop)

--- Browser Diagnostics for "Quick View button becomes visible on hover (desktop)" ---

[1A[2KFailed requests: [
  [32m'GET http://localhost:3000/category/newarrivals - net::ERR_CONNECTION_REFUSED'[39m
]

[1A[2K  4) [chromium] › e2e/product-quick-view.spec.ts:181:9 › Product Quick View › Quick View Overlay Bar › Quick View button becomes visible on hover (desktop) 

    Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/category/newarrivals
    Call log:
    [2m  - navigating to "http://localhost:3000/category/newarrivals", waiting until "domcontentloaded"[22m


      63 |
      64 |   for (const path of categoryPaths) {
    > 65 |     await page.goto(path, { waitUntil: 'domcontentloaded' });
         |                ^
      66 |
      67 |     // Check if we landed on a page with Quick View buttons
      68 |     const quickViewBtn = page.getByTestId('quick-view-btn').first();
        at navigateToPLP (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:65:16)
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:182:13

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Product-2bb07-s-visible-on-hover-desktop--chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[5/19] [chromium] › e2e/product-quick-view.spec.ts:197:9 › Product Quick View › Quick View Overlay Bar › clicking Quick View does not navigate away from PLP
[1A[2K[chromium] › e2e/product-quick-view.spec.ts:197:9 › Product Quick View › Quick View Overlay Bar › clicking Quick View does not navigate away from PLP

--- Browser Diagnostics for "clicking Quick View does not navigate away from PLP" ---

[1A[2KFailed requests: [
  [32m'GET http://localhost:3000/category/newarrivals - net::ERR_CONNECTION_REFUSED'[39m
]

[1A[2K  5) [chromium] › e2e/product-quick-view.spec.ts:197:9 › Product Quick View › Quick View Overlay Bar › clicking Quick View does not navigate away from PLP 

    Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/category/newarrivals
    Call log:
    [2m  - navigating to "http://localhost:3000/category/newarrivals", waiting until "domcontentloaded"[22m


      63 |
      64 |   for (const path of categoryPaths) {
    > 65 |     await page.goto(path, { waitUntil: 'domcontentloaded' });
         |                ^
      66 |
      67 |     // Check if we landed on a page with Quick View buttons
      68 |     const quickViewBtn = page.getByTestId('quick-view-btn').first();
        at navigateToPLP (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:65:16)
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:198:13

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Product-4065d--not-navigate-away-from-PLP-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[6/19] [chromium] › e2e/product-quick-view.spec.ts:215:9 › Product Quick View › Quick View Modal — Opening & Content › clicking Quick View button opens the modal
[1A[2K[chromium] › e2e/product-quick-view.spec.ts:215:9 › Product Quick View › Quick View Modal — Opening & Content › clicking Quick View button opens the modal

--- Browser Diagnostics for "clicking Quick View button opens the modal" ---

[1A[2KFailed requests: [
  [32m'GET http://localhost:3000/category/newarrivals - net::ERR_CONNECTION_REFUSED'[39m
]

[1A[2K  6) [chromium] › e2e/product-quick-view.spec.ts:215:9 › Product Quick View › Quick View Modal — Opening & Content › clicking Quick View button opens the modal 

    Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/category/newarrivals
    Call log:
    [2m  - navigating to "http://localhost:3000/category/newarrivals", waiting until "domcontentloaded"[22m


      63 |
      64 |   for (const path of categoryPaths) {
    > 65 |     await page.goto(path, { waitUntil: 'domcontentloaded' });
         |                ^
      66 |
      67 |     // Check if we landed on a page with Quick View buttons
      68 |     const quickViewBtn = page.getByTestId('quick-view-btn').first();
        at navigateToPLP (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:65:16)
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:216:13

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Product-e54bb-View-button-opens-the-modal-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[7/19] [chromium] › e2e/product-quick-view.spec.ts:231:9 › Product Quick View › Quick View Modal — Opening & Content › modal shows spinner while loading then resolves to content or error
[1A[2K[chromium] › e2e/product-quick-view.spec.ts:231:9 › Product Quick View › Quick View Modal — Opening & Content › modal shows spinner while loading then resolves to content or error

--- Browser Diagnostics for "modal shows spinner while loading then resolves to content or error" ---

[1A[2KFailed requests: [
  [32m'GET http://localhost:3000/category/newarrivals - net::ERR_CONNECTION_REFUSED'[39m
]

[1A[2K  7) [chromium] › e2e/product-quick-view.spec.ts:231:9 › Product Quick View › Quick View Modal — Opening & Content › modal shows spinner while loading then resolves to content or error 

    Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/category/newarrivals
    Call log:
    [2m  - navigating to "http://localhost:3000/category/newarrivals", waiting until "domcontentloaded"[22m


      63 |
      64 |   for (const path of categoryPaths) {
    > 65 |     await page.goto(path, { waitUntil: 'domcontentloaded' });
         |                ^
      66 |
      67 |     // Check if we landed on a page with Quick View buttons
      68 |     const quickViewBtn = page.getByTestId('quick-view-btn').first();
        at navigateToPLP (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:65:16)
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:234:13

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Product-23526-esolves-to-content-or-error-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[8/19] [chromium] › e2e/product-quick-view.spec.ts:251:9 › Product Quick View › Quick View Modal — Opening & Content › modal has accessible aria-label with product name
[1A[2K[chromium] › e2e/product-quick-view.spec.ts:251:9 › Product Quick View › Quick View Modal — Opening & Content › modal has accessible aria-label with product name

--- Browser Diagnostics for "modal has accessible aria-label with product name" ---

[1A[2KFailed requests: [
  [32m'GET http://localhost:3000/category/newarrivals - net::ERR_CONNECTION_REFUSED'[39m
]

[1A[2K  8) [chromium] › e2e/product-quick-view.spec.ts:251:9 › Product Quick View › Quick View Modal — Opening & Content › modal has accessible aria-label with product name 

    Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/category/newarrivals
    Call log:
    [2m  - navigating to "http://localhost:3000/category/newarrivals", waiting until "domcontentloaded"[22m


      63 |
      64 |   for (const path of categoryPaths) {
    > 65 |     await page.goto(path, { waitUntil: 'domcontentloaded' });
         |                ^
      66 |
      67 |     // Check if we landed on a page with Quick View buttons
      68 |     const quickViewBtn = page.getByTestId('quick-view-btn').first();
        at navigateToPLP (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:65:16)
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:252:13

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Product-5e30a-ria-label-with-product-name-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[9/19] [chromium] › e2e/product-quick-view.spec.ts:269:9 › Product Quick View › Quick View Modal — Opening & Content › modal loads product content with image and interactive elements
[1A[2K[chromium] › e2e/product-quick-view.spec.ts:269:9 › Product Quick View › Quick View Modal — Opening & Content › modal loads product content with image and interactive elements

--- Browser Diagnostics for "modal loads product content with image and interactive elements" ---

[1A[2KFailed requests: [
  [32m'GET http://localhost:3000/category/newarrivals - net::ERR_CONNECTION_REFUSED'[39m
]

[1A[2K  9) [chromium] › e2e/product-quick-view.spec.ts:269:9 › Product Quick View › Quick View Modal — Opening & Content › modal loads product content with image and interactive elements 

    Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/category/newarrivals
    Call log:
    [2m  - navigating to "http://localhost:3000/category/newarrivals", waiting until "domcontentloaded"[22m


      63 |
      64 |   for (const path of categoryPaths) {
    > 65 |     await page.goto(path, { waitUntil: 'domcontentloaded' });
         |                ^
      66 |
      67 |     // Check if we landed on a page with Quick View buttons
      68 |     const quickViewBtn = page.getByTestId('quick-view-btn').first();
        at navigateToPLP (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:65:16)
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:270:13

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Product-2b84c-ge-and-interactive-elements-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[10/19] [chromium] › e2e/product-quick-view.spec.ts:303:9 › Product Quick View › Quick View Modal — Opening & Content › modal shows "View Full Details" link to PDP
[1A[2K[chromium] › e2e/product-quick-view.spec.ts:303:9 › Product Quick View › Quick View Modal — Opening & Content › modal shows "View Full Details" link to PDP

--- Browser Diagnostics for "modal shows "View Full Details" link to PDP" ---

[1A[2KFailed requests: [
  [32m'GET http://localhost:3000/category/newarrivals - net::ERR_CONNECTION_REFUSED'[39m
]

[1A[2K  10) [chromium] › e2e/product-quick-view.spec.ts:303:9 › Product Quick View › Quick View Modal — Opening & Content › modal shows "View Full Details" link to PDP 

    Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/category/newarrivals
    Call log:
    [2m  - navigating to "http://localhost:3000/category/newarrivals", waiting until "domcontentloaded"[22m


      63 |
      64 |   for (const path of categoryPaths) {
    > 65 |     await page.goto(path, { waitUntil: 'domcontentloaded' });
         |                ^
      66 |
      67 |     // Check if we landed on a page with Quick View buttons
      68 |     const quickViewBtn = page.getByTestId('quick-view-btn').first();
        at navigateToPLP (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:65:16)
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:304:13

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Product-21c01-ew-Full-Details-link-to-PDP-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[11/19] [chromium] › e2e/product-quick-view.spec.ts:327:9 › Product Quick View › Quick View Modal — Closing › modal closes when X button is clicked
[1A[2K[chromium] › e2e/product-quick-view.spec.ts:327:9 › Product Quick View › Quick View Modal — Closing › modal closes when X button is clicked

--- Browser Diagnostics for "modal closes when X button is clicked" ---

[1A[2KFailed requests: [
  [32m'GET http://localhost:3000/category/newarrivals - net::ERR_CONNECTION_REFUSED'[39m
]

[1A[2K  11) [chromium] › e2e/product-quick-view.spec.ts:327:9 › Product Quick View › Quick View Modal — Closing › modal closes when X button is clicked 

    Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/category/newarrivals
    Call log:
    [2m  - navigating to "http://localhost:3000/category/newarrivals", waiting until "domcontentloaded"[22m


      63 |
      64 |   for (const path of categoryPaths) {
    > 65 |     await page.goto(path, { waitUntil: 'domcontentloaded' });
         |                ^
      66 |
      67 |     // Check if we landed on a page with Quick View buttons
      68 |     const quickViewBtn = page.getByTestId('quick-view-btn').first();
        at navigateToPLP (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:65:16)
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:328:13

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Product-b62a4-es-when-X-button-is-clicked-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[12/19] [chromium] › e2e/product-quick-view.spec.ts:348:9 › Product Quick View › Quick View Modal — Closing › modal closes when Escape key is pressed
[1A[2K[chromium] › e2e/product-quick-view.spec.ts:348:9 › Product Quick View › Quick View Modal — Closing › modal closes when Escape key is pressed

--- Browser Diagnostics for "modal closes when Escape key is pressed" ---

[1A[2KFailed requests: [
  [32m'GET http://localhost:3000/category/newarrivals - net::ERR_CONNECTION_REFUSED'[39m
]

[1A[2K  12) [chromium] › e2e/product-quick-view.spec.ts:348:9 › Product Quick View › Quick View Modal — Closing › modal closes when Escape key is pressed 

    Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/category/newarrivals
    Call log:
    [2m  - navigating to "http://localhost:3000/category/newarrivals", waiting until "domcontentloaded"[22m


      63 |
      64 |   for (const path of categoryPaths) {
    > 65 |     await page.goto(path, { waitUntil: 'domcontentloaded' });
         |                ^
      66 |
      67 |     // Check if we landed on a page with Quick View buttons
      68 |     const quickViewBtn = page.getByTestId('quick-view-btn').first();
        at navigateToPLP (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:65:16)
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:349:13

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Product-9ff64--when-Escape-key-is-pressed-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[13/19] [chromium] › e2e/product-quick-view.spec.ts:368:9 › Product Quick View › Quick View Modal — Closing › PLP remains intact after closing the modal
[1A[2K[chromium] › e2e/product-quick-view.spec.ts:368:9 › Product Quick View › Quick View Modal — Closing › PLP remains intact after closing the modal

--- Browser Diagnostics for "PLP remains intact after closing the modal" ---

[1A[2KFailed requests: [
  [32m'GET http://localhost:3000/category/newarrivals - net::ERR_CONNECTION_REFUSED'[39m
]

[1A[2K  13) [chromium] › e2e/product-quick-view.spec.ts:368:9 › Product Quick View › Quick View Modal — Closing › PLP remains intact after closing the modal 

    Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/category/newarrivals
    Call log:
    [2m  - navigating to "http://localhost:3000/category/newarrivals", waiting until "domcontentloaded"[22m


      63 |
      64 |   for (const path of categoryPaths) {
    > 65 |     await page.goto(path, { waitUntil: 'domcontentloaded' });
         |                ^
      66 |
      67 |     // Check if we landed on a page with Quick View buttons
      68 |     const quickViewBtn = page.getByTestId('quick-view-btn').first();
        at navigateToPLP (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:65:16)
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:369:13

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Product-3cc48-act-after-closing-the-modal-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[14/19] [chromium] › e2e/product-quick-view.spec.ts:398:9 › Product Quick View › Quick View Modal — Edge Cases › can open Quick View on multiple products sequentially
[1A[2K[chromium] › e2e/product-quick-view.spec.ts:398:9 › Product Quick View › Quick View Modal — Edge Cases › can open Quick View on multiple products sequentially

--- Browser Diagnostics for "can open Quick View on multiple products sequentially" ---

[1A[2KFailed requests: [
  [32m'GET http://localhost:3000/category/newarrivals - net::ERR_CONNECTION_REFUSED'[39m
]

[1A[2K  14) [chromium] › e2e/product-quick-view.spec.ts:398:9 › Product Quick View › Quick View Modal — Edge Cases › can open Quick View on multiple products sequentially 

    Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/category/newarrivals
    Call log:
    [2m  - navigating to "http://localhost:3000/category/newarrivals", waiting until "domcontentloaded"[22m


      63 |
      64 |   for (const path of categoryPaths) {
    > 65 |     await page.goto(path, { waitUntil: 'domcontentloaded' });
         |                ^
      66 |
      67 |     // Check if we landed on a page with Quick View buttons
      68 |     const quickViewBtn = page.getByTestId('quick-view-btn').first();
        at navigateToPLP (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:65:16)
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:399:13

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Product-de151-tiple-products-sequentially-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[15/19] [chromium] › e2e/product-quick-view.spec.ts:427:9 › Product Quick View › Quick View Modal — Edge Cases › Quick View button is a semantic button element
[1A[2K[chromium] › e2e/product-quick-view.spec.ts:427:9 › Product Quick View › Quick View Modal — Edge Cases › Quick View button is a semantic button element

--- Browser Diagnostics for "Quick View button is a semantic button element" ---

[1A[2KFailed requests: [
  [32m'GET http://localhost:3000/category/newarrivals - net::ERR_CONNECTION_REFUSED'[39m
]

[1A[2K  15) [chromium] › e2e/product-quick-view.spec.ts:427:9 › Product Quick View › Quick View Modal — Edge Cases › Quick View button is a semantic button element 

    Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/category/newarrivals
    Call log:
    [2m  - navigating to "http://localhost:3000/category/newarrivals", waiting until "domcontentloaded"[22m


      63 |
      64 |   for (const path of categoryPaths) {
    > 65 |     await page.goto(path, { waitUntil: 'domcontentloaded' });
         |                ^
      66 |
      67 |     // Check if we landed on a page with Quick View buttons
      68 |     const quickViewBtn = page.getByTestId('quick-view-btn').first();
        at navigateToPLP (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:65:16)
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:428:13

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Product-8678f-s-a-semantic-button-element-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[16/19] [chromium] › e2e/product-quick-view.spec.ts:438:9 › Product Quick View › Quick View Modal — Edge Cases › product tile wrapper has role="group" for hover behavior
[1A[2K[chromium] › e2e/product-quick-view.spec.ts:438:9 › Product Quick View › Quick View Modal — Edge Cases › product tile wrapper has role="group" for hover behavior

--- Browser Diagnostics for "product tile wrapper has role="group" for hover behavior" ---

[1A[2KFailed requests: [
  [32m'GET http://localhost:3000/category/newarrivals - net::ERR_CONNECTION_REFUSED'[39m
]

[1A[2K  16) [chromium] › e2e/product-quick-view.spec.ts:438:9 › Product Quick View › Quick View Modal — Edge Cases › product tile wrapper has role="group" for hover behavior 

    Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/category/newarrivals
    Call log:
    [2m  - navigating to "http://localhost:3000/category/newarrivals", waiting until "domcontentloaded"[22m


      63 |
      64 |   for (const path of categoryPaths) {
    > 65 |     await page.goto(path, { waitUntil: 'domcontentloaded' });
         |                ^
      66 |
      67 |     // Check if we landed on a page with Quick View buttons
      68 |     const quickViewBtn = page.getByTestId('quick-view-btn').first();
        at navigateToPLP (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:65:16)
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:439:13

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Product-d1f6e-le-group-for-hover-behavior-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[17/19] [chromium] › e2e/storefront-smoke.spec.ts:52:7 › Storefront Smoke Tests › homepage loads and renders
[1A[2K[chromium] › e2e/storefront-smoke.spec.ts:52:7 › Storefront Smoke Tests › homepage loads and renders

--- Browser Diagnostics for "homepage loads and renders" ---

[1A[2KFailed requests: [ [32m'GET http://localhost:3000/ - net::ERR_CONNECTION_REFUSED'[39m ]

[1A[2K  17) [chromium] › e2e/storefront-smoke.spec.ts:52:7 › Storefront Smoke Tests › homepage loads and renders 

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


[1A[2K[18/19] [chromium] › e2e/storefront-smoke.spec.ts:59:7 › Storefront Smoke Tests › can navigate to a category/PLP page
[1A[2K[chromium] › e2e/storefront-smoke.spec.ts:59:7 › Storefront Smoke Tests › can navigate to a category/PLP page

--- Browser Diagnostics for "can navigate to a category/PLP page" ---

[1A[2KFailed requests: [ [32m'GET http://localhost:3000/ - net::ERR_CONNECTION_REFUSED'[39m ]

[1A[2K  18) [chromium] › e2e/storefront-smoke.spec.ts:59:7 › Storefront Smoke Tests › can navigate to a category/PLP page 

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


[1A[2K[19/19] [chromium] › e2e/storefront-smoke.spec.ts:71:7 › Storefront Smoke Tests › product detail page shows product info
[1A[2K[chromium] › e2e/storefront-smoke.spec.ts:71:7 › Storefront Smoke Tests › product detail page shows product info

--- Browser Diagnostics for "product detail page shows product info" ---

[1A[2KFailed requests: [ [32m'GET http://localhost:3000/ - net::ERR_CONNECTION_REFUSED'[39m ]

[1A[2K  19) [chromium] › e2e/storefront-smoke.spec.ts:71:7 › Storefront Smoke Tests › product detail page shows product info 

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


[1A[2K  19 failed
    [chromium] › e2e/product-quick-view.spec.ts:148:9 › Product Quick View › Quick View Overlay Bar › Quick View button appears on product tiles on PLP 
    [chromium] › e2e/product-quick-view.spec.ts:158:9 › Product Quick View › Quick View Overlay Bar › Quick View button has correct accessible label 
    [chromium] › e2e/product-quick-view.spec.ts:170:9 › Product Quick View › Quick View Overlay Bar › Quick View button contains "Quick View" text 
    [chromium] › e2e/product-quick-view.spec.ts:181:9 › Product Quick View › Quick View Overlay Bar › Quick View button becomes visible on hover (desktop) 
    [chromium] › e2e/product-quick-view.spec.ts:197:9 › Product Quick View › Quick View Overlay Bar › clicking Quick View does not navigate away from PLP 
    [chromium] › e2e/product-quick-view.spec.ts:215:9 › Product Quick View › Quick View Modal — Opening & Content › clicking Quick View button opens the modal 
    [chromium] › e2e/product-quick-view.spec.ts:231:9 › Product Quick View › Quick View Modal — Opening & Content › modal shows spinner while loading then resolves to content or error 
    [chromium] › e2e/product-quick-view.spec.ts:251:9 › Product Quick View › Quick View Modal — Opening & Content › modal has accessible aria-label with product name 
    [chromium] › e2e/product-quick-view.spec.ts:269:9 › Product Quick View › Quick View Modal — Opening & Content › modal loads product content with image and interactive elements 
    [chromium] › e2e/product-quick-view.spec.ts:303:9 › Product Quick View › Quick View Modal — Opening & Content › modal shows "View Full Details" link to PDP 
    [chromium] › e2e/product-quick-view.spec.ts:327:9 › Product Quick View › Quick View Modal — Closing › modal closes when X button is clicked 
    [chromium] › e2e/product-quick-view.spec.ts:348:9 › Product Quick View › Quick View Modal — Closing › modal closes when Escape key is pressed 
    [chromium] › e2e/product-quick-view.spec.ts:368:9 › Product Quick View › Quick View Modal — Closing › PLP remains intact after closing the modal 
    [chromium] › e2e/product-quick-view.spec.ts:398:9 › Product Quick View › Quick View Modal — Edge Cases › can open Quick View on multiple products sequentially 
    [chromium] › e2e/product-quick-view.spec.ts:427:9 › Product Quick View › Quick View Modal — Edge Cases › Quick View button is a semantic button element 
    [chromium] › e2e/product-quick-view.spec.ts:438:9 › Product Quick View › Quick View Modal — Edge Cases › product tile wrapper has role="group" for hover behavior 
    [chromium] › e2e/storefront-smoke.spec.ts:52:7 › Storefront Smoke Tests › homepage loads and renders 
    [chromium] › e2e/storefront-smoke.spec.ts:59:7 › Storefront Smoke Tests › can navigate to a category/PLP page 
    [chromium] › e2e/storefront-smoke.spec.ts:71:7 › Storefront Smoke Tests › product detail page shows product info 
[1A[2K[2m[WebServer] [22m(node:69636) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
[2m[WebServer] [22m(Use `node --trace-deprecation ...` to show where the warning was created)
[1A[2K[2m[WebServer] [22mKilled