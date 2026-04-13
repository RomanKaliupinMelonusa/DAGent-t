Running 15 tests using 1 worker

[1A[2K[1/15] [chromium] › e2e/product-quick-view.spec.ts:160:9 › Product Quick View › Quick View overlay bar on PLP › product tiles on PLP show Quick View overlay button



[1A[2K[chromium] › e2e/product-quick-view.spec.ts:160:9 › Product Quick View › Quick View overlay bar on PLP › product tiles on PLP show Quick View overlay button

--- Browser Diagnostics for "product tiles on PLP show Quick View overlay button" ---

[1A[2KFailed requests: [
  [32m'GET http://localhost:3000/__mrt/clear-browser-data - net::ERR_ABORTED'[39m,
  [32m'GET http://localhost:3000/category/newarrivals - net::ERR_ABORTED'[39m
]

[1A[2K  1) [chromium] › e2e/product-quick-view.spec.ts:160:9 › Product Quick View › Quick View overlay bar on PLP › product tiles on PLP show Quick View overlay button 

    Error: page.goto: Page crashed
    Call log:
    [2m  - navigating to "http://localhost:3000/category/womens", waiting until "domcontentloaded"[22m


      63 |
      64 |   for (const path of plpPaths) {
    > 65 |     await page.goto(path, { waitUntil: 'domcontentloaded' });
         |                ^
      66 |
      67 |     const tile = page.getByTestId('quick-view-btn').first();
      68 |     const hasTile = await tile
        at navigateToPLP (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:65:16)
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:163:7




[1A[2K[2/15] [chromium] › e2e/product-quick-view.spec.ts:171:9 › Product Quick View › Quick View overlay bar on PLP › Quick View button has accessible aria-label with product name
[1A[2K[chromium] › e2e/product-quick-view.spec.ts:171:9 › Product Quick View › Quick View overlay bar on PLP › Quick View button has accessible aria-label with product name

--- Browser Diagnostics for "Quick View button has accessible aria-label with product name" ---

[1A[2K  2) [chromium] › e2e/product-quick-view.spec.ts:171:9 › Product Quick View › Quick View overlay bar on PLP › Quick View button has accessible aria-label with product name 

    Error: page.goto: Page crashed
    Call log:
    [2m  - navigating to "http://localhost:3000/category/newarrivals", waiting until "domcontentloaded"[22m


      63 |
      64 |   for (const path of plpPaths) {
    > 65 |     await page.goto(path, { waitUntil: 'domcontentloaded' });
         |                ^
      66 |
      67 |     const tile = page.getByTestId('quick-view-btn').first();
      68 |     const hasTile = await tile
        at navigateToPLP (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:65:16)
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:174:13


[1A[2K[3/15] [chromium] › e2e/product-quick-view.spec.ts:184:9 › Product Quick View › Quick View overlay bar on PLP › Quick View buttons exist on standard product tiles
[1A[2K[chromium] › e2e/product-quick-view.spec.ts:184:9 › Product Quick View › Quick View overlay bar on PLP › Quick View buttons exist on standard product tiles

--- Browser Diagnostics for "Quick View buttons exist on standard product tiles" ---

[1A[2K  3) [chromium] › e2e/product-quick-view.spec.ts:184:9 › Product Quick View › Quick View overlay bar on PLP › Quick View buttons exist on standard product tiles 

    Error: page.goto: Page crashed
    Call log:
    [2m  - navigating to "http://localhost:3000/category/newarrivals", waiting until "domcontentloaded"[22m


      63 |
      64 |   for (const path of plpPaths) {
    > 65 |     await page.goto(path, { waitUntil: 'domcontentloaded' });
         |                ^
      66 |
      67 |     const tile = page.getByTestId('quick-view-btn').first();
      68 |     const hasTile = await tile
        at navigateToPLP (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:65:16)
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:187:13


[1A[2K[4/15] [chromium] › e2e/product-quick-view.spec.ts:196:9 › Product Quick View › Quick View modal — open and close › clicking Quick View button opens the modal

[1A[2K[5/15] [chromium] › e2e/product-quick-view.spec.ts:214:9 › Product Quick View › Quick View modal — open and close › modal shows loading spinner then resolves to content or error


[1A[2K[chromium] › e2e/product-quick-view.spec.ts:214:9 › Product Quick View › Quick View modal — open and close › modal shows loading spinner then resolves to content or error

--- Browser Diagnostics for "modal shows loading spinner then resolves to content or error" ---

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
  [32m'Failed to load resource: net::ERR_NAME_NOT_RESOLVED'[39m,
  [32m'retail-react-app.use-datacloud._handleApiError ERROR [DataCloudApi] Error sending Data Cloud event {}'[39m,
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
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)'[39m
]

[1A[2KFailed requests: [
  [32m'GET http://localhost:3000/callback?usid=4803c6eb-71db-4887-9325-adb2509131d6&code=wTHKKNMsV6D8pZYv2I-h_ydjTPfpTRaq3hY7lcsLsI4 - net::ERR_ABORTED'[39m,
  [32m'POST https://g82wgnrvm-ywk9dggrrw8mtggy.pc-rnd.c360a.salesforce.com/web/events/7ae070a6-f4ec-4def-a383-d9cacc3f20a1/ - net::ERR_NAME_NOT_RESOLVED'[39m
]

[1A[2K  4) [chromium] › e2e/product-quick-view.spec.ts:214:9 › Product Quick View › Quick View modal — open and close › modal shows loading spinner then resolves to content or error 

    Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoBeVisible[2m([22m[2m)[22m failed

    Locator: getByTestId('quick-view-modal')
    Expected: visible
    Timeout: 10000ms
    Error: element(s) not found

    Call log:
    [2m  - Expect "toBeVisible" with timeout 10000ms[22m
    [2m  - waiting for getByTestId('quick-view-modal')[22m


      221 |
      222 |       const modal = page.getByTestId('quick-view-modal');
    > 223 |       await expect(modal).toBeVisible({ timeout: 10_000 });
          |                           ^
      224 |
      225 |       const outcome = await waitForQuickViewOutcome(page);
      226 |       expect(['content', 'error-state']).toContain(outcome);
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:223:27


[1A[2K[6/15] [chromium] › e2e/product-quick-view.spec.ts:229:9 › Product Quick View › Quick View modal — open and close › modal can be closed via the X (close) button
[1A[2K[7/15] [chromium] › e2e/product-quick-view.spec.ts:245:9 › Product Quick View › Quick View modal — open and close › modal can be closed by pressing Escape


[1A[2K[chromium] › e2e/product-quick-view.spec.ts:245:9 › Product Quick View › Quick View modal — open and close › modal can be closed by pressing Escape

--- Browser Diagnostics for "modal can be closed by pressing Escape" ---

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
  [32m'Failed to load resource: net::ERR_NAME_NOT_RESOLVED'[39m,
  [32m'retail-react-app.use-datacloud._handleApiError ERROR [DataCloudApi] Error sending Data Cloud event {}'[39m,
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
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)'[39m
]

[1A[2KFailed requests: [
  [32m'GET http://localhost:3000/callback?usid=a363dc9c-ecbf-4873-8e72-1c2feb7ebf9e&code=txUPdbsB92zaBf5fjfK9zeZtmJ5W__XNeQrTXgfAJlU - net::ERR_ABORTED'[39m,
  [32m'POST https://g82wgnrvm-ywk9dggrrw8mtggy.pc-rnd.c360a.salesforce.com/web/events/7ae070a6-f4ec-4def-a383-d9cacc3f20a1/ - net::ERR_NAME_NOT_RESOLVED'[39m
]

[1A[2K  5) [chromium] › e2e/product-quick-view.spec.ts:245:9 › Product Quick View › Quick View modal — open and close › modal can be closed by pressing Escape 

    Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoBeVisible[2m([22m[2m)[22m failed

    Locator: getByTestId('quick-view-modal')
    Expected: visible
    Timeout: 10000ms
    Error: element(s) not found

    Call log:
    [2m  - Expect "toBeVisible" with timeout 10000ms[22m
    [2m  - waiting for getByTestId('quick-view-modal')[22m


      250 |
      251 |       const modal = page.getByTestId('quick-view-modal');
    > 252 |       await expect(modal).toBeVisible({ timeout: 10_000 });
          |                           ^
      253 |
      254 |       await page.keyboard.press('Escape');
      255 |
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:252:27

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Product-36f87-e-closed-by-pressing-Escape-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/product-quick-view-Product-36f87-e-closed-by-pressing-Escape-chromium/error-context.md


[1A[2K[8/15] [chromium] › e2e/product-quick-view.spec.ts:259:9 › Product Quick View › Quick View modal — open and close › closing modal preserves PLP state (URL unchanged)

[1A[2K[9/15] [chromium] › e2e/product-quick-view.spec.ts:284:9 › Product Quick View › Quick View modal — content › modal displays product details when loaded


[1A[2K[chromium] › e2e/product-quick-view.spec.ts:284:9 › Product Quick View › Quick View modal — content › modal displays product details when loaded

--- Browser Diagnostics for "modal displays product details when loaded" ---

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
  [32m'Failed to load resource: net::ERR_NAME_NOT_RESOLVED'[39m,
  [32m'retail-react-app.use-datacloud._handleApiError ERROR [DataCloudApi] Error sending Data Cloud event {}'[39m,
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
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)'[39m
]

[1A[2KFailed requests: [
  [32m'GET http://localhost:3000/callback?usid=7ec8aaea-d92e-40dd-82c2-96c377ac3668&code=xfmQRIPGylPMZw8rBLW_c0qNxQCODdcPziauxJX7ntM - net::ERR_ABORTED'[39m,
  [32m'POST https://g82wgnrvm-ywk9dggrrw8mtggy.pc-rnd.c360a.salesforce.com/web/events/7ae070a6-f4ec-4def-a383-d9cacc3f20a1/ - net::ERR_NAME_NOT_RESOLVED'[39m
]

[1A[2K  6) [chromium] › e2e/product-quick-view.spec.ts:284:9 › Product Quick View › Quick View modal — content › modal displays product details when loaded 

    Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoBeVisible[2m([22m[2m)[22m failed

    Locator: getByTestId('quick-view-modal')
    Expected: visible
    Timeout: 10000ms
    Error: element(s) not found

    Call log:
    [2m  - Expect "toBeVisible" with timeout 10000ms[22m
    [2m  - waiting for getByTestId('quick-view-modal')[22m


      289 |
      290 |       const modal = page.getByTestId('quick-view-modal');
    > 291 |       await expect(modal).toBeVisible({ timeout: 10_000 });
          |                           ^
      292 |
      293 |       const outcome = await waitForQuickViewOutcome(page);
      294 |
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:291:27

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Product-ef5bc-product-details-when-loaded-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/product-quick-view-Product-ef5bc-product-details-when-loaded-chromium/error-context.md


[1A[2K[10/15] [chromium] › e2e/product-quick-view.spec.ts:318:9 › Product Quick View › Quick View modal — content › modal has accessible aria-label including product name


[1A[2K[chromium] › e2e/product-quick-view.spec.ts:318:9 › Product Quick View › Quick View modal — content › modal has accessible aria-label including product name

--- Browser Diagnostics for "modal has accessible aria-label including product name" ---

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
  [32m'Failed to load resource: net::ERR_NAME_NOT_RESOLVED'[39m,
  [32m'retail-react-app.use-datacloud._handleApiError ERROR [DataCloudApi] Error sending Data Cloud event {}'[39m,
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
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)'[39m
]

[1A[2KFailed requests: [
  [32m'GET http://localhost:3000/callback?usid=3eb0345e-a5c9-42ca-8d4c-afba6a49768f&code=53PE_wX62NgN4XD7fhz9uli9zmEszWLyAc7nbtJnwcE - net::ERR_ABORTED'[39m,
  [32m'POST https://g82wgnrvm-ywk9dggrrw8mtggy.pc-rnd.c360a.salesforce.com/web/events/7ae070a6-f4ec-4def-a383-d9cacc3f20a1/ - net::ERR_NAME_NOT_RESOLVED'[39m
]

[1A[2K  7) [chromium] › e2e/product-quick-view.spec.ts:318:9 › Product Quick View › Quick View modal — content › modal has accessible aria-label including product name 

    Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoBeVisible[2m([22m[2m)[22m failed

    Locator: getByTestId('quick-view-modal')
    Expected: visible
    Timeout: 10000ms
    Error: element(s) not found

    Call log:
    [2m  - Expect "toBeVisible" with timeout 10000ms[22m
    [2m  - waiting for getByTestId('quick-view-modal')[22m


      325 |
      326 |       const modal = page.getByTestId('quick-view-modal');
    > 327 |       await expect(modal).toBeVisible({ timeout: 10_000 });
          |                           ^
      328 |
      329 |       const ariaLabel = await modal.getAttribute('aria-label');
      330 |       expect(ariaLabel).toBeTruthy();
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:327:27

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Product-d5a0a-abel-including-product-name-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/product-quick-view-Product-d5a0a-abel-including-product-name-chromium/error-context.md


[1A[2K[11/15] [chromium] › e2e/product-quick-view.spec.ts:334:9 › Product Quick View › Quick View modal — content › modal shows "View Full Details" link to PDP when content loads


[1A[2K[chromium] › e2e/product-quick-view.spec.ts:334:9 › Product Quick View › Quick View modal — content › modal shows "View Full Details" link to PDP when content loads

--- Browser Diagnostics for "modal shows "View Full Details" link to PDP when content loads" ---

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
  [32m'Failed to load resource: net::ERR_NAME_NOT_RESOLVED'[39m,
  [32m'retail-react-app.use-datacloud._handleApiError ERROR [DataCloudApi] Error sending Data Cloud event {}'[39m,
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
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)'[39m
]

[1A[2KFailed requests: [
  [32m'GET http://localhost:3000/callback?usid=1a0598fa-8c53-4df4-b71d-d468ac12487b&code=WN1jCSSBb5A0Cwj2P4g9qRLSlhY0eWZNX-BlZv38WZs - net::ERR_ABORTED'[39m,
  [32m'POST https://g82wgnrvm-ywk9dggrrw8mtggy.pc-rnd.c360a.salesforce.com/web/events/7ae070a6-f4ec-4def-a383-d9cacc3f20a1/ - net::ERR_NAME_NOT_RESOLVED'[39m
]

[1A[2K  8) [chromium] › e2e/product-quick-view.spec.ts:334:9 › Product Quick View › Quick View modal — content › modal shows "View Full Details" link to PDP when content loads 

    Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoBeVisible[2m([22m[2m)[22m failed

    Locator: getByTestId('quick-view-modal')
    Expected: visible
    Timeout: 10000ms
    Error: element(s) not found

    Call log:
    [2m  - Expect "toBeVisible" with timeout 10000ms[22m
    [2m  - waiting for getByTestId('quick-view-modal')[22m


      341 |
      342 |       const modal = page.getByTestId('quick-view-modal');
    > 343 |       await expect(modal).toBeVisible({ timeout: 10_000 });
          |                           ^
      344 |
      345 |       const outcome = await waitForQuickViewOutcome(page);
      346 |
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:343:27

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Product-2fb1c-k-to-PDP-when-content-loads-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/product-quick-view-Product-2fb1c-k-to-PDP-when-content-loads-chromium/error-context.md


[1A[2K[12/15] [chromium] › e2e/product-quick-view.spec.ts:366:9 › Product Quick View › Quick View — multiple products › can open Quick View for different products sequentially


[1A[2K[chromium] › e2e/product-quick-view.spec.ts:366:9 › Product Quick View › Quick View — multiple products › can open Quick View for different products sequentially

--- Browser Diagnostics for "can open Quick View for different products sequentially" ---

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
  [32m'Failed to load resource: net::ERR_NAME_NOT_RESOLVED'[39m,
  [32m'retail-react-app.use-datacloud._handleApiError ERROR [DataCloudApi] Error sending Data Cloud event {}'[39m,
  [32m'The above error occurred in the <ProductView> component:\n'[39m +
    [32m'\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/main.js:8087:3\n'[39m +
    [32m'    at div\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:682:66\n'[39m +
    [32m'    at ChakraComponent (http://localhost:3000/mobify/bundle/development/vendor.js:120030:102)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:113422:11\n'[39m +
    [32m'    at section\n'[39m +
    [32m'    at MotionComponent (http://localhost:3000/mobify/bundle/development/vendor.js:40261:22)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:682:66\n'[39m +
    [32m'    at ChakraComponent (http://localhost:3000/mobify/bundle/development/vendor.js:120030:102)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:113887:13\n'[39m +
    [32m'    at div\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:682:66\n'[39m +
    [32m'    at ChakraComponent (http://localhost:3000/mobify/bundle/development/vendor.js:120030:102)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:92732:50\n'[39m +
    [32m'    at div\n'[39m +
    [32m'    at FocusLockUI (http://localhost:3000/mobify/bundle/development/vendor.js:84940:66)\n'[39m +
    [32m'    at FocusLockUICombination\n'[39m +
    [32m'    at FocusLock (http://localhost:3000/mobify/bundle/development/vendor.js:110218:5)\n'[39m +
    [32m'    at ModalFocusScope (http://localhost:3000/mobify/bundle/development/vendor.js:113545:75)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:112990:7\n'[39m +
    [32m'    at DefaultPortal (http://localhost:3000/mobify/bundle/development/vendor.js:115930:11)\n'[39m +
    [32m'    at Portal\n'[39m +
    [32m'    at PresenceChild (http://localhost:3000/mobify/bundle/development/vendor.js:44799:26)\n'[39m +
    [32m'    at AnimatePresence (http://localhost:3000/mobify/bundle/development/vendor.js:44901:28)\n'[39m +
    [32m'    at Modal (http://localhost:3000/mobify/bundle/development/vendor.js:113288:88)\n'[39m +
    [32m'    at QuickViewModal (http://localhost:3000/mobify/bundle/development/main.js:36623:3)\n'[39m +
    [32m'    at div\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:682:66\n'[39m +
    [32m'    at ChakraComponent (http://localhost:3000/mobify/bundle/development/vendor.js:120030:102)\n'[39m +
    [32m'    at ProductTile (http://localhost:3000/mobify/bundle/development/main.js:36417:7)\n'[39m +
    [32m'    at Island (http://localhost:3000/mobify/bundle/development/main.js:4647:5)\n'[39m +
    [32m'    at div\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:682:66\n'[39m +
    [32m'    at ChakraComponent (http://localhost:3000/mobify/bundle/development/vendor.js:120030:102)\n'[39m +
    [32m'    at Grid2 (http://localhost:3000/mobify/bundle/development/vendor.js:111646:5)\n'[39m +
    [32m'    at SimpleGrid2 (http://localhost:3000/mobify/bundle/development/vendor.js:112240:13)\n'[39m +
    [32m'    at div\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:682:66\n'[39m +
    [32m'    at ChakraComponent (http://localhost:3000/mobify/bundle/development/vendor.js:120030:102)\n'[39m +
    [32m'    at div\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:682:66\n'[39m +
    [32m'    at ChakraComponent (http://localhost:3000/mobify/bundle/development/vendor.js:120030:102)\n'[39m +
    [32m'    at Grid2 (http://localhost:3000/mobify/bundle/development/vendor.js:111646:5)\n'[39m +
    [32m'    at div\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:682:66\n'[39m +
    [32m'    at ChakraComponent (http://localhost:3000/mobify/bundle/development/vendor.js:120030:102)\n'[39m +
    [32m'    at ProductList (http://localhost:3000/mobify/bundle/development/pages-product-list.js:1158:18)\n'[39m +
    [32m'    at InnerLoadable (http://localhost:3000/mobify/bundle/development/vendor.js:127901:34)\n'[39m +
    [32m'    at LoadableWithChunkExtractor\n'[39m +
    [32m'    at Loadable\n'[39m +
    [32m'    at RouteComponent (http://localhost:3000/mobify/bundle/development/vendor.js:23025:7)\n'[39m +
    [32m'    at C (http://localhost:3000/mobify/bundle/development/vendor.js:94230:37)\n'[39m +
    [32m'    at WithErrorHandling(withRouter(routeComponent(Loadable)))\n'[39m +
    [32m'    at UIDFork (http://localhost:3000/mobify/bundle/development/vendor.js:96030:23)\n'[39m +
    [32m'    at Route (http://localhost:3000/mobify/bundle/development/vendor.js:93973:29)\n'[39m +
    [32m'    at Switch (http://localhost:3000/mobify/bundle/development/vendor.js:94175:29)\n'[39m +
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
    [32m'    at OuterApp (http://localhost:3000/mobify/bundle/development/vendor.js:22499:3)\n'[39m +
    [32m'\n'[39m +
    [32m'React will try to recreate this component tree from scratch using the error boundary you provided, OfflineBoundary.'[39m,
  [32m'The above error occurred in the <OfflineBoundary> component:\n'[39m +
    [32m'\n'[39m +
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
    [32m'    at OuterApp (http://localhost:3000/mobify/bundle/development/vendor.js:22499:3)\n'[39m +
    [32m'\n'[39m +
    [32m'React will try to recreate this component tree from scratch using the error boundary you provided, AppErrorBoundary.'[39m,
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
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)'[39m
]

[1A[2KFailed requests: [
  [32m'GET http://localhost:3000/callback?usid=4943b379-c01f-4b72-9b2a-98a024577399&code=wchpcujf9q_wSC8rwiwdJj918KWX6G1xy6_TaaDALLQ - net::ERR_ABORTED'[39m,
  [32m'POST https://g82wgnrvm-ywk9dggrrw8mtggy.pc-rnd.c360a.salesforce.com/web/events/7ae070a6-f4ec-4def-a383-d9cacc3f20a1/ - net::ERR_NAME_NOT_RESOLVED'[39m
]

[1A[2K  9) [chromium] › e2e/product-quick-view.spec.ts:366:9 › Product Quick View › Quick View — multiple products › can open Quick View for different products sequentially 

    Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoBeVisible[2m([22m[2m)[22m failed

    Locator: getByTestId('quick-view-modal')
    Expected: visible
    Timeout: 10000ms
    Error: element(s) not found

    Call log:
    [2m  - Expect "toBeVisible" with timeout 10000ms[22m
    [2m  - waiting for getByTestId('quick-view-modal')[22m


      380 |
      381 |         const modal = page.getByTestId('quick-view-modal');
    > 382 |         await expect(modal).toBeVisible({ timeout: 10_000 });
          |                             ^
      383 |
      384 |         const ariaLabel = await modal.getAttribute('aria-label');
      385 |         expect(ariaLabel).toMatch(/Quick view for/i);
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:382:29

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Product-51a6e-erent-products-sequentially-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/product-quick-view-Product-51a6e-erent-products-sequentially-chromium/error-context.md


[1A[2K[13/15] [chromium] › e2e/storefront-smoke.spec.ts:52:7 › Storefront Smoke Tests › homepage loads and renders
[1A[2K[chromium] › e2e/storefront-smoke.spec.ts:52:7 › Storefront Smoke Tests › homepage loads and renders

--- Browser Diagnostics for "homepage loads and renders" ---

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
    [32m'    at OuterApp (http://localhost:3000/mobify/bundle/development/vendor.js:22499:3)'[39m
]

[1A[2KFailed requests: [
  [32m'GET http://localhost:3000/callback?usid=8845be9e-368b-4a11-bfa5-3f1ad9f7ea01&code=Ff8gz9xNwCL12jcsPlr5o5O2dO-XcXX-CoN6ijk0HoQ - net::ERR_ABORTED'[39m
]

[1A[2K  10) [chromium] › e2e/storefront-smoke.spec.ts:52:7 › Storefront Smoke Tests › homepage loads and renders 

    Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoBeVisible[2m([22m[2m)[22m failed

    Locator: locator('main, [role="main"], #app')
    Expected: visible
    Error: strict mode violation: locator('main, [role="main"], #app') resolved to 2 elements:
        1) <div id="app" class="css-b95f0i">…</div> aka getByText('Skip to ContentNew')
        2) <main role="main" id="app-main" class="css-b95f0i">…</main> aka locator('#app-main')

    Call log:
    [2m  - Expect "toBeVisible" with timeout 5000ms[22m
    [2m  - waiting for locator('main, [role="main"], #app')[22m


      54 |     await expect(page).toHaveTitle(/.+/); // Page has a title
      55 |     // The Retail React App renders a main content area
    > 56 |     await expect(page.locator('main, [role="main"], #app')).toBeVisible();
         |                                                             ^
      57 |   });
      58 |
      59 |   test('can navigate to a category/PLP page', async ({ page }) => {
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/storefront-smoke.spec.ts:56:61

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/storefront-smoke-Storefron-1e0f7--homepage-loads-and-renders-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/storefront-smoke-Storefron-1e0f7--homepage-loads-and-renders-chromium/error-context.md


[1A[2K[14/15] [chromium] › e2e/storefront-smoke.spec.ts:59:7 › Storefront Smoke Tests › can navigate to a category/PLP page








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
  [32m'Failed to load resource: the server responded with a status of 400 (Bad Request)'[39m,
  [32m'r: 400 Bad Request\n'[39m +
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
  [32m'Failed to load resource: net::ERR_NAME_NOT_RESOLVED'[39m,
  [32m'retail-react-app.use-datacloud._handleApiError ERROR [DataCloudApi] Error sending Data Cloud event {}'[39m
]

[1A[2KFailed requests: [
  [32m'GET http://localhost:3000/callback?usid=941089a5-465c-4a6c-ad55-4320615aacb1&code=J4sbrWwtBJz_a0x3tCvwlkhh1wMmMod4xl-MN_ymrKE - net::ERR_ABORTED'[39m,
  [32m'GET http://localhost:3000/callback?usid=72012336-49f2-4ef8-9560-8f5feea7e1b1&code=ooOUdWfSCUbdoo5oSGDbExhHrGEqF95KPkrOpHmCMq4 - net::ERR_ABORTED'[39m,
  [32m'GET http://localhost:3000/callback?usid=c2c557a9-d99e-4396-b787-966d181f73b4&code=cQfkw4KuL8YNum9CbMonAfWTANOfXsPBmIMv4LhFefE - net::ERR_ABORTED'[39m,
  [32m'POST https://g82wgnrvm-ywk9dggrrw8mtggy.pc-rnd.c360a.salesforce.com/web/events/7ae070a6-f4ec-4def-a383-d9cacc3f20a1/ - net::ERR_NAME_NOT_RESOLVED'[39m
]

[1A[2K  11) [chromium] › e2e/storefront-smoke.spec.ts:59:7 › Storefront Smoke Tests › can navigate to a category/PLP page 

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


[1A[2K[15/15] [chromium] › e2e/storefront-smoke.spec.ts:71:7 › Storefront Smoke Tests › product detail page shows product info
[1A[2K  11 failed
    [chromium] › e2e/product-quick-view.spec.ts:160:9 › Product Quick View › Quick View overlay bar on PLP › product tiles on PLP show Quick View overlay button 
    [chromium] › e2e/product-quick-view.spec.ts:171:9 › Product Quick View › Quick View overlay bar on PLP › Quick View button has accessible aria-label with product name 
    [chromium] › e2e/product-quick-view.spec.ts:184:9 › Product Quick View › Quick View overlay bar on PLP › Quick View buttons exist on standard product tiles 
    [chromium] › e2e/product-quick-view.spec.ts:214:9 › Product Quick View › Quick View modal — open and close › modal shows loading spinner then resolves to content or error 
    [chromium] › e2e/product-quick-view.spec.ts:245:9 › Product Quick View › Quick View modal — open and close › modal can be closed by pressing Escape 
    [chromium] › e2e/product-quick-view.spec.ts:284:9 › Product Quick View › Quick View modal — content › modal displays product details when loaded 
    [chromium] › e2e/product-quick-view.spec.ts:318:9 › Product Quick View › Quick View modal — content › modal has accessible aria-label including product name 
    [chromium] › e2e/product-quick-view.spec.ts:334:9 › Product Quick View › Quick View modal — content › modal shows "View Full Details" link to PDP when content loads 
    [chromium] › e2e/product-quick-view.spec.ts:366:9 › Product Quick View › Quick View — multiple products › can open Quick View for different products sequentially 
    [chromium] › e2e/storefront-smoke.spec.ts:52:7 › Storefront Smoke Tests › homepage loads and renders 
    [chromium] › e2e/storefront-smoke.spec.ts:59:7 › Storefront Smoke Tests › can navigate to a category/PLP page 
  4 passed (3.8m)
[1A[2K[2m[WebServer] [22m(node:40330) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
[2m[WebServer] [22m(Use `node --trace-deprecation ...` to show where the warning was created)
[1A[2K[2m[WebServer] [22m(node:40354) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
[2m[WebServer] [22m(Use `node --trace-deprecation ...` to show where the warning was created)
[1A[2K[2m[WebServer] [22m(node:40354) [DEP0060] DeprecationWarning: The `util._extend` API is deprecated. Please use Object.assign() instead.
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
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (b4f877ba-3c76-40bf-89d4-a0acbf1f98c5) GET /mobify/proxy/api/configuration/shopper-configurations/v1/organizations/f_ecom_aaia_prd/configurations?siteId=RefArch 403 243.510 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (8a9a2450-ce82-4c2e-a3e5-2ebd6992f6da) GET /mobify/proxy/api/configuration/shopper-configurations/v1/organizations/f_ecom_aaia_prd/configurations?siteId=RefArch 403 249.512 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (d7df4819-db4d-43fe-9e1f-eb98b34bd908) GET /mobify/proxy/api/shopper/shopper-context/v1/organizations/f_ecom_aaia_prd/shopper-context/4803c6eb-71db-4887-9325-adb2509131d6?siteId=RefArch 403 251.910 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (071c8bba-08ea-4618-a240-d1f9e309748d) GET /mobify/proxy/api/shopper/shopper-context/v1/organizations/f_ecom_aaia_prd/shopper-context/a363dc9c-ecbf-4873-8e72-1c2feb7ebf9e?siteId=RefArch 403 127.748 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (9aa17ef7-5151-4bbd-9492-811457996f37) GET /mobify/proxy/api/configuration/shopper-configurations/v1/organizations/f_ecom_aaia_prd/configurations?siteId=RefArch 403 132.923 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (122ba46b-5ab4-48f4-8adb-210f67adbb98) GET /mobify/proxy/api/configuration/shopper-configurations/v1/organizations/f_ecom_aaia_prd/configurations?siteId=RefArch 403 151.130 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (e6b3522d-15cd-4af1-857d-175cf4c11c6a) GET /mobify/proxy/api/configuration/shopper-configurations/v1/organizations/f_ecom_aaia_prd/configurations?siteId=RefArch 403 133.285 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (78d854a4-7f46-49db-8052-9bb85ea2ec4f) GET /mobify/proxy/api/shopper/shopper-context/v1/organizations/f_ecom_aaia_prd/shopper-context/7ec8aaea-d92e-40dd-82c2-96c377ac3668?siteId=RefArch 403 210.967 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (464878f1-940a-44a2-8d3f-4f0b97f327b0) GET /mobify/proxy/api/configuration/shopper-configurations/v1/organizations/f_ecom_aaia_prd/configurations?siteId=RefArch 403 134.582 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (1f863070-78a9-4bfc-afd5-ba0bca950c82) GET /mobify/proxy/api/shopper/shopper-context/v1/organizations/f_ecom_aaia_prd/shopper-context/3eb0345e-a5c9-42ca-8d4c-afba6a49768f?siteId=RefArch 403 120.021 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (7476fc6e-cfd4-4a1f-af42-acf30fe579ce) GET /mobify/proxy/api/configuration/shopper-configurations/v1/organizations/f_ecom_aaia_prd/configurations?siteId=RefArch 403 200.594 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (91aa7dcf-b91e-421c-b9f1-6314b40168b9) GET /mobify/proxy/api/shopper/shopper-context/v1/organizations/f_ecom_aaia_prd/shopper-context/1a0598fa-8c53-4df4-b71d-d468ac12487b?siteId=RefArch 403 139.108 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (bed99ad2-c3b8-404e-a61f-e09ed44a61ec) GET /mobify/proxy/api/configuration/shopper-configurations/v1/organizations/f_ecom_aaia_prd/configurations?siteId=RefArch 403 150.578 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (98319740-ff90-4dff-b331-ac668521b371) GET /mobify/proxy/api/shopper/shopper-context/v1/organizations/f_ecom_aaia_prd/shopper-context/4943b379-c01f-4b72-9b2a-98a024577399?siteId=RefArch 403 254.446 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (e011ad82-7728-453c-a2bb-ddb96a53b6be) GET /mobify/proxy/api/configuration/shopper-configurations/v1/organizations/f_ecom_aaia_prd/configurations?siteId=RefArch 403 306.673 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (52731cd5-9a76-4110-aeca-b6a036dca3b3) GET /mobify/proxy/api/shopper/shopper-context/v1/organizations/f_ecom_aaia_prd/shopper-context/941089a5-465c-4a6c-ad55-4320615aacb1?siteId=RefArch 403 187.416 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (a53451ee-c9c9-4409-8895-40144e730a94) GET /mobify/proxy/api/customer/shopper-customers/v1/organizations/f_ecom_aaia_prd/customers/abmroVkbE3wrsRlbwZwWYYwrxH/product-lists?siteId=RefArch 400 475.347 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (db34d7e4-1c96-4b5e-b4b5-ca018e11a3a9) GET /mobify/proxy/api/shopper/shopper-context/v1/organizations/f_ecom_aaia_prd/shopper-context/72012336-49f2-4ef8-9560-8f5feea7e1b1?siteId=RefArch 403 324.913 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (1ba322fa-c53a-4a8e-914e-4bdd1e81ee0a) GET /mobify/proxy/api/customer/shopper-customers/v1/organizations/f_ecom_aaia_prd/customers/abmroVkbE3wrsRlbwZwWYYwrxH/baskets?siteId=RefArch 400 693.447 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (43fe740b-e22f-4f79-8f52-a05b4774dd96) GET /mobify/proxy/api/shopper/shopper-context/v1/organizations/f_ecom_aaia_prd/shopper-context/c2c557a9-d99e-4396-b787-966d181f73b4?siteId=RefArch 403 214.075 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (7696dca8-20d7-4e10-ba4d-c0b4ba667124) GET /mobify/proxy/api/customer/shopper-customers/v1/organizations/f_ecom_aaia_prd/customers/ablXgUkrgXkXwRlbJKkGYYxuw2/product-lists?siteId=RefArch 400 355.953 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (20f23fc9-fed3-4f2b-8b1a-8214f78149c4) GET /mobify/proxy/api/customer/shopper-customers/v1/organizations/f_ecom_aaia_prd/customers/ablXgUkrgXkXwRlbJKkGYYxuw2/baskets?siteId=RefArch 400 1156.670 ms - 161
[2m[WebServer] [22m