Running 13 tests using 1 worker

[1A[2K[1/13] [chromium] › e2e/product-quick-view.spec.ts:162:9 › Product Quick View › Quick View buttons are visible on product tiles on the PLP







[1A[2K  1) [chromium] › e2e/product-quick-view.spec.ts:162:9 › Product Quick View › Quick View buttons are visible on product tiles on the PLP 

    TimeoutError: locator.waitFor: Timeout 15000ms exceeded.
    Call log:
    [2m  - waiting for locator('[data-testid="product-tile"]').first() to be visible[22m


      86 |
      87 |     // Wait for at least one product tile to render
    > 88 |     await page.locator('[data-testid="product-tile"]').first().waitFor({
         |                                                                ^
      89 |         state: 'visible',
      90 |         timeout: 15_000,
      91 |     });
        at navigateToPLP (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:88:64)
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:165:9

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Product-ca069-on-product-tiles-on-the-PLP-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    attachment #2: browser-diagnostics (text/plain) ────────────────────────────────────────────────
    Console errors (8):
      • Warning: The result of getServerSnapshot should be cached to avoid an infinite loop%s 
        at App (http://localhost:3000/mobify/bundle/development/main.js:212:5)
        at RouteComponent (http://localhost:3000/mobify/bundle/development/vendor.js:23025:7)
        at C (http://localho...
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/product-quick-view-Product-ca069-on-product-tiles-on-the-PLP-chromium/error-context.md


[1A[2K[2/13] [chromium] › e2e/product-quick-view.spec.ts:180:9 › Product Quick View › Quick View button has aria-label containing "Quick View"


[1A[2K  2) [chromium] › e2e/product-quick-view.spec.ts:180:9 › Product Quick View › Quick View button has aria-label containing "Quick View" 

    TimeoutError: locator.waitFor: Timeout 15000ms exceeded.
    Call log:
    [2m  - waiting for locator('[data-testid="product-tile"]').first() to be visible[22m


      86 |
      87 |     // Wait for at least one product tile to render
    > 88 |     await page.locator('[data-testid="product-tile"]').first().waitFor({
         |                                                                ^
      89 |         state: 'visible',
      90 |         timeout: 15_000,
      91 |     });
        at navigateToPLP (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:88:64)
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:183:9

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Product-b6049-abel-containing-Quick-View--chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    attachment #2: browser-diagnostics (text/plain) ────────────────────────────────────────────────
    Console errors (8):
      • Warning: The result of getServerSnapshot should be cached to avoid an infinite loop%s 
        at App (http://localhost:3000/mobify/bundle/development/main.js:212:5)
        at RouteComponent (http://localhost:3000/mobify/bundle/development/vendor.js:23025:7)
        at C (http://localho...
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/product-quick-view-Product-b6049-abel-containing-Quick-View--chromium/error-context.md


[1A[2K[3/13] [chromium] › e2e/product-quick-view.spec.ts:199:9 › Product Quick View › clicking Quick View button opens the modal with product content


[1A[2K  3) [chromium] › e2e/product-quick-view.spec.ts:199:9 › Product Quick View › clicking Quick View button opens the modal with product content 

    TimeoutError: locator.waitFor: Timeout 15000ms exceeded.
    Call log:
    [2m  - waiting for locator('[data-testid="product-tile"]').first() to be visible[22m


      86 |
      87 |     // Wait for at least one product tile to render
    > 88 |     await page.locator('[data-testid="product-tile"]').first().waitFor({
         |                                                                ^
      89 |         state: 'visible',
      90 |         timeout: 15_000,
      91 |     });
        at navigateToPLP (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:88:64)
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:202:9

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Product-35c31--modal-with-product-content-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    attachment #2: browser-diagnostics (text/plain) ────────────────────────────────────────────────
    Console errors (8):
      • Warning: The result of getServerSnapshot should be cached to avoid an infinite loop%s 
        at App (http://localhost:3000/mobify/bundle/development/main.js:212:5)
        at RouteComponent (http://localhost:3000/mobify/bundle/development/vendor.js:23025:7)
        at C (http://localho...
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/product-quick-view-Product-35c31--modal-with-product-content-chromium/error-context.md


[1A[2K[4/13] [chromium] › e2e/product-quick-view.spec.ts:228:9 › Product Quick View › modal shows a loading spinner while product data fetches


[1A[2K  4) [chromium] › e2e/product-quick-view.spec.ts:228:9 › Product Quick View › modal shows a loading spinner while product data fetches 

    TimeoutError: locator.waitFor: Timeout 15000ms exceeded.
    Call log:
    [2m  - waiting for locator('[data-testid="product-tile"]').first() to be visible[22m


      86 |
      87 |     // Wait for at least one product tile to render
    > 88 |     await page.locator('[data-testid="product-tile"]').first().waitFor({
         |                                                                ^
      89 |         state: 'visible',
      90 |         timeout: 15_000,
      91 |     });
        at navigateToPLP (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:88:64)
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:231:9

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Product-578d4--while-product-data-fetches-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    attachment #2: browser-diagnostics (text/plain) ────────────────────────────────────────────────
    Console errors (8):
      • Warning: The result of getServerSnapshot should be cached to avoid an infinite loop%s 
        at App (http://localhost:3000/mobify/bundle/development/main.js:212:5)
        at RouteComponent (http://localhost:3000/mobify/bundle/development/vendor.js:23025:7)
        at C (http://localho...
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/product-quick-view-Product-578d4--while-product-data-fetches-chromium/error-context.md


[1A[2K[5/13] [chromium] › e2e/product-quick-view.spec.ts:261:9 › Product Quick View › modal has data-testid="quick-view-modal" and accessible aria-label


[1A[2K  5) [chromium] › e2e/product-quick-view.spec.ts:261:9 › Product Quick View › modal has data-testid="quick-view-modal" and accessible aria-label 

    TimeoutError: locator.waitFor: Timeout 15000ms exceeded.
    Call log:
    [2m  - waiting for locator('[data-testid="product-tile"]').first() to be visible[22m


      86 |
      87 |     // Wait for at least one product tile to render
    > 88 |     await page.locator('[data-testid="product-tile"]').first().waitFor({
         |                                                                ^
      89 |         state: 'visible',
      90 |         timeout: 15_000,
      91 |     });
        at navigateToPLP (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:88:64)
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:264:9

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Product-b7557-l-and-accessible-aria-label-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    attachment #2: browser-diagnostics (text/plain) ────────────────────────────────────────────────
    Console errors (8):
      • Warning: The result of getServerSnapshot should be cached to avoid an infinite loop%s 
        at App (http://localhost:3000/mobify/bundle/development/main.js:212:5)
        at RouteComponent (http://localhost:3000/mobify/bundle/development/vendor.js:23025:7)
        at C (http://localho...
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/product-quick-view-Product-b7557-l-and-accessible-aria-label-chromium/error-context.md


[1A[2K[6/13] [chromium] › e2e/product-quick-view.spec.ts:284:9 › Product Quick View › modal closes when the close button is clicked


[1A[2K  6) [chromium] › e2e/product-quick-view.spec.ts:284:9 › Product Quick View › modal closes when the close button is clicked 

    TimeoutError: locator.waitFor: Timeout 15000ms exceeded.
    Call log:
    [2m  - waiting for locator('[data-testid="product-tile"]').first() to be visible[22m


      86 |
      87 |     // Wait for at least one product tile to render
    > 88 |     await page.locator('[data-testid="product-tile"]').first().waitFor({
         |                                                                ^
      89 |         state: 'visible',
      90 |         timeout: 15_000,
      91 |     });
        at navigateToPLP (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:88:64)
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:285:9

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Product-848b0-the-close-button-is-clicked-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    attachment #2: browser-diagnostics (text/plain) ────────────────────────────────────────────────
    Console errors (8):
      • Warning: The result of getServerSnapshot should be cached to avoid an infinite loop%s 
        at App (http://localhost:3000/mobify/bundle/development/main.js:212:5)
        at RouteComponent (http://localhost:3000/mobify/bundle/development/vendor.js:23025:7)
        at C (http://localho...
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/product-quick-view-Product-848b0-the-close-button-is-clicked-chromium/error-context.md


[1A[2K[7/13] [chromium] › e2e/product-quick-view.spec.ts:308:9 › Product Quick View › modal closes when Escape key is pressed


[1A[2K  7) [chromium] › e2e/product-quick-view.spec.ts:308:9 › Product Quick View › modal closes when Escape key is pressed 

    TimeoutError: locator.waitFor: Timeout 15000ms exceeded.
    Call log:
    [2m  - waiting for locator('[data-testid="product-tile"]').first() to be visible[22m


      86 |
      87 |     // Wait for at least one product tile to render
    > 88 |     await page.locator('[data-testid="product-tile"]').first().waitFor({
         |                                                                ^
      89 |         state: 'visible',
      90 |         timeout: 15_000,
      91 |     });
        at navigateToPLP (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:88:64)
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:309:9

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Product-ff9e9--when-Escape-key-is-pressed-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    attachment #2: browser-diagnostics (text/plain) ────────────────────────────────────────────────
    Console errors (8):
      • Warning: The result of getServerSnapshot should be cached to avoid an infinite loop%s 
        at App (http://localhost:3000/mobify/bundle/development/main.js:212:5)
        at RouteComponent (http://localhost:3000/mobify/bundle/development/vendor.js:23025:7)
        at C (http://localho...
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/product-quick-view-Product-ff9e9--when-Escape-key-is-pressed-chromium/error-context.md


[1A[2K[8/13] [chromium] › e2e/product-quick-view.spec.ts:331:9 › Product Quick View › URL remains on the PLP throughout Quick View open/close cycle


[1A[2K  8) [chromium] › e2e/product-quick-view.spec.ts:331:9 › Product Quick View › URL remains on the PLP throughout Quick View open/close cycle 

    TimeoutError: locator.waitFor: Timeout 15000ms exceeded.
    Call log:
    [2m  - waiting for locator('[data-testid="product-tile"]').first() to be visible[22m


      86 |
      87 |     // Wait for at least one product tile to render
    > 88 |     await page.locator('[data-testid="product-tile"]').first().waitFor({
         |                                                                ^
      89 |         state: 'visible',
      90 |         timeout: 15_000,
      91 |     });
        at navigateToPLP (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:88:64)
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:334:9

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Product-3f87b-Quick-View-open-close-cycle-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    attachment #2: browser-diagnostics (text/plain) ────────────────────────────────────────────────
    Console errors (8):
      • Warning: The result of getServerSnapshot should be cached to avoid an infinite loop%s 
        at App (http://localhost:3000/mobify/bundle/development/main.js:212:5)
        at RouteComponent (http://localhost:3000/mobify/bundle/development/vendor.js:23025:7)
        at C (http://localho...
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/product-quick-view-Product-3f87b-Quick-View-open-close-cycle-chromium/error-context.md


[1A[2K[9/13] [chromium] › e2e/product-quick-view.spec.ts:362:9 › Product Quick View › clicking Quick View does not trigger PDP navigation


[1A[2K  9) [chromium] › e2e/product-quick-view.spec.ts:362:9 › Product Quick View › clicking Quick View does not trigger PDP navigation 

    TimeoutError: locator.waitFor: Timeout 15000ms exceeded.
    Call log:
    [2m  - waiting for locator('[data-testid="product-tile"]').first() to be visible[22m


      86 |
      87 |     // Wait for at least one product tile to render
    > 88 |     await page.locator('[data-testid="product-tile"]').first().waitFor({
         |                                                                ^
      89 |         state: 'visible',
      90 |         timeout: 15_000,
      91 |     });
        at navigateToPLP (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:88:64)
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:365:9

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Product-9f2fe--not-trigger-PDP-navigation-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    attachment #2: browser-diagnostics (text/plain) ────────────────────────────────────────────────
    Console errors (8):
      • Warning: The result of getServerSnapshot should be cached to avoid an infinite loop%s 
        at App (http://localhost:3000/mobify/bundle/development/main.js:212:5)
        at RouteComponent (http://localhost:3000/mobify/bundle/development/vendor.js:23025:7)
        at C (http://localho...
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/product-quick-view-Product-9f2fe--not-trigger-PDP-navigation-chromium/error-context.md


[1A[2K[10/13] [chromium] › e2e/product-quick-view.spec.ts:390:9 › Product Quick View › Quick View can be opened and closed multiple times without breaking


[1A[2K  10) [chromium] › e2e/product-quick-view.spec.ts:390:9 › Product Quick View › Quick View can be opened and closed multiple times without breaking 

    TimeoutError: locator.waitFor: Timeout 15000ms exceeded.
    Call log:
    [2m  - waiting for locator('[data-testid="product-tile"]').first() to be visible[22m


      86 |
      87 |     // Wait for at least one product tile to render
    > 88 |     await page.locator('[data-testid="product-tile"]').first().waitFor({
         |                                                                ^
      89 |         state: 'visible',
      90 |         timeout: 15_000,
      91 |     });
        at navigateToPLP (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:88:64)
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:393:9

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Product-e1694-iple-times-without-breaking-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    attachment #2: browser-diagnostics (text/plain) ────────────────────────────────────────────────
    Console errors (8):
      • Warning: The result of getServerSnapshot should be cached to avoid an infinite loop%s 
        at App (http://localhost:3000/mobify/bundle/development/main.js:212:5)
        at RouteComponent (http://localhost:3000/mobify/bundle/development/vendor.js:23025:7)
        at C (http://localho...
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/product-quick-view-Product-e1694-iple-times-without-breaking-chromium/error-context.md


[1A[2K[11/13] [chromium] › e2e/product-quick-view.spec.ts:419:9 › Product Quick View › Quick View trigger is rendered as a <button> element for accessibility


[1A[2K  11) [chromium] › e2e/product-quick-view.spec.ts:419:9 › Product Quick View › Quick View trigger is rendered as a <button> element for accessibility 

    TimeoutError: locator.waitFor: Timeout 15000ms exceeded.
    Call log:
    [2m  - waiting for locator('[data-testid="product-tile"]').first() to be visible[22m


      86 |
      87 |     // Wait for at least one product tile to render
    > 88 |     await page.locator('[data-testid="product-tile"]').first().waitFor({
         |                                                                ^
      89 |         state: 'visible',
      90 |         timeout: 15_000,
      91 |     });
        at navigateToPLP (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:88:64)
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:422:9

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Product-cd388-n-element-for-accessibility-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    attachment #2: browser-diagnostics (text/plain) ────────────────────────────────────────────────
    Console errors (8):
      • Warning: The result of getServerSnapshot should be cached to avoid an infinite loop%s 
        at App (http://localhost:3000/mobify/bundle/development/main.js:212:5)
        at RouteComponent (http://localhost:3000/mobify/bundle/development/vendor.js:23025:7)
        at C (http://localho...
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/product-quick-view-Product-cd388-n-element-for-accessibility-chromium/error-context.md


[1A[2K[12/13] [chromium] › e2e/product-quick-view.spec.ts:437:9 › Product Quick View › Quick View buttons appear on product tiles (one per eligible tile)


[1A[2K  12) [chromium] › e2e/product-quick-view.spec.ts:437:9 › Product Quick View › Quick View buttons appear on product tiles (one per eligible tile) 

    TimeoutError: locator.waitFor: Timeout 15000ms exceeded.
    Call log:
    [2m  - waiting for locator('[data-testid="product-tile"]').first() to be visible[22m


      86 |
      87 |     // Wait for at least one product tile to render
    > 88 |     await page.locator('[data-testid="product-tile"]').first().waitFor({
         |                                                                ^
      89 |         state: 'visible',
      90 |         timeout: 15_000,
      91 |     });
        at navigateToPLP (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:88:64)
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:440:9

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Product-45a69-iles-one-per-eligible-tile--chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    attachment #2: browser-diagnostics (text/plain) ────────────────────────────────────────────────
    Console errors (8):
      • Warning: The result of getServerSnapshot should be cached to avoid an infinite loop%s 
        at App (http://localhost:3000/mobify/bundle/development/main.js:212:5)
        at RouteComponent (http://localhost:3000/mobify/bundle/development/vendor.js:23025:7)
        at C (http://localho...
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/product-quick-view-Product-45a69-iles-one-per-eligible-tile--chromium/error-context.md


[1A[2K[13/13] [chromium] › e2e/product-quick-view.spec.ts:459:9 › Product Quick View › clicking the modal overlay backdrop closes the modal


[1A[2K  13) [chromium] › e2e/product-quick-view.spec.ts:459:9 › Product Quick View › clicking the modal overlay backdrop closes the modal 

    TimeoutError: locator.waitFor: Timeout 15000ms exceeded.
    Call log:
    [2m  - waiting for locator('[data-testid="product-tile"]').first() to be visible[22m


      86 |
      87 |     // Wait for at least one product tile to render
    > 88 |     await page.locator('[data-testid="product-tile"]').first().waitFor({
         |                                                                ^
      89 |         state: 'visible',
      90 |         timeout: 15_000,
      91 |     });
        at navigateToPLP (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:88:64)
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:462:9

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Product-029c7-y-backdrop-closes-the-modal-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    attachment #2: browser-diagnostics (text/plain) ────────────────────────────────────────────────
    Console errors (8):
      • Warning: The result of getServerSnapshot should be cached to avoid an infinite loop%s 
        at App (http://localhost:3000/mobify/bundle/development/main.js:212:5)
        at RouteComponent (http://localhost:3000/mobify/bundle/development/vendor.js:23025:7)
        at C (http://localho...
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/product-quick-view-Product-029c7-y-backdrop-closes-the-modal-chromium/error-context.md


[1A[2K  13 failed
    [chromium] › e2e/product-quick-view.spec.ts:162:9 › Product Quick View › Quick View buttons are visible on product tiles on the PLP 
    [chromium] › e2e/product-quick-view.spec.ts:180:9 › Product Quick View › Quick View button has aria-label containing "Quick View" 
    [chromium] › e2e/product-quick-view.spec.ts:199:9 › Product Quick View › clicking Quick View button opens the modal with product content 
    [chromium] › e2e/product-quick-view.spec.ts:228:9 › Product Quick View › modal shows a loading spinner while product data fetches 
    [chromium] › e2e/product-quick-view.spec.ts:261:9 › Product Quick View › modal has data-testid="quick-view-modal" and accessible aria-label 
    [chromium] › e2e/product-quick-view.spec.ts:284:9 › Product Quick View › modal closes when the close button is clicked 
    [chromium] › e2e/product-quick-view.spec.ts:308:9 › Product Quick View › modal closes when Escape key is pressed 
    [chromium] › e2e/product-quick-view.spec.ts:331:9 › Product Quick View › URL remains on the PLP throughout Quick View open/close cycle 
    [chromium] › e2e/product-quick-view.spec.ts:362:9 › Product Quick View › clicking Quick View does not trigger PDP navigation 
    [chromium] › e2e/product-quick-view.spec.ts:390:9 › Product Quick View › Quick View can be opened and closed multiple times without breaking 
    [chromium] › e2e/product-quick-view.spec.ts:419:9 › Product Quick View › Quick View trigger is rendered as a <button> element for accessibility 
    [chromium] › e2e/product-quick-view.spec.ts:437:9 › Product Quick View › Quick View buttons appear on product tiles (one per eligible tile) 
    [chromium] › e2e/product-quick-view.spec.ts:459:9 › Product Quick View › clicking the modal overlay backdrop closes the modal 
[1A[2K[2m[WebServer] [22m(node:49852) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
[2m[WebServer] [22m(Use `node --trace-deprecation ...` to show where the warning was created)
[1A[2K[2m[WebServer] [22m(node:49877) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
[2m[WebServer] [22m(Use `node --trace-deprecation ...` to show where the warning was created)
[1A[2K[2m[WebServer] [22m(node:49877) [DEP0060] DeprecationWarning: The `util._extend` API is deprecated. Please use Object.assign() instead.
[1A[2K[2m[WebServer] [22mWarning: PageDesignerProvider: Support for defaultProps will be removed from function components in a future major release. Use JavaScript default parameters instead.
[2m[WebServer] [22m    at PageDesignerProvider (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:308646:33)
[2m[WebServer] [22m    at OfflineBoundary (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:9619:5)
[2m[WebServer] [22m    at C (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:249692:37)
[2m[WebServer] [22m    at main
[2m[WebServer] [22m    at /workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:95421:68
[2m[WebServer] [22m    at ChakraComponent (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:280332:102)
[2m[WebServer] [22m    at div
[2m[WebServer] [22m    at /workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:95421:68
[2m[WebServer] [22m    at ChakraComponent (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:280332:102)
[2m[WebServer] [22m    at SkipNavContent2 (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:278235:13)
[2m[WebServer] [22m    at BonusProductSelectionModalProvider (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:52024:3)
[2m[WebServer] [22m    at AddToCartModalProvider (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:50276:3)
[2m[WebServer] [22m    at div
[2m[WebServer] [22m    at /workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:95421:68
[2m[WebServer] [22m    at ChakraComponent (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:280332:102)
[2m[WebServer] [22m    at CurrencyProvider (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:49953:13)
[2m[WebServer] [22m    at IntlProvider (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:243393:47)
[2m[WebServer] [22m    at StorefrontPreview (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:123031:3)
[2m[WebServer] [22m    at div
[2m[WebServer] [22m    at /workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:95421:68
[2m[WebServer] [22m    at ChakraComponent (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:280332:102)
[2m[WebServer] [22m    at App (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:210:5)
[2m[WebServer] [22m    at RouteComponent (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:133548:7)
[2m[WebServer] [22m    at C (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:249692:37)
[2m[WebServer] [22m    at WithErrorHandling(withRouter(routeComponent(App)))
[2m[WebServer] [22m    at AppErrorBoundary (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:133188:5)
[2m[WebServer] [22m    at WrappedComponent (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:134041:42)
[2m[WebServer] [22m    at C (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:249692:37)
[2m[WebServer] [22m    at UIDReset (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:251482:23)
[2m[WebServer] [22m    at Switch (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:133933:5)
[2m[WebServer] [22m    at EnvironmentProvider (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:277049:11)
[2m[WebServer] [22m    at ColorModeProvider (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:269187:5)
[2m[WebServer] [22m    at ThemeProvider (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:95464:50)
[2m[WebServer] [22m    at ThemeProvider (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:280163:11)
[2m[WebServer] [22m    at ChakraProvider (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:276341:5)
[2m[WebServer] [22m    at ChakraProvider2 (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:277762:5)
[2m[WebServer] [22m    at StoreLocatorProvider (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:23156:3)
[2m[WebServer] [22m    at MultiSiteProvider (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:49905:9)
[2m[WebServer] [22m    at CommerceApiProvider (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:131969:5)
[2m[WebServer] [22m    at AppConfig (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:68882:3)
[2m[WebServer] [22m    at Hydrate (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:150227:3)
[2m[WebServer] [22m    at QueryClientProvider (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:150295:3)
[2m[WebServer] [22m    at WithReactQuery (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:134218:3)
[2m[WebServer] [22m    at CorrelationIdProvider (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:134363:3)
[2m[WebServer] [22m    at Router (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:249054:30)
[2m[WebServer] [22m    at StaticRouter (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:249550:35)
[2m[WebServer] [22m    at OuterApp (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:132823:3)
[2m[WebServer] [22m    at ChunkExtractorManager (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:288765:24)
[1A[2K[2m[WebServer] [22mWarning: Document: Support for defaultProps will be removed from function components in a future major release. Use JavaScript default parameters instead.
[2m[WebServer] [22m    at Document (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:133105:5)
[1A[2K[2m[WebServer] [22mWarning: React does not recognize the `fetchPriority` prop on a DOM element. If you intentionally want it to appear in the DOM as a custom attribute, spell it as lowercase `fetchpriority` instead. If you accidentally passed it from a parent component, remove it from the DOM element.
[2m[WebServer] [22m    at link
[2m[WebServer] [22m    at head
[2m[WebServer] [22m    at html
[2m[WebServer] [22m    at Document (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:133105:5)
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (01459a4c-3958-401a-aca2-9666909ea76a) GET /mobify/proxy/api/shopper/shopper-context/v1/organizations/f_ecom_aaia_prd/shopper-context/669233cc-8d4f-4436-b5f1-2f766e5dea55?siteId=RefArch 403 106.183 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (6f7776c3-bda5-4c0c-a802-86fdab397249) GET /mobify/proxy/api/configuration/shopper-configurations/v1/organizations/f_ecom_aaia_prd/configurations?siteId=RefArch 403 482.614 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (ab5a2be0-02fc-4fa9-8d5b-bb90b3bb2ae1) GET /mobify/proxy/api/configuration/shopper-configurations/v1/organizations/f_ecom_aaia_prd/configurations?siteId=RefArch 403 617.840 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (fa11a27a-f8de-4dac-ad7c-94bad7f68752) GET /mobify/proxy/api/shopper/shopper-context/v1/organizations/f_ecom_aaia_prd/shopper-context/ba41a510-37a1-417e-b654-eff07e6fc115?siteId=RefArch 403 502.026 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (b3c5c496-a82f-44e7-8d19-badc0ee11d3b) GET /mobify/proxy/api/shopper/shopper-context/v1/organizations/f_ecom_aaia_prd/shopper-context/72721d81-a4d2-473b-a318-226e7fd6ef64?siteId=RefArch 403 107.223 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (8423ba02-5179-4517-b5aa-958ab7885f7a) GET /mobify/proxy/api/configuration/shopper-configurations/v1/organizations/f_ecom_aaia_prd/configurations?siteId=RefArch 403 499.956 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (065ca6cd-46ac-490c-a465-a476d0f7b619) GET /mobify/proxy/api/configuration/shopper-configurations/v1/organizations/f_ecom_aaia_prd/configurations?siteId=RefArch 403 559.609 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (38c1dc04-c248-4ff4-a2e5-8b9b3902ae2c) GET /mobify/proxy/api/shopper/shopper-context/v1/organizations/f_ecom_aaia_prd/shopper-context/2848a013-3e5b-4300-9cb4-57c74ce332fd?siteId=RefArch 403 546.084 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (1a56238b-a99c-4e5f-b712-89eb695e4bb3) GET /mobify/proxy/api/configuration/shopper-configurations/v1/organizations/f_ecom_aaia_prd/configurations?siteId=RefArch 403 129.961 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (4fdf0950-e0b1-482d-a5e2-edbce2847193) GET /mobify/proxy/api/shopper/shopper-context/v1/organizations/f_ecom_aaia_prd/shopper-context/3315624e-1c52-43b3-8404-f85aba91ff47?siteId=RefArch 403 480.138 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (8ea9bd26-6ed1-4331-a632-a256430a1d41) GET /mobify/proxy/api/shopper/shopper-context/v1/organizations/f_ecom_aaia_prd/shopper-context/219f2487-c5c2-4d53-a977-610fca0e7a17?siteId=RefArch 403 135.256 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (d99e5d4a-797b-44b9-835c-8df5d6315995) GET /mobify/proxy/api/configuration/shopper-configurations/v1/organizations/f_ecom_aaia_prd/configurations?siteId=RefArch 403 499.260 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (29070957-b319-4428-87fa-5b9e5a71c58d) GET /mobify/proxy/api/configuration/shopper-configurations/v1/organizations/f_ecom_aaia_prd/configurations?siteId=RefArch 403 119.870 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (47252f0d-a5c0-46d8-a1b5-fef74f919f1d) GET /mobify/proxy/api/shopper/shopper-context/v1/organizations/f_ecom_aaia_prd/shopper-context/2d49fce3-3e74-42a0-8848-9d7ff4e72a9e?siteId=RefArch 403 447.757 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (d404905e-00a1-4513-ae0a-ae88f1ad23ee) GET /mobify/proxy/api/shopper/shopper-context/v1/organizations/f_ecom_aaia_prd/shopper-context/f4587c8f-fd48-40a1-bdb1-7a6813c48848?siteId=RefArch 403 126.927 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (c1c3a1b0-cabe-4aaf-9de5-b6e57f3911cb) GET /mobify/proxy/api/configuration/shopper-configurations/v1/organizations/f_ecom_aaia_prd/configurations?siteId=RefArch 403 489.837 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (fa682836-0671-4ca3-a2ea-273b0fd17646) GET /mobify/proxy/api/configuration/shopper-configurations/v1/organizations/f_ecom_aaia_prd/configurations?siteId=RefArch 403 143.505 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (ad8f4ce5-38fe-48a6-9a74-59da6df541c8) GET /mobify/proxy/api/shopper/shopper-context/v1/organizations/f_ecom_aaia_prd/shopper-context/1dec0ee7-2b93-4645-9328-8c01ef8504e2?siteId=RefArch 403 110.446 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (e7dcea7e-36a8-442a-8778-2864e18d543e) GET /mobify/proxy/api/configuration/shopper-configurations/v1/organizations/f_ecom_aaia_prd/configurations?siteId=RefArch 403 118.760 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (e4cfb59d-b617-42ad-b287-1be4dd45cc26) GET /mobify/proxy/api/shopper/shopper-context/v1/organizations/f_ecom_aaia_prd/shopper-context/e846db6f-27a3-46a2-9c03-96a09f603c43?siteId=RefArch 403 630.142 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (9ec00acf-156f-4bb5-8937-57c3f5368242) GET /mobify/proxy/api/configuration/shopper-configurations/v1/organizations/f_ecom_aaia_prd/configurations?siteId=RefArch 403 525.573 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (aed0b3f6-217b-4525-bd66-341abaf34da3) GET /mobify/proxy/api/shopper/shopper-context/v1/organizations/f_ecom_aaia_prd/shopper-context/998572ce-1f2e-4ff3-9679-6559899a11a1?siteId=RefArch 403 435.326 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (fab6e8ff-2c64-4572-8058-0066c11ef935) GET /mobify/proxy/api/configuration/shopper-configurations/v1/organizations/f_ecom_aaia_prd/configurations?siteId=RefArch 403 122.641 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (8d278b6a-d832-486a-b028-f0e16ac426e1) GET /mobify/proxy/api/shopper/shopper-context/v1/organizations/f_ecom_aaia_prd/shopper-context/e531139a-013a-4bee-afe9-2beb48982d19?siteId=RefArch 403 480.703 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (26256cf2-3b32-411a-ae8e-49393bd9f949) GET /mobify/proxy/api/configuration/shopper-configurations/v1/organizations/f_ecom_aaia_prd/configurations?siteId=RefArch 403 125.668 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (33b2aca0-d738-4b5f-a5ff-5a08e09d7ac5) GET /mobify/proxy/api/shopper/shopper-context/v1/organizations/f_ecom_aaia_prd/shopper-context/d37d0818-1b5c-45f5-aa9b-2c7f33a556c4?siteId=RefArch 403 125.010 ms - 161
[2m[WebServer] [22m