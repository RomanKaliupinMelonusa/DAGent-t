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










[1A[2K[chromium] › e2e/storefront-smoke.spec.ts:59:7 › Storefront Smoke Tests › can navigate to a category/PLP page

--- Browser Diagnostics for "can navigate to a category/PLP page" ---

[1A[2KConsole errors: [
  [32m'Warning: The result of getServerSnapshot should be cached to avoid an infinite loop%s \n'[39m +
    [32m'    at App (http://localhost:3000/mobify/bundle/development/main.js:212:5)\n'[39m +
    [32m'    at RouteComponent (http://localhost:3000/mobify/bundle/development/vendor.js:23025:7)\n'[39m +
    [32m'    at C (http://localhost:3000/mobify/bundle/development/vendor.js:94230:37)\n'[39m +
    [32m'    at WithErrorHandling(withRouter(routeComponent(App)))\n'[39m +
    [32m'    at AppErrorBoundary (http://localhost:3000/mobify/bundle/development/vendor.js:22665:5)\n'[39m +
    [32m'    at WrappedComponent (http://localhost:3000/mobify/bundle/development/vendor.js:23518:42)\n'[39m +
    [32m'    at C (http://localhost:3000/mobify/bundle/development/vendor.js:94230:37)\n'[39m +
    [32m'    at UIDReset (http://localhost:3000/mobify/bundle/development/vendor.js:96020:23)\n'[39m +
    [32m'    at Switch (http://localhost:3000/mobify/bundle/development/vendor.js:23410:5)\n'[39m +
    [32m'    at EnvironmentProvider (http://localhost:3000/mobify/bundle/development/vendor.js:116747:11)\n'[39m +
    [32m'    at ColorModeProvider (http://localhost:3000/mobify/bundle/development/vendor.js:108885:5)\n'[39m +
    [32m'    at ThemeProvider (http://localhost:3000/mobify/bundle/development/vendor.js:733:50)\n'[39m +
    [32m'    at ThemeProvider (http://localhost:3000/mobify/bundle/development/vendor.js:119861:11)\n'[39m +
    [32m'    at ChakraProvider (http://localhost:3000/mobify/bundle/development/vendor.js:116039:5)\n'[39m +
    [32m'    at ChakraProvider2 (http://localhost:3000/mobify/bundle/development/vendor.js:117460:5)\n'[39m +
    [32m'    at StoreLocatorProvider (http://localhost:3000/mobify/bundle/development/main.js:17828:3)\n'[39m +
    [32m'    at MultiSiteProvider (http://localhost:3000/mobify/bundle/development/main.js:20292:9)\n'[39m +
    [32m'    at CommerceApiProvider (http://localhost:3000/mobify/bundle/development/vendor.js:22072:5)\n'[39m +
    [32m'    at AppConfig (http://localhost:3000/mobify/bundle/development/main.js:36215:3)\n'[39m +
    [32m'    at Hydrate (http://localhost:3000/mobify/bundle/development/vendor.js:24880:3)\n'[39m +
    [32m'    at QueryClientProvider (http://localhost:3000/mobify/bundle/development/vendor.js:24948:3)\n'[39m +
    [32m'    at WithReactQuery (http://localhost:3000/mobify/bundle/development/vendor.js:23695:3)\n'[39m +
    [32m'    at CorrelationIdProvider (http://localhost:3000/mobify/bundle/development/vendor.js:23840:3)\n'[39m +
    [32m'    at Router (http://localhost:3000/mobify/bundle/development/vendor.js:93592:30)\n'[39m +
    [32m'    at BrowserRouter (http://localhost:3000/mobify/bundle/development/vendor.js:93022:35)\n'[39m +
    [32m'    at OuterApp (http://localhost:3000/mobify/bundle/development/vendor.js:22499:3)'[39m,
  [32m'Warning: %s: Support for defaultProps will be removed from function components in a future major release. Use JavaScript default parameters instead.%s PageDesignerProvider \n'[39m +
    [32m'    at PageDesignerProvider (http://localhost:3000/mobify/bundle/development/vendor.js:140177:33)\n'[39m +
    [32m'    at OfflineBoundary (http://localhost:3000/mobify/bundle/development/main.js:6473:5)\n'[39m +
    [32m'    at C (http://localhost:3000/mobify/bundle/development/vendor.js:94230:37)\n'[39m +
    [32m'    at main\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:682:66\n'[39m +
    [32m'    at ChakraComponent (http://localhost:3000/mobify/bundle/development/vendor.js:120030:102)\n'[39m +
    [32m'    at div\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:682:66\n'[39m +
    [32m'    at ChakraComponent (http://localhost:3000/mobify/bundle/development/vendor.js:120030:102)\n'[39m +
    [32m'    at SkipNavContent2 (http://localhost:3000/mobify/bundle/development/vendor.js:117933:13)\n'[39m +
    [32m'    at BonusProductSelectionModalProvider (http://localhost:3000/mobify/bundle/development/main.js:22294:3)\n'[39m +
    [32m'    at AddToCartModalProvider (http://localhost:3000/mobify/bundle/development/main.js:20678:3)\n'[39m +
    [32m'    at div\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:682:66\n'[39m +
    [32m'    at ChakraComponent (http://localhost:3000/mobify/bundle/development/vendor.js:120030:102)\n'[39m +
    [32m'    at CurrencyProvider (http://localhost:3000/mobify/bundle/development/main.js:20343:13)\n'[39m +
    [32m'    at IntlProvider (http://localhost:3000/mobify/bundle/development/vendor.js:87245:47)\n'[39m +
    [32m'    at StorefrontPreview (http://localhost:3000/mobify/bundle/development/vendor.js:13134:3)\n'[39m +
    [32m'    at div\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:682:66\n'[39m +
    [32m'    at ChakraComponent (http://localhost:3000/mobify/bundle/development/vendor.js:120030:102)\n'[39m +
    [32m'    at App (http://localhost:3000/mobify/bundle/development/main.js:212:5)\n'[39m +
    [32m'    at RouteComponent (http://localhost:3000/mobify/bundle/development/vendor.js:23025:7)\n'[39m +
    [32m'    at C (http://localhost:3000/mobify/bundle/development/vendor.js:94230:37)\n'[39m +
    [32m'    at WithErrorHandling(withRouter(routeComponent(App)))\n'[39m +
    [32m'    at AppErrorBoundary (http://localhost:3000/mobify/bundle/development/vendor.js:22665:5)\n'[39m +
    [32m'    at WrappedComponent (http://localhost:3000/mobify/bundle/development/vendor.js:23518:42)\n'[39m +
    [32m'    at C (http://localhost:3000/mobify/bundle/development/vendor.js:94230:37)\n'[39m +
    [32m'    at UIDReset (http://localhost:3000/mobify/bundle/development/vendor.js:96020:23)\n'[39m +
    [32m'    at Switch (http://localhost:3000/mobify/bundle/development/vendor.js:23410:5)\n'[39m +
    [32m'    at EnvironmentProvider (http://localhost:3000/mobify/bundle/development/vendor.js:116747:11)\n'[39m +
    [32m'    at ColorModeProvider (http://localhost:3000/mobify/bundle/development/vendor.js:108885:5)\n'[39m +
    [32m'    at ThemeProvider (http://localhost:3000/mobify/bundle/development/vendor.js:733:50)\n'[39m +
    [32m'    at ThemeProvider (http://localhost:3000/mobify/bundle/development/vendor.js:119861:11)\n'[39m +
    [32m'    at ChakraProvider (http://localhost:3000/mobify/bundle/development/vendor.js:116039:5)\n'[39m +
    [32m'    at ChakraProvider2 (http://localhost:3000/mobify/bundle/development/vendor.js:117460:5)\n'[39m +
    [32m'    at StoreLocatorProvider (http://localhost:3000/mobify/bundle/development/main.js:17828:3)\n'[39m +
    [32m'    at MultiSiteProvider (http://localhost:3000/mobify/bundle/development/main.js:20292:9)\n'[39m +
    [32m'    at CommerceApiProvider (http://localhost:3000/mobify/bundle/development/vendor.js:22072:5)\n'[39m +
    [32m'    at AppConfig (http://localhost:3000/mobify/bundle/development/main.js:36215:3)\n'[39m +
    [32m'    at Hydrate (http://localhost:3000/mobify/bundle/development/vendor.js:24880:3)\n'[39m +
    [32m'    at QueryClientProvider (http://localhost:3000/mobify/bundle/development/vendor.js:24948:3)\n'[39m +
    [32m'    at WithReactQuery (http://localhost:3000/mobify/bundle/development/vendor.js:23695:3)\n'[39m +
    [32m'    at CorrelationIdProvider (http://localhost:3000/mobify/bundle/development/vendor.js:23840:3)\n'[39m +
    [32m'    at Router (http://localhost:3000/mobify/bundle/development/vendor.js:93592:30)\n'[39m +
    [32m'    at BrowserRouter (http://localhost:3000/mobify/bundle/development/vendor.js:93022:35)\n'[39m +
    [32m'    at OuterApp (http://localhost:3000/mobify/bundle/development/vendor.js:22499:3)'[39m,
  [32m'Failed to load resource: the server responded with a status of 403 (Forbidden)'[39m,
  [32m'r: 403 Forbidden\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48391\n'[39m +
    [32m'    at za (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22073)\n'[39m +
    [32m'    at Generator._invoke (http://localhost:3000/mobify/bundle/development/vendor.js:30693:21823)\n'[39m +
    [32m'    at Ta.forEach.e.<computed> [as next] (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22447)\n'[39m +
    [32m'    at la (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20032)\n'[39m +
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)'[39m,
  [32m'Failed to load resource: the server responded with a status of 400 (Bad Request)'[39m,
  [32m'r: 400 Bad Request\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48391\n'[39m +
    [32m'    at za (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22073)\n'[39m +
    [32m'    at Generator._invoke (http://localhost:3000/mobify/bundle/development/vendor.js:30693:21823)\n'[39m +
    [32m'    at Ta.forEach.e.<computed> [as next] (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22447)\n'[39m +
    [32m'    at la (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20032)\n'[39m +
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)'[39m,
  [32m'Failed to load resource: the server responded with a status of 403 (Forbidden)'[39m,
  [32m'r: 403 Forbidden\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48391\n'[39m +
    [32m'    at za (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22073)\n'[39m +
    [32m'    at Generator._invoke (http://localhost:3000/mobify/bundle/development/vendor.js:30693:21823)\n'[39m +
    [32m'    at Ta.forEach.e.<computed> [as next] (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22447)\n'[39m +
    [32m'    at la (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20032)\n'[39m +
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)'[39m,
  [32m'Failed to load resource: the server responded with a status of 403 (Forbidden)'[39m,
  [32m'r: 403 Forbidden\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48391\n'[39m +
    [32m'    at za (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22073)\n'[39m +
    [32m'    at Generator._invoke (http://localhost:3000/mobify/bundle/development/vendor.js:30693:21823)\n'[39m +
    [32m'    at Ta.forEach.e.<computed> [as next] (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22447)\n'[39m +
    [32m'    at la (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20032)\n'[39m +
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)'[39m,
  [32m'Failed to load resource: the server responded with a status of 400 (Bad Request)'[39m,
  [32m'r: 400 Bad Request\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48391\n'[39m +
    [32m'    at za (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22073)\n'[39m +
    [32m'    at Generator._invoke (http://localhost:3000/mobify/bundle/development/vendor.js:30693:21823)\n'[39m +
    [32m'    at Ta.forEach.e.<computed> [as next] (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22447)\n'[39m +
    [32m'    at la (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20032)\n'[39m +
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)'[39m,
  [32m'Failed to load resource: the server responded with a status of 403 (Forbidden)'[39m,
  [32m'r: 403 Forbidden\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48391\n'[39m +
    [32m'    at za (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22073)\n'[39m +
    [32m'    at Generator._invoke (http://localhost:3000/mobify/bundle/development/vendor.js:30693:21823)\n'[39m +
    [32m'    at Ta.forEach.e.<computed> [as next] (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22447)\n'[39m +
    [32m'    at la (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20032)\n'[39m +
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)'[39m
]

[1A[2KFailed requests: [
  [32m'GET http://localhost:3000/__mrt/clear-browser-data - net::ERR_ABORTED'[39m,
  [32m'GET http://localhost:3000/callback?usid=61776e90-7074-4e91-8b35-1461dd3163a7&code=8oxG2wAzBC_npgP1Bsqt9_Mjii8Wr9krHyauwItiFNI - net::ERR_ABORTED'[39m,
  [32m'GET http://localhost:3000/callback?usid=4cde0430-c45d-4731-812a-bd336439b59b&code=y6wHXO5JbdyTcOBjLxXaqVxc58hK1a-DPqpd96y_qaQ - net::ERR_ABORTED'[39m,
  [32m'GET http://localhost:3000/callback?usid=dc898303-415d-4189-97ae-dfdd42c63f08&code=Dma4zh-S6OBoPyn2OG_vOAElLAySOfWYm0b_JNWwH2g - net::ERR_ABORTED'[39m
]

[1A[2K  2) [chromium] › e2e/storefront-smoke.spec.ts:59:7 › Storefront Smoke Tests › can navigate to a category/PLP page 

    Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoBeVisible[2m([22m[2m)[22m failed

    Locator: locator('[data-testid="product-tile"], .product-tile, article').first()
    Expected: visible
    Timeout: 15000ms
    Error: element(s) not found

    Call log:
    [2m  - Expect "toBeVisible" with timeout 15000ms[22m
    [2m  - waiting for locator('[data-testid="product-tile"], .product-tile, article').first()[22m


      65 |       await page.waitForLoadState('domcontentloaded');
      66 |       // PLP should show product tiles
    > 67 |       await expect(page.locator('[data-testid="product-tile"], .product-tile, article').first()).toBeVisible({ timeout: 15_000 });
         |                                                                                                  ^
      68 |     }
      69 |   });
      70 |
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/storefront-smoke.spec.ts:67:98

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/storefront-smoke-Storefron-7c1cd-gate-to-a-category-PLP-page-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/storefront-smoke-Storefron-7c1cd-gate-to-a-category-PLP-page-chromium/error-context.md


[1A[2K[3/3] [chromium] › e2e/storefront-smoke.spec.ts:71:7 › Storefront Smoke Tests › product detail page shows product info
[1A[2K  2 failed
    [chromium] › e2e/storefront-smoke.spec.ts:52:7 › Storefront Smoke Tests › homepage loads and renders 
    [chromium] › e2e/storefront-smoke.spec.ts:59:7 › Storefront Smoke Tests › can navigate to a category/PLP page 
  1 passed (32.1s)
[1A[2K[2m[WebServer] [22m(node:35252) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
[2m[WebServer] [22m(Use `node --trace-deprecation ...` to show where the warning was created)
[1A[2K[2m[WebServer] [22m(node:35276) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
[2m[WebServer] [22m(Use `node --trace-deprecation ...` to show where the warning was created)
[1A[2K[2m[WebServer] [22m(node:35276) [DEP0060] DeprecationWarning: The `util._extend` API is deprecated. Please use Object.assign() instead.
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
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (60bb558e-1677-4e38-8b47-db9917dd5dd7) GET /mobify/proxy/api/shopper/shopper-context/v1/organizations/f_ecom_aaia_prd/shopper-context/4cde0430-c45d-4731-812a-bd336439b59b?siteId=RefArch 403 117.704 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (18084f31-1999-4ac9-9f1e-228f73c96b6a) GET /mobify/proxy/api/customer/shopper-customers/v1/organizations/f_ecom_aaia_prd/customers/bdlelIxraYkXaRwXoZxbYYlXkV/product-lists?siteId=RefArch 400 278.874 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (632c86a8-5811-4875-9693-aa13d397e4e9) GET /mobify/proxy/api/shopper/shopper-context/v1/organizations/f_ecom_aaia_prd/shopper-context/dc898303-415d-4189-97ae-dfdd42c63f08?siteId=RefArch 403 135.701 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (b62b5d76-1ad2-422c-9b04-7f14035081a9) GET /mobify/proxy/api/configuration/shopper-configurations/v1/organizations/f_ecom_aaia_prd/configurations?siteId=RefArch 403 568.599 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (15cef209-b99b-4b66-a2b5-ff8585c4ec15) GET /mobify/proxy/api/customer/shopper-customers/v1/organizations/f_ecom_aaia_prd/customers/bdlelIxraYkXaRwXoZxbYYlXkV/baskets?siteId=RefArch 400 630.827 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (28d0c609-93cf-4f36-adae-ff96b3eac36c) GET /mobify/proxy/api/shopper/shopper-context/v1/organizations/f_ecom_aaia_prd/shopper-context/61776e90-7074-4e91-8b35-1461dd3163a7?siteId=RefArch 403 106.599 ms - 161
[2m[WebServer] [22m