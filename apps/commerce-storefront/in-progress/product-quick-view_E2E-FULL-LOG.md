Running 10 tests using 1 worker

[1A[2K[1/10] [chromium] › e2e/product-quick-view.spec.ts:109:9 › Product Quick View › Quick View button renders on PLP product tiles
[1A[2K[chromium] › e2e/product-quick-view.spec.ts:109:9 › Product Quick View › Quick View button renders on PLP product tiles

--- Browser Diagnostics for "Quick View button renders on PLP product tiles" ---

[1A[2KFailed requests: [
  [32m'GET http://localhost:3000/__mrt/clear-browser-data - net::ERR_ABORTED'[39m,
  [32m'GET https://unpkg.com/@salesforce-ux/design-system@2.14.3/assets/fonts/webfonts/SalesforceSans-Regular.woff2 - net::ERR_ABORTED'[39m,
  [32m'GET https://unpkg.com/@salesforce-ux/design-system@2.14.3/assets/fonts/webfonts/SalesforceSans-Bold.woff2 - net::ERR_ABORTED'[39m,
  [32m'GET http://localhost:3000/__mrt/clear-browser-data - net::ERR_ABORTED'[39m
]

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


[1A[2K[2/10] [chromium] › e2e/product-quick-view.spec.ts:124:9 › Product Quick View › clicking Quick View button opens modal with product content










[1A[2K[chromium] › e2e/product-quick-view.spec.ts:124:9 › Product Quick View › clicking Quick View button opens modal with product content

--- Browser Diagnostics for "clicking Quick View button opens modal with product content" ---

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
  [32m'GET http://localhost:3000/callback?usid=86ad5d13-c503-4787-b4b7-64362097c20a&code=iqPppM381dLLZgXStppsyY7XIgIrEYyfE4pa_LzdUD8 - net::ERR_ABORTED'[39m,
  [32m'GET http://localhost:3000/callback?usid=df8ddb34-c820-4b50-94f9-a5c488e9c73b&code=0MVZvjYTtghGIFWPS9hsUoiMZPBjEecnFwpFDKwrImQ - net::ERR_ABORTED'[39m,
  [32m'GET http://localhost:3000/callback?usid=1660886d-6894-42fe-a6af-54d5fccba3dd&code=yXswNQ4mPV6BwaNY8FFaRix1zAlBiJCNvC_8lB6wxyc - net::ERR_ABORTED'[39m,
  [32m'GET https://images.demandware.net/dw/image/v2/AAIA_PRD/on/demandware.static/-/Sites-apparel-m-catalog/default/dw8f647e4c/images/medium/PG.10256690.JJ169XX.PZ.jpg?sw=230&q=60 - net::ERR_ABORTED'[39m,
  [32m'POST https://g82wgnrvm-ywk9dggrrw8mtggy.pc-rnd.c360a.salesforce.com/web/events/7ae070a6-f4ec-4def-a383-d9cacc3f20a1/ - net::ERR_NAME_NOT_RESOLVED'[39m
]

[1A[2K  2) [chromium] › e2e/product-quick-view.spec.ts:124:9 › Product Quick View › clicking Quick View button opens modal with product content 

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
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:125:9

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Product-5b0ee--modal-with-product-content-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/product-quick-view-Product-5b0ee--modal-with-product-content-chromium/error-context.md


[1A[2K[3/10] [chromium] › e2e/product-quick-view.spec.ts:191:9 › Product Quick View › Quick View modal closes with the close button



[1A[2K[chromium] › e2e/product-quick-view.spec.ts:191:9 › Product Quick View › Quick View modal closes with the close button

--- Browser Diagnostics for "Quick View modal closes with the close button" ---

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
  [32m'TypeError: Failed to fetch\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48232\n'[39m +
    [32m'    at za (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22073)\n'[39m +
    [32m'    at Generator._invoke (http://localhost:3000/mobify/bundle/development/vendor.js:30693:21823)\n'[39m +
    [32m'    at Ta.forEach.e.<computed> [as next] (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22447)\n'[39m +
    [32m'    at la (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20032)\n'[39m +
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20297\n'[39m +
    [32m'    at new Promise (<anonymous>)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20176\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48575'[39m,
  [32m'TypeError: Failed to fetch\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48232\n'[39m +
    [32m'    at za (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22073)\n'[39m +
    [32m'    at Generator._invoke (http://localhost:3000/mobify/bundle/development/vendor.js:30693:21823)\n'[39m +
    [32m'    at Ta.forEach.e.<computed> [as next] (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22447)\n'[39m +
    [32m'    at la (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20032)\n'[39m +
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20297\n'[39m +
    [32m'    at new Promise (<anonymous>)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20176\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48575'[39m,
  [32m'TypeError: Failed to fetch\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48232\n'[39m +
    [32m'    at za (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22073)\n'[39m +
    [32m'    at Generator._invoke (http://localhost:3000/mobify/bundle/development/vendor.js:30693:21823)\n'[39m +
    [32m'    at Ta.forEach.e.<computed> [as next] (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22447)\n'[39m +
    [32m'    at la (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20032)\n'[39m +
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20297\n'[39m +
    [32m'    at new Promise (<anonymous>)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20176\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48575'[39m,
  [32m'TypeError: Failed to fetch\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48232\n'[39m +
    [32m'    at za (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22073)\n'[39m +
    [32m'    at Generator._invoke (http://localhost:3000/mobify/bundle/development/vendor.js:30693:21823)\n'[39m +
    [32m'    at Ta.forEach.e.<computed> [as next] (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22447)\n'[39m +
    [32m'    at la (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20032)\n'[39m +
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20297\n'[39m +
    [32m'    at new Promise (<anonymous>)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20176\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48575'[39m,
  [32m'TypeError: Failed to fetch\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48232\n'[39m +
    [32m'    at za (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22073)\n'[39m +
    [32m'    at Generator._invoke (http://localhost:3000/mobify/bundle/development/vendor.js:30693:21823)\n'[39m +
    [32m'    at Ta.forEach.e.<computed> [as next] (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22447)\n'[39m +
    [32m'    at la (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20032)\n'[39m +
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20297\n'[39m +
    [32m'    at new Promise (<anonymous>)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20176\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48575'[39m,
  [32m'TypeError: Failed to fetch\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48232\n'[39m +
    [32m'    at za (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22073)\n'[39m +
    [32m'    at Generator._invoke (http://localhost:3000/mobify/bundle/development/vendor.js:30693:21823)\n'[39m +
    [32m'    at Ta.forEach.e.<computed> [as next] (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22447)\n'[39m +
    [32m'    at la (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20032)\n'[39m +
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20297\n'[39m +
    [32m'    at new Promise (<anonymous>)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20176\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48575'[39m,
  [32m'TypeError: Failed to fetch\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48232\n'[39m +
    [32m'    at za (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22073)\n'[39m +
    [32m'    at Generator._invoke (http://localhost:3000/mobify/bundle/development/vendor.js:30693:21823)\n'[39m +
    [32m'    at Ta.forEach.e.<computed> [as next] (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22447)\n'[39m +
    [32m'    at la (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20032)\n'[39m +
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20297\n'[39m +
    [32m'    at new Promise (<anonymous>)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20176\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48575'[39m,
  [32m'TypeError: Failed to fetch\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48232\n'[39m +
    [32m'    at za (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22073)\n'[39m +
    [32m'    at Generator._invoke (http://localhost:3000/mobify/bundle/development/vendor.js:30693:21823)\n'[39m +
    [32m'    at Ta.forEach.e.<computed> [as next] (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22447)\n'[39m +
    [32m'    at la (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20032)\n'[39m +
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20297\n'[39m +
    [32m'    at new Promise (<anonymous>)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20176\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48575'[39m,
  [32m'TypeError: Failed to fetch\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48232\n'[39m +
    [32m'    at za (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22073)\n'[39m +
    [32m'    at Generator._invoke (http://localhost:3000/mobify/bundle/development/vendor.js:30693:21823)\n'[39m +
    [32m'    at Ta.forEach.e.<computed> [as next] (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22447)\n'[39m +
    [32m'    at la (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20032)\n'[39m +
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20297\n'[39m +
    [32m'    at new Promise (<anonymous>)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20176\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48575'[39m,
  [32m'TypeError: Failed to fetch\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48232\n'[39m +
    [32m'    at za (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22073)\n'[39m +
    [32m'    at Generator._invoke (http://localhost:3000/mobify/bundle/development/vendor.js:30693:21823)\n'[39m +
    [32m'    at Ta.forEach.e.<computed> [as next] (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22447)\n'[39m +
    [32m'    at la (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20032)\n'[39m +
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20297\n'[39m +
    [32m'    at new Promise (<anonymous>)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20176\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48575'[39m,
  [32m'TypeError: Failed to fetch\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48232\n'[39m +
    [32m'    at za (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22073)\n'[39m +
    [32m'    at Generator._invoke (http://localhost:3000/mobify/bundle/development/vendor.js:30693:21823)\n'[39m +
    [32m'    at Ta.forEach.e.<computed> [as next] (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22447)\n'[39m +
    [32m'    at la (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20032)\n'[39m +
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20297\n'[39m +
    [32m'    at new Promise (<anonymous>)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20176\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48575'[39m,
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
  [32m'GET http://localhost:3000/__mrt/hmr - net::ERR_ABORTED'[39m,
  [32m'GET http://localhost:3000/mobify/proxy/api/shopper/auth/v1/organizations/f_ecom_aaia_prd/oauth2/authorize?redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fcallback&response_type=code&client_id=44cfcf31-d64d-4227-9cce-1d9b0716c321&hint=guest&channel_id=RefArch&code_challenge=dwE-kj3tPJjzbN2iHExSloOOZpvnQhalexKWYAVsk8s - net::ERR_ABORTED'[39m,
  [32m'GET https://images.demandware.net/dw/image/v2/AAIA_PRD/on/demandware.static/-/Sites-apparel-m-catalog/default/dw8f647e4c/images/medium/PG.10256690.JJ169XX.PZ.jpg?sw=230&q=60 - net::ERR_ABORTED'[39m,
  [32m'GET http://localhost:3000/callback?usid=e25d3d7b-efa1-4ba3-ab89-3c30c138d8c7&code=1cO6mwcV_UYh45wS-KmowTKJf2JfxMw8yVcD2Igofx4 - net::ERR_ABORTED'[39m,
  [32m'POST https://g82wgnrvm-ywk9dggrrw8mtggy.pc-rnd.c360a.salesforce.com/web/events/7ae070a6-f4ec-4def-a383-d9cacc3f20a1/ - net::ERR_NAME_NOT_RESOLVED'[39m
]

[1A[2K  3) [chromium] › e2e/product-quick-view.spec.ts:191:9 › Product Quick View › Quick View modal closes with the close button 

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
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:192:9

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Product-7d1af-loses-with-the-close-button-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/product-quick-view-Product-7d1af-loses-with-the-close-button-chromium/error-context.md


[1A[2K[4/10] [chromium] › e2e/product-quick-view.spec.ts:215:9 › Product Quick View › Quick View modal closes with Escape key


[1A[2K[chromium] › e2e/product-quick-view.spec.ts:215:9 › Product Quick View › Quick View modal closes with Escape key

--- Browser Diagnostics for "Quick View modal closes with Escape key" ---

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
  [32m'TypeError: Failed to fetch\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48232\n'[39m +
    [32m'    at za (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22073)\n'[39m +
    [32m'    at Generator._invoke (http://localhost:3000/mobify/bundle/development/vendor.js:30693:21823)\n'[39m +
    [32m'    at Ta.forEach.e.<computed> [as next] (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22447)\n'[39m +
    [32m'    at la (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20032)\n'[39m +
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20297\n'[39m +
    [32m'    at new Promise (<anonymous>)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20176\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48575'[39m,
  [32m'TypeError: Failed to fetch\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48232\n'[39m +
    [32m'    at za (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22073)\n'[39m +
    [32m'    at Generator._invoke (http://localhost:3000/mobify/bundle/development/vendor.js:30693:21823)\n'[39m +
    [32m'    at Ta.forEach.e.<computed> [as next] (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22447)\n'[39m +
    [32m'    at la (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20032)\n'[39m +
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20297\n'[39m +
    [32m'    at new Promise (<anonymous>)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20176\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48575'[39m,
  [32m'TypeError: Failed to fetch\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48232\n'[39m +
    [32m'    at za (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22073)\n'[39m +
    [32m'    at Generator._invoke (http://localhost:3000/mobify/bundle/development/vendor.js:30693:21823)\n'[39m +
    [32m'    at Ta.forEach.e.<computed> [as next] (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22447)\n'[39m +
    [32m'    at la (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20032)\n'[39m +
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20297\n'[39m +
    [32m'    at new Promise (<anonymous>)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20176\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48575'[39m,
  [32m'TypeError: Failed to fetch\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48232\n'[39m +
    [32m'    at za (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22073)\n'[39m +
    [32m'    at Generator._invoke (http://localhost:3000/mobify/bundle/development/vendor.js:30693:21823)\n'[39m +
    [32m'    at Ta.forEach.e.<computed> [as next] (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22447)\n'[39m +
    [32m'    at la (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20032)\n'[39m +
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20297\n'[39m +
    [32m'    at new Promise (<anonymous>)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20176\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48575'[39m,
  [32m'TypeError: Failed to fetch\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48232\n'[39m +
    [32m'    at za (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22073)\n'[39m +
    [32m'    at Generator._invoke (http://localhost:3000/mobify/bundle/development/vendor.js:30693:21823)\n'[39m +
    [32m'    at Ta.forEach.e.<computed> [as next] (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22447)\n'[39m +
    [32m'    at la (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20032)\n'[39m +
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20297\n'[39m +
    [32m'    at new Promise (<anonymous>)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20176\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48575'[39m,
  [32m'TypeError: Failed to fetch\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48232\n'[39m +
    [32m'    at za (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22073)\n'[39m +
    [32m'    at Generator._invoke (http://localhost:3000/mobify/bundle/development/vendor.js:30693:21823)\n'[39m +
    [32m'    at Ta.forEach.e.<computed> [as next] (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22447)\n'[39m +
    [32m'    at la (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20032)\n'[39m +
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20297\n'[39m +
    [32m'    at new Promise (<anonymous>)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20176\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48575'[39m,
  [32m'TypeError: Failed to fetch\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48232\n'[39m +
    [32m'    at za (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22073)\n'[39m +
    [32m'    at Generator._invoke (http://localhost:3000/mobify/bundle/development/vendor.js:30693:21823)\n'[39m +
    [32m'    at Ta.forEach.e.<computed> [as next] (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22447)\n'[39m +
    [32m'    at la (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20032)\n'[39m +
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20297\n'[39m +
    [32m'    at new Promise (<anonymous>)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20176\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48575'[39m,
  [32m'TypeError: Failed to fetch\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48232\n'[39m +
    [32m'    at za (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22073)\n'[39m +
    [32m'    at Generator._invoke (http://localhost:3000/mobify/bundle/development/vendor.js:30693:21823)\n'[39m +
    [32m'    at Ta.forEach.e.<computed> [as next] (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22447)\n'[39m +
    [32m'    at la (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20032)\n'[39m +
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20297\n'[39m +
    [32m'    at new Promise (<anonymous>)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20176\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48575'[39m,
  [32m'TypeError: Failed to fetch\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48232\n'[39m +
    [32m'    at za (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22073)\n'[39m +
    [32m'    at Generator._invoke (http://localhost:3000/mobify/bundle/development/vendor.js:30693:21823)\n'[39m +
    [32m'    at Ta.forEach.e.<computed> [as next] (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22447)\n'[39m +
    [32m'    at la (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20032)\n'[39m +
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20297\n'[39m +
    [32m'    at new Promise (<anonymous>)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20176\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48575'[39m,
  [32m'TypeError: Failed to fetch\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48232\n'[39m +
    [32m'    at za (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22073)\n'[39m +
    [32m'    at Generator._invoke (http://localhost:3000/mobify/bundle/development/vendor.js:30693:21823)\n'[39m +
    [32m'    at Ta.forEach.e.<computed> [as next] (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22447)\n'[39m +
    [32m'    at la (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20032)\n'[39m +
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20297\n'[39m +
    [32m'    at new Promise (<anonymous>)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20176\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48575'[39m,
  [32m'TypeError: Failed to fetch\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48232\n'[39m +
    [32m'    at za (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22073)\n'[39m +
    [32m'    at Generator._invoke (http://localhost:3000/mobify/bundle/development/vendor.js:30693:21823)\n'[39m +
    [32m'    at Ta.forEach.e.<computed> [as next] (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22447)\n'[39m +
    [32m'    at la (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20032)\n'[39m +
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20297\n'[39m +
    [32m'    at new Promise (<anonymous>)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20176\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48575'[39m,
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
  [32m'GET http://localhost:3000/callback?usid=16f85da4-2387-4f83-b301-dc6f3bbc7a57&code=EOkdflyCLPPvLFG5uLn_43l8fmGP0vqDmyS1n7LqsCk - net::ERR_ABORTED'[39m,
  [32m'GET http://localhost:3000/__mrt/hmr - net::ERR_ABORTED'[39m,
  [32m'POST http://localhost:3000/mobify/proxy/api/shopper/auth/v1/organizations/f_ecom_aaia_prd/oauth2/token - net::ERR_ABORTED'[39m,
  [32m'GET http://localhost:3000/callback?usid=9380d467-6b18-42a9-9efd-ed8ecf320b62&code=sNsPeOo1NgllNIdeffSB-nDukqe5rOJs0JqAA7q7TLE - net::ERR_ABORTED'[39m,
  [32m'POST https://g82wgnrvm-ywk9dggrrw8mtggy.pc-rnd.c360a.salesforce.com/web/events/7ae070a6-f4ec-4def-a383-d9cacc3f20a1/ - net::ERR_NAME_NOT_RESOLVED'[39m
]

[1A[2K  4) [chromium] › e2e/product-quick-view.spec.ts:215:9 › Product Quick View › Quick View modal closes with Escape key 

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
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:216:9

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Product-4addc-odal-closes-with-Escape-key-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/product-quick-view-Product-4addc-odal-closes-with-Escape-key-chromium/error-context.md


[1A[2K[5/10] [chromium] › e2e/product-quick-view.spec.ts:238:9 › Product Quick View › Quick View button has accessible aria-label


[1A[2K[chromium] › e2e/product-quick-view.spec.ts:238:9 › Product Quick View › Quick View button has accessible aria-label

--- Browser Diagnostics for "Quick View button has accessible aria-label" ---

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
  [32m'TypeError: Failed to fetch\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48232\n'[39m +
    [32m'    at za (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22073)\n'[39m +
    [32m'    at Generator._invoke (http://localhost:3000/mobify/bundle/development/vendor.js:30693:21823)\n'[39m +
    [32m'    at Ta.forEach.e.<computed> [as next] (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22447)\n'[39m +
    [32m'    at la (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20032)\n'[39m +
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20297\n'[39m +
    [32m'    at new Promise (<anonymous>)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20176\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48575'[39m,
  [32m'TypeError: Failed to fetch\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48232\n'[39m +
    [32m'    at za (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22073)\n'[39m +
    [32m'    at Generator._invoke (http://localhost:3000/mobify/bundle/development/vendor.js:30693:21823)\n'[39m +
    [32m'    at Ta.forEach.e.<computed> [as next] (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22447)\n'[39m +
    [32m'    at la (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20032)\n'[39m +
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20297\n'[39m +
    [32m'    at new Promise (<anonymous>)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20176\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48575'[39m,
  [32m'TypeError: Failed to fetch\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48232\n'[39m +
    [32m'    at za (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22073)\n'[39m +
    [32m'    at Generator._invoke (http://localhost:3000/mobify/bundle/development/vendor.js:30693:21823)\n'[39m +
    [32m'    at Ta.forEach.e.<computed> [as next] (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22447)\n'[39m +
    [32m'    at la (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20032)\n'[39m +
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20297\n'[39m +
    [32m'    at new Promise (<anonymous>)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20176\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48575'[39m,
  [32m'TypeError: Failed to fetch\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48232\n'[39m +
    [32m'    at za (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22073)\n'[39m +
    [32m'    at Generator._invoke (http://localhost:3000/mobify/bundle/development/vendor.js:30693:21823)\n'[39m +
    [32m'    at Ta.forEach.e.<computed> [as next] (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22447)\n'[39m +
    [32m'    at la (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20032)\n'[39m +
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20297\n'[39m +
    [32m'    at new Promise (<anonymous>)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20176\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48575'[39m,
  [32m'TypeError: Failed to fetch\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48232\n'[39m +
    [32m'    at za (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22073)\n'[39m +
    [32m'    at Generator._invoke (http://localhost:3000/mobify/bundle/development/vendor.js:30693:21823)\n'[39m +
    [32m'    at Ta.forEach.e.<computed> [as next] (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22447)\n'[39m +
    [32m'    at la (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20032)\n'[39m +
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20297\n'[39m +
    [32m'    at new Promise (<anonymous>)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20176\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48575'[39m,
  [32m'TypeError: Failed to fetch\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48232\n'[39m +
    [32m'    at za (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22073)\n'[39m +
    [32m'    at Generator._invoke (http://localhost:3000/mobify/bundle/development/vendor.js:30693:21823)\n'[39m +
    [32m'    at Ta.forEach.e.<computed> [as next] (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22447)\n'[39m +
    [32m'    at la (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20032)\n'[39m +
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20297\n'[39m +
    [32m'    at new Promise (<anonymous>)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20176\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48575'[39m,
  [32m'TypeError: Failed to fetch\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48232\n'[39m +
    [32m'    at za (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22073)\n'[39m +
    [32m'    at Generator._invoke (http://localhost:3000/mobify/bundle/development/vendor.js:30693:21823)\n'[39m +
    [32m'    at Ta.forEach.e.<computed> [as next] (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22447)\n'[39m +
    [32m'    at la (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20032)\n'[39m +
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20297\n'[39m +
    [32m'    at new Promise (<anonymous>)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20176\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48575'[39m,
  [32m'TypeError: Failed to fetch\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48232\n'[39m +
    [32m'    at za (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22073)\n'[39m +
    [32m'    at Generator._invoke (http://localhost:3000/mobify/bundle/development/vendor.js:30693:21823)\n'[39m +
    [32m'    at Ta.forEach.e.<computed> [as next] (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22447)\n'[39m +
    [32m'    at la (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20032)\n'[39m +
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20297\n'[39m +
    [32m'    at new Promise (<anonymous>)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20176\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48575'[39m,
  [32m'TypeError: Failed to fetch\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48232\n'[39m +
    [32m'    at za (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22073)\n'[39m +
    [32m'    at Generator._invoke (http://localhost:3000/mobify/bundle/development/vendor.js:30693:21823)\n'[39m +
    [32m'    at Ta.forEach.e.<computed> [as next] (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22447)\n'[39m +
    [32m'    at la (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20032)\n'[39m +
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20297\n'[39m +
    [32m'    at new Promise (<anonymous>)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20176\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48575'[39m,
  [32m'TypeError: Failed to fetch\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48232\n'[39m +
    [32m'    at za (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22073)\n'[39m +
    [32m'    at Generator._invoke (http://localhost:3000/mobify/bundle/development/vendor.js:30693:21823)\n'[39m +
    [32m'    at Ta.forEach.e.<computed> [as next] (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22447)\n'[39m +
    [32m'    at la (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20032)\n'[39m +
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20297\n'[39m +
    [32m'    at new Promise (<anonymous>)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20176\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48575'[39m,
  [32m'TypeError: Failed to fetch\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48232\n'[39m +
    [32m'    at za (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22073)\n'[39m +
    [32m'    at Generator._invoke (http://localhost:3000/mobify/bundle/development/vendor.js:30693:21823)\n'[39m +
    [32m'    at Ta.forEach.e.<computed> [as next] (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22447)\n'[39m +
    [32m'    at la (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20032)\n'[39m +
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20297\n'[39m +
    [32m'    at new Promise (<anonymous>)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20176\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48575'[39m,
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
  [32m'GET http://localhost:3000/mobify/proxy/api/shopper/auth/v1/organizations/f_ecom_aaia_prd/oauth2/authorize?redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fcallback&response_type=code&client_id=44cfcf31-d64d-4227-9cce-1d9b0716c321&hint=guest&channel_id=RefArch&code_challenge=8xDIXCd94wQn1P8CoyVunqafaYxK14C1SOqC2DoLFRM - net::ERR_ABORTED'[39m,
  [32m'GET http://localhost:3000/__mrt/hmr - net::ERR_ABORTED'[39m,
  [32m'GET https://images.demandware.net/dw/image/v2/AAIA_PRD/on/demandware.static/-/Sites-apparel-m-catalog/default/dw8f647e4c/images/medium/PG.10256690.JJ169XX.PZ.jpg?sw=230&q=60 - net::ERR_ABORTED'[39m,
  [32m'GET http://localhost:3000/callback?usid=82fd3360-6e9f-4afa-88bf-17e3fe00eda6&code=fe8HIaMdKCWzt5VgtK8GlnxyUVeJMm6Xkqp5NzkvTYk - net::ERR_ABORTED'[39m,
  [32m'POST https://g82wgnrvm-ywk9dggrrw8mtggy.pc-rnd.c360a.salesforce.com/web/events/7ae070a6-f4ec-4def-a383-d9cacc3f20a1/ - net::ERR_NAME_NOT_RESOLVED'[39m
]

[1A[2K  5) [chromium] › e2e/product-quick-view.spec.ts:238:9 › Product Quick View › Quick View button has accessible aria-label 

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
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:239:9

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Product-1f737-n-has-accessible-aria-label-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/product-quick-view-Product-1f737-n-has-accessible-aria-label-chromium/error-context.md


[1A[2K[6/10] [chromium] › e2e/product-quick-view.spec.ts:255:9 › Product Quick View › Quick View does not navigate away from PLP


[1A[2K[chromium] › e2e/product-quick-view.spec.ts:255:9 › Product Quick View › Quick View does not navigate away from PLP

--- Browser Diagnostics for "Quick View does not navigate away from PLP" ---

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
  [32m'TypeError: Failed to fetch\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48232\n'[39m +
    [32m'    at za (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22073)\n'[39m +
    [32m'    at Generator._invoke (http://localhost:3000/mobify/bundle/development/vendor.js:30693:21823)\n'[39m +
    [32m'    at Ta.forEach.e.<computed> [as next] (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22447)\n'[39m +
    [32m'    at la (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20032)\n'[39m +
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20297\n'[39m +
    [32m'    at new Promise (<anonymous>)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20176\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48575'[39m,
  [32m'TypeError: Failed to fetch\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48232\n'[39m +
    [32m'    at za (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22073)\n'[39m +
    [32m'    at Generator._invoke (http://localhost:3000/mobify/bundle/development/vendor.js:30693:21823)\n'[39m +
    [32m'    at Ta.forEach.e.<computed> [as next] (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22447)\n'[39m +
    [32m'    at la (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20032)\n'[39m +
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20297\n'[39m +
    [32m'    at new Promise (<anonymous>)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20176\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48575'[39m,
  [32m'TypeError: Failed to fetch\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48232\n'[39m +
    [32m'    at za (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22073)\n'[39m +
    [32m'    at Generator._invoke (http://localhost:3000/mobify/bundle/development/vendor.js:30693:21823)\n'[39m +
    [32m'    at Ta.forEach.e.<computed> [as next] (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22447)\n'[39m +
    [32m'    at la (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20032)\n'[39m +
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20297\n'[39m +
    [32m'    at new Promise (<anonymous>)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20176\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48575'[39m,
  [32m'TypeError: Failed to fetch\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48232\n'[39m +
    [32m'    at za (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22073)\n'[39m +
    [32m'    at Generator._invoke (http://localhost:3000/mobify/bundle/development/vendor.js:30693:21823)\n'[39m +
    [32m'    at Ta.forEach.e.<computed> [as next] (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22447)\n'[39m +
    [32m'    at la (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20032)\n'[39m +
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20297\n'[39m +
    [32m'    at new Promise (<anonymous>)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20176\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48575'[39m,
  [32m'TypeError: Failed to fetch\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48232\n'[39m +
    [32m'    at za (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22073)\n'[39m +
    [32m'    at Generator._invoke (http://localhost:3000/mobify/bundle/development/vendor.js:30693:21823)\n'[39m +
    [32m'    at Ta.forEach.e.<computed> [as next] (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22447)\n'[39m +
    [32m'    at la (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20032)\n'[39m +
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20297\n'[39m +
    [32m'    at new Promise (<anonymous>)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20176\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48575'[39m,
  [32m'TypeError: Failed to fetch\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48232\n'[39m +
    [32m'    at za (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22073)\n'[39m +
    [32m'    at Generator._invoke (http://localhost:3000/mobify/bundle/development/vendor.js:30693:21823)\n'[39m +
    [32m'    at Ta.forEach.e.<computed> [as next] (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22447)\n'[39m +
    [32m'    at la (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20032)\n'[39m +
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20297\n'[39m +
    [32m'    at new Promise (<anonymous>)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20176\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48575'[39m,
  [32m'TypeError: Failed to fetch\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48232\n'[39m +
    [32m'    at za (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22073)\n'[39m +
    [32m'    at Generator._invoke (http://localhost:3000/mobify/bundle/development/vendor.js:30693:21823)\n'[39m +
    [32m'    at Ta.forEach.e.<computed> [as next] (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22447)\n'[39m +
    [32m'    at la (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20032)\n'[39m +
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20297\n'[39m +
    [32m'    at new Promise (<anonymous>)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20176\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48575'[39m,
  [32m'TypeError: Failed to fetch\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48232\n'[39m +
    [32m'    at za (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22073)\n'[39m +
    [32m'    at Generator._invoke (http://localhost:3000/mobify/bundle/development/vendor.js:30693:21823)\n'[39m +
    [32m'    at Ta.forEach.e.<computed> [as next] (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22447)\n'[39m +
    [32m'    at la (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20032)\n'[39m +
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20297\n'[39m +
    [32m'    at new Promise (<anonymous>)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20176\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48575'[39m,
  [32m'TypeError: Failed to fetch\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48232\n'[39m +
    [32m'    at za (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22073)\n'[39m +
    [32m'    at Generator._invoke (http://localhost:3000/mobify/bundle/development/vendor.js:30693:21823)\n'[39m +
    [32m'    at Ta.forEach.e.<computed> [as next] (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22447)\n'[39m +
    [32m'    at la (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20032)\n'[39m +
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20297\n'[39m +
    [32m'    at new Promise (<anonymous>)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20176\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48575'[39m,
  [32m'TypeError: Failed to fetch\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48232\n'[39m +
    [32m'    at za (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22073)\n'[39m +
    [32m'    at Generator._invoke (http://localhost:3000/mobify/bundle/development/vendor.js:30693:21823)\n'[39m +
    [32m'    at Ta.forEach.e.<computed> [as next] (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22447)\n'[39m +
    [32m'    at la (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20032)\n'[39m +
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20297\n'[39m +
    [32m'    at new Promise (<anonymous>)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20176\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48575'[39m,
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
  [32m'GET http://localhost:3000/callback?usid=8e79a9f9-f5b3-4589-ab0e-d6b4ff2bab95&code=AYTtGGeE_sj4i_GNhE5MZpSQjNdDqjOoHbZ5MObPA_8 - net::ERR_ABORTED'[39m,
  [32m'GET http://localhost:3000/mobify/proxy/api/product/shopper-products/v1/organizations/f_ecom_aaia_prd/products/25688190M?currency=USD&locale=en-US&siteId=RefArch - net::ERR_ABORTED'[39m,
  [32m'GET http://localhost:3000/mobify/proxy/api/configuration/shopper-configurations/v1/organizations/f_ecom_aaia_prd/configurations?siteId=RefArch - net::ERR_ABORTED'[39m,
  [32m'GET http://localhost:3000/mobify/proxy/api/product/shopper-products/v1/organizations/f_ecom_aaia_prd/products/25762759M?currency=USD&locale=en-US&siteId=RefArch - net::ERR_ABORTED'[39m,
  [32m'GET http://localhost:3000/mobify/proxy/api/product/shopper-products/v1/organizations/f_ecom_aaia_prd/products/25697578M?currency=USD&locale=en-US&siteId=RefArch - net::ERR_ABORTED'[39m,
  [32m'GET http://localhost:3000/__mrt/hmr - net::ERR_ABORTED'[39m,
  [32m'GET http://localhost:3000/mobify/proxy/api/product/shopper-products/v1/organizations/f_ecom_aaia_prd/products/25695217M?currency=USD&locale=en-US&siteId=RefArch - net::ERR_ABORTED'[39m,
  [32m'GET http://localhost:3000/mobify/proxy/api/customer/shopper-customers/v1/organizations/f_ecom_aaia_prd/customers/abmes1muc3xHIRxHtGkWYYlrE3/baskets?siteId=RefArch - net::ERR_ABORTED'[39m,
  [32m'GET http://localhost:3000/mobify/proxy/api/product/shopper-products/v1/organizations/f_ecom_aaia_prd/products/25695305M?currency=USD&locale=en-US&siteId=RefArch - net::ERR_ABORTED'[39m,
  [32m'GET http://localhost:3000/mobify/proxy/api/product/shopper-products/v1/organizations/f_ecom_aaia_prd/products/25553417M?currency=USD&locale=en-US&siteId=RefArch - net::ERR_ABORTED'[39m,
  [32m'GET http://localhost:3000/mobify/proxy/api/shopper/shopper-context/v1/organizations/f_ecom_aaia_prd/shopper-context/8e79a9f9-f5b3-4589-ab0e-d6b4ff2bab95?siteId=RefArch - net::ERR_ABORTED'[39m,
  [32m'GET http://localhost:3000/mobify/proxy/api/customer/shopper-customers/v1/organizations/f_ecom_aaia_prd/customers/abmes1muc3xHIRxHtGkWYYlrE3/product-lists?siteId=RefArch - net::ERR_ABORTED'[39m,
  [32m'POST https://g82wgnrvm-ywk9dggrrw8mtggy.pc-rnd.c360a.salesforce.com/web/events/7ae070a6-f4ec-4def-a383-d9cacc3f20a1/ - net::ERR_NAME_NOT_RESOLVED'[39m,
  [32m'GET https://images.demandware.net/dw/image/v2/AAIA_PRD/on/demandware.static/-/Sites-apparel-m-catalog/default/dw8f647e4c/images/medium/PG.10256690.JJ169XX.PZ.jpg?sw=230&q=60 - net::ERR_ABORTED'[39m
]

[1A[2K  6) [chromium] › e2e/product-quick-view.spec.ts:255:9 › Product Quick View › Quick View does not navigate away from PLP 

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
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:256:9

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Product-a22d8--not-navigate-away-from-PLP-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/product-quick-view-Product-a22d8--not-navigate-away-from-PLP-chromium/error-context.md


[1A[2K[7/10] [chromium] › e2e/product-quick-view.spec.ts:283:9 › Product Quick View › Quick View modal shows loading spinner then content or error


[1A[2K[chromium] › e2e/product-quick-view.spec.ts:283:9 › Product Quick View › Quick View modal shows loading spinner then content or error

--- Browser Diagnostics for "Quick View modal shows loading spinner then content or error" ---

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
  [32m'TypeError: Failed to fetch\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48232\n'[39m +
    [32m'    at za (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22073)\n'[39m +
    [32m'    at Generator._invoke (http://localhost:3000/mobify/bundle/development/vendor.js:30693:21823)\n'[39m +
    [32m'    at Ta.forEach.e.<computed> [as next] (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22447)\n'[39m +
    [32m'    at la (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20032)\n'[39m +
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20297\n'[39m +
    [32m'    at new Promise (<anonymous>)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20176\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48575'[39m,
  [32m'TypeError: Failed to fetch\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48232\n'[39m +
    [32m'    at za (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22073)\n'[39m +
    [32m'    at Generator._invoke (http://localhost:3000/mobify/bundle/development/vendor.js:30693:21823)\n'[39m +
    [32m'    at Ta.forEach.e.<computed> [as next] (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22447)\n'[39m +
    [32m'    at la (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20032)\n'[39m +
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20297\n'[39m +
    [32m'    at new Promise (<anonymous>)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20176\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48575'[39m,
  [32m'TypeError: Failed to fetch\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48232\n'[39m +
    [32m'    at za (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22073)\n'[39m +
    [32m'    at Generator._invoke (http://localhost:3000/mobify/bundle/development/vendor.js:30693:21823)\n'[39m +
    [32m'    at Ta.forEach.e.<computed> [as next] (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22447)\n'[39m +
    [32m'    at la (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20032)\n'[39m +
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20297\n'[39m +
    [32m'    at new Promise (<anonymous>)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20176\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48575'[39m,
  [32m'TypeError: Failed to fetch\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48232\n'[39m +
    [32m'    at za (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22073)\n'[39m +
    [32m'    at Generator._invoke (http://localhost:3000/mobify/bundle/development/vendor.js:30693:21823)\n'[39m +
    [32m'    at Ta.forEach.e.<computed> [as next] (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22447)\n'[39m +
    [32m'    at la (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20032)\n'[39m +
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20297\n'[39m +
    [32m'    at new Promise (<anonymous>)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20176\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48575'[39m,
  [32m'TypeError: Failed to fetch\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48232\n'[39m +
    [32m'    at za (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22073)\n'[39m +
    [32m'    at Generator._invoke (http://localhost:3000/mobify/bundle/development/vendor.js:30693:21823)\n'[39m +
    [32m'    at Ta.forEach.e.<computed> [as next] (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22447)\n'[39m +
    [32m'    at la (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20032)\n'[39m +
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20297\n'[39m +
    [32m'    at new Promise (<anonymous>)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20176\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48575'[39m,
  [32m'TypeError: Failed to fetch\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48232\n'[39m +
    [32m'    at za (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22073)\n'[39m +
    [32m'    at Generator._invoke (http://localhost:3000/mobify/bundle/development/vendor.js:30693:21823)\n'[39m +
    [32m'    at Ta.forEach.e.<computed> [as next] (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22447)\n'[39m +
    [32m'    at la (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20032)\n'[39m +
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20297\n'[39m +
    [32m'    at new Promise (<anonymous>)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20176\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48575'[39m,
  [32m'TypeError: Failed to fetch\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48232\n'[39m +
    [32m'    at za (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22073)\n'[39m +
    [32m'    at Generator._invoke (http://localhost:3000/mobify/bundle/development/vendor.js:30693:21823)\n'[39m +
    [32m'    at Ta.forEach.e.<computed> [as next] (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22447)\n'[39m +
    [32m'    at la (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20032)\n'[39m +
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20297\n'[39m +
    [32m'    at new Promise (<anonymous>)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20176\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48575'[39m,
  [32m'TypeError: Failed to fetch\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48232\n'[39m +
    [32m'    at za (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22073)\n'[39m +
    [32m'    at Generator._invoke (http://localhost:3000/mobify/bundle/development/vendor.js:30693:21823)\n'[39m +
    [32m'    at Ta.forEach.e.<computed> [as next] (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22447)\n'[39m +
    [32m'    at la (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20032)\n'[39m +
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20297\n'[39m +
    [32m'    at new Promise (<anonymous>)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20176\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48575'[39m,
  [32m'TypeError: Failed to fetch\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48232\n'[39m +
    [32m'    at za (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22073)\n'[39m +
    [32m'    at Generator._invoke (http://localhost:3000/mobify/bundle/development/vendor.js:30693:21823)\n'[39m +
    [32m'    at Ta.forEach.e.<computed> [as next] (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22447)\n'[39m +
    [32m'    at la (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20032)\n'[39m +
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20297\n'[39m +
    [32m'    at new Promise (<anonymous>)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20176\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48575'[39m,
  [32m'TypeError: Failed to fetch\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48232\n'[39m +
    [32m'    at za (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22073)\n'[39m +
    [32m'    at Generator._invoke (http://localhost:3000/mobify/bundle/development/vendor.js:30693:21823)\n'[39m +
    [32m'    at Ta.forEach.e.<computed> [as next] (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22447)\n'[39m +
    [32m'    at la (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20032)\n'[39m +
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20297\n'[39m +
    [32m'    at new Promise (<anonymous>)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20176\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48575'[39m,
  [32m'TypeError: Failed to fetch\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48232\n'[39m +
    [32m'    at za (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22073)\n'[39m +
    [32m'    at Generator._invoke (http://localhost:3000/mobify/bundle/development/vendor.js:30693:21823)\n'[39m +
    [32m'    at Ta.forEach.e.<computed> [as next] (http://localhost:3000/mobify/bundle/development/vendor.js:30693:22447)\n'[39m +
    [32m'    at la (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20032)\n'[39m +
    [32m'    at o (http://localhost:3000/mobify/bundle/development/vendor.js:30693:20236)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20297\n'[39m +
    [32m'    at new Promise (<anonymous>)\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:20176\n'[39m +
    [32m'    at http://localhost:3000/mobify/bundle/development/vendor.js:30693:48575'[39m,
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
  [32m'GET http://localhost:3000/callback?usid=7b193d77-ba2e-4b8a-9e84-96e95e4a4186&code=-lvHxnLZ5N2Z78TKq1hKGagiBDu_qhzj1qbWg5Hafjs - net::ERR_ABORTED'[39m,
  [32m'POST http://localhost:3000/mobify/proxy/api/shopper/auth/v1/organizations/f_ecom_aaia_prd/oauth2/token - net::ERR_ABORTED'[39m,
  [32m'GET http://localhost:3000/__mrt/hmr - net::ERR_ABORTED'[39m,
  [32m'GET http://localhost:3000/callback?usid=c582a7d3-018f-441d-b23f-5824f1a05409&code=zvPpHs44y0KLh013cF4TDQB8lEB1U-Ts6c2F3JSu9qg - net::ERR_ABORTED'[39m,
  [32m'POST https://g82wgnrvm-ywk9dggrrw8mtggy.pc-rnd.c360a.salesforce.com/web/events/7ae070a6-f4ec-4def-a383-d9cacc3f20a1/ - net::ERR_NAME_NOT_RESOLVED'[39m
]

[1A[2K  7) [chromium] › e2e/product-quick-view.spec.ts:283:9 › Product Quick View › Quick View modal shows loading spinner then content or error 

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
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:284:9

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Product-abc59-inner-then-content-or-error-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/product-quick-view-Product-abc59-inner-then-content-or-error-chromium/error-context.md


[1A[2K[8/10] [chromium] › e2e/storefront-smoke.spec.ts:52:7 › Storefront Smoke Tests › homepage loads and renders
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

[1A[2K  8) [chromium] › e2e/storefront-smoke.spec.ts:52:7 › Storefront Smoke Tests › homepage loads and renders 

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


[1A[2K[9/10] [chromium] › e2e/storefront-smoke.spec.ts:59:7 › Storefront Smoke Tests › can navigate to a category/PLP page




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
  [32m'GET http://localhost:3000/callback?usid=c640b6eb-c2c5-47b0-b6d4-a9d3d8dffa14&code=G7qn4jxYiw279hIEMin81BztfuHmJ2yecNUwY8EWpBU - net::ERR_ABORTED'[39m,
  [32m'GET http://localhost:3000/callback?usid=fd896e1e-eae3-4e7f-99d1-23324fd3ae4a&code=8c3pEkbzBJnV7ceBRZbpzrqTT159XHHZV-Tk3k5fuj4 - net::ERR_ABORTED'[39m,
  [32m'GET http://localhost:3000/callback?usid=8d6132f2-dbb0-4244-9c36-c89cd35ec3c5&code=2YOdd_py5HXOE3G-nzgWB7vid08kZj-B3EB3bwxU-jc - net::ERR_ABORTED'[39m,
  [32m'POST https://g82wgnrvm-ywk9dggrrw8mtggy.pc-rnd.c360a.salesforce.com/web/events/7ae070a6-f4ec-4def-a383-d9cacc3f20a1/ - net::ERR_NAME_NOT_RESOLVED'[39m,
  [32m'GET https://images.demandware.net/dw/image/v2/AAIA_PRD/on/demandware.static/-/Sites-apparel-m-catalog/default/dw8f647e4c/images/medium/PG.10256690.JJ169XX.PZ.jpg?sw=230&q=60 - net::ERR_ABORTED'[39m
]

[1A[2K  9) [chromium] › e2e/storefront-smoke.spec.ts:59:7 › Storefront Smoke Tests › can navigate to a category/PLP page 

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


[1A[2K[10/10] [chromium] › e2e/storefront-smoke.spec.ts:71:7 › Storefront Smoke Tests › product detail page shows product info
[1A[2K  9 failed
    [chromium] › e2e/product-quick-view.spec.ts:109:9 › Product Quick View › Quick View button renders on PLP product tiles 
    [chromium] › e2e/product-quick-view.spec.ts:124:9 › Product Quick View › clicking Quick View button opens modal with product content 
    [chromium] › e2e/product-quick-view.spec.ts:191:9 › Product Quick View › Quick View modal closes with the close button 
    [chromium] › e2e/product-quick-view.spec.ts:215:9 › Product Quick View › Quick View modal closes with Escape key 
    [chromium] › e2e/product-quick-view.spec.ts:238:9 › Product Quick View › Quick View button has accessible aria-label 
    [chromium] › e2e/product-quick-view.spec.ts:255:9 › Product Quick View › Quick View does not navigate away from PLP 
    [chromium] › e2e/product-quick-view.spec.ts:283:9 › Product Quick View › Quick View modal shows loading spinner then content or error 
    [chromium] › e2e/storefront-smoke.spec.ts:52:7 › Storefront Smoke Tests › homepage loads and renders 
    [chromium] › e2e/storefront-smoke.spec.ts:59:7 › Storefront Smoke Tests › can navigate to a category/PLP page 
  1 passed (5.7m)
[1A[2K[2m[WebServer] [22m(node:9767) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
[2m[WebServer] [22m(Use `node --trace-deprecation ...` to show where the warning was created)
[1A[2K[2m[WebServer] [22m(node:9792) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
[2m[WebServer] [22m(Use `node --trace-deprecation ...` to show where the warning was created)
[1A[2K[2m[WebServer] [22m(node:9792) [DEP0060] DeprecationWarning: The `util._extend` API is deprecated. Please use Object.assign() instead.
[1A[2K[2m[WebServer] [22mWarning: PageDesignerProvider: Support for defaultProps will be removed from function components in a future major release. Use JavaScript default parameters instead.
[2m[WebServer] [22m    at PageDesignerProvider (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:308685:33)
[2m[WebServer] [22m    at OfflineBoundary (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:9619:5)
[2m[WebServer] [22m    at C (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:249731:37)
[2m[WebServer] [22m    at main
[2m[WebServer] [22m    at /workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:95460:68
[2m[WebServer] [22m    at ChakraComponent (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:280371:102)
[2m[WebServer] [22m    at div
[2m[WebServer] [22m    at /workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:95460:68
[2m[WebServer] [22m    at ChakraComponent (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:280371:102)
[2m[WebServer] [22m    at SkipNavContent2 (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:278274:13)
[2m[WebServer] [22m    at BonusProductSelectionModalProvider (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:52024:3)
[2m[WebServer] [22m    at AddToCartModalProvider (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:50276:3)
[2m[WebServer] [22m    at div
[2m[WebServer] [22m    at /workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:95460:68
[2m[WebServer] [22m    at ChakraComponent (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:280371:102)
[2m[WebServer] [22m    at CurrencyProvider (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:49953:13)
[2m[WebServer] [22m    at IntlProvider (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:243432:47)
[2m[WebServer] [22m    at StorefrontPreview (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:123070:3)
[2m[WebServer] [22m    at div
[2m[WebServer] [22m    at /workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:95460:68
[2m[WebServer] [22m    at ChakraComponent (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:280371:102)
[2m[WebServer] [22m    at App (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:210:5)
[2m[WebServer] [22m    at RouteComponent (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:133587:7)
[2m[WebServer] [22m    at C (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:249731:37)
[2m[WebServer] [22m    at WithErrorHandling(withRouter(routeComponent(App)))
[2m[WebServer] [22m    at AppErrorBoundary (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:133227:5)
[2m[WebServer] [22m    at WrappedComponent (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:134080:42)
[2m[WebServer] [22m    at C (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:249731:37)
[2m[WebServer] [22m    at UIDReset (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:251521:23)
[2m[WebServer] [22m    at Switch (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:133972:5)
[2m[WebServer] [22m    at EnvironmentProvider (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:277088:11)
[2m[WebServer] [22m    at ColorModeProvider (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:269226:5)
[2m[WebServer] [22m    at ThemeProvider (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:95503:50)
[2m[WebServer] [22m    at ThemeProvider (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:280202:11)
[2m[WebServer] [22m    at ChakraProvider (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:276380:5)
[2m[WebServer] [22m    at ChakraProvider2 (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:277801:5)
[2m[WebServer] [22m    at StoreLocatorProvider (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:23156:3)
[2m[WebServer] [22m    at MultiSiteProvider (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:49905:9)
[2m[WebServer] [22m    at CommerceApiProvider (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:132008:5)
[2m[WebServer] [22m    at AppConfig (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:68882:3)
[2m[WebServer] [22m    at Hydrate (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:150266:3)
[2m[WebServer] [22m    at QueryClientProvider (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:150334:3)
[2m[WebServer] [22m    at WithReactQuery (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:134257:3)
[2m[WebServer] [22m    at CorrelationIdProvider (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:134402:3)
[2m[WebServer] [22m    at Router (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:249093:30)
[2m[WebServer] [22m    at StaticRouter (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:249589:35)
[2m[WebServer] [22m    at OuterApp (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:132862:3)
[2m[WebServer] [22m    at ChunkExtractorManager (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:288804:24)
[1A[2K[2m[WebServer] [22mWarning: Document: Support for defaultProps will be removed from function components in a future major release. Use JavaScript default parameters instead.
[2m[WebServer] [22m    at Document (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:133144:5)
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (6ed41fe3-b166-4621-8828-6548b4b38458) GET /mobify/proxy/api/shopper/shopper-context/v1/organizations/f_ecom_aaia_prd/shopper-context/86ad5d13-c503-4787-b4b7-64362097c20a?siteId=RefArch 403 432.242 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (889fc754-1143-4b35-bdae-2956946681e2) GET /mobify/proxy/api/customer/shopper-customers/v1/organizations/f_ecom_aaia_prd/customers/abmbxFxbtIkrkRwXsUkWYYlXE1/product-lists?siteId=RefArch 400 635.986 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (35373ba4-fc05-4fab-bd84-b9f14aad7bbe) GET /mobify/proxy/api/customer/shopper-customers/v1/organizations/f_ecom_aaia_prd/customers/abmbxFxbtIkrkRwXsUkWYYlXE1/baskets?siteId=RefArch 400 722.817 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (d67dfb6b-e57c-4225-9d13-03b6b894185c) GET /mobify/proxy/api/shopper/shopper-context/v1/organizations/f_ecom_aaia_prd/shopper-context/df8ddb34-c820-4b50-94f9-a5c488e9c73b?siteId=RefArch 403 502.722 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (440adb2f-8f2f-43cf-92ca-aa6d44f21ae0) GET /mobify/proxy/api/shopper/shopper-context/v1/organizations/f_ecom_aaia_prd/shopper-context/1660886d-6894-42fe-a6af-54d5fccba3dd?siteId=RefArch 403 1033.811 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (1d91aa30-8f6c-438e-b477-0d6e7fc97f20) GET /mobify/proxy/api/configuration/shopper-configurations/v1/organizations/f_ecom_aaia_prd/configurations?siteId=RefArch 403 457.100 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mWarning: React does not recognize the `fetchPriority` prop on a DOM element. If you intentionally want it to appear in the DOM as a custom attribute, spell it as lowercase `fetchpriority` instead. If you accidentally passed it from a parent component, remove it from the DOM element.
[2m[WebServer] [22m    at link
[2m[WebServer] [22m    at head
[2m[WebServer] [22m    at html
[2m[WebServer] [22m    at Document (/workspaces/DAGent-t/apps/commerce-storefront/build/main-server.js:133144:5)
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (266c193d-abe5-45c2-88b2-86ca7d44e4aa) GET /mobify/proxy/api/shopper/shopper-context/v1/organizations/f_ecom_aaia_prd/shopper-context/e25d3d7b-efa1-4ba3-ab89-3c30c138d8c7?siteId=RefArch 403 116.373 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (04990d07-4655-4f2e-9ff0-cbb776bca2e4) GET /mobify/proxy/api/configuration/shopper-configurations/v1/organizations/f_ecom_aaia_prd/configurations?siteId=RefArch 403 620.831 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (c57a8379-5594-47fc-9ccc-a8e661b1b3e9) GET /mobify/proxy/api/configuration/shopper-configurations/v1/organizations/f_ecom_aaia_prd/configurations?siteId=RefArch 403 115.156 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (7799d45f-d675-4d7f-a4db-6fe6dde4ae85) GET /mobify/proxy/api/shopper/shopper-context/v1/organizations/f_ecom_aaia_prd/shopper-context/9380d467-6b18-42a9-9efd-ed8ecf320b62?siteId=RefArch 403 471.657 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (53522e32-465a-4789-86bf-bf3ae04fa563) GET /mobify/proxy/api/configuration/shopper-configurations/v1/organizations/f_ecom_aaia_prd/configurations?siteId=RefArch 403 131.258 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (06cb08d9-157a-4edb-9af3-9a8a197f77de) GET /mobify/proxy/api/shopper/shopper-context/v1/organizations/f_ecom_aaia_prd/shopper-context/82fd3360-6e9f-4afa-88bf-17e3fe00eda6?siteId=RefArch 403 109.826 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (654ad964-b8c3-4f7d-912b-d9e0fe6f3276) GET /mobify/proxy/api/shopper/shopper-context/v1/organizations/f_ecom_aaia_prd/shopper-context/8e79a9f9-f5b3-4589-ab0e-d6b4ff2bab95?siteId=RefArch 403 119.551 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (43c7f722-275c-4a47-b0a7-b4593d7042b6) GET /mobify/proxy/api/configuration/shopper-configurations/v1/organizations/f_ecom_aaia_prd/configurations?siteId=RefArch 403 114.201 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (f5dbb741-6923-48dc-abc9-9e2787650f18) GET /mobify/proxy/api/configuration/shopper-configurations/v1/organizations/f_ecom_aaia_prd/configurations?siteId=RefArch 403 144.771 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (0feb7ec2-5702-4afb-a628-d13669ab9dc7) GET /mobify/proxy/api/shopper/shopper-context/v1/organizations/f_ecom_aaia_prd/shopper-context/c582a7d3-018f-441d-b23f-5824f1a05409?siteId=RefArch 403 619.074 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (0149a4e0-351e-4f60-ac0c-90eb96f94a47) GET /mobify/proxy/api/shopper/shopper-context/v1/organizations/f_ecom_aaia_prd/shopper-context/c640b6eb-c2c5-47b0-b6d4-a9d3d8dffa14?siteId=RefArch 403 504.187 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (0c7e34f7-7218-446e-838a-9bd96ec97b06) GET /mobify/proxy/api/shopper/shopper-context/v1/organizations/f_ecom_aaia_prd/shopper-context/fd896e1e-eae3-4e7f-99d1-23324fd3ae4a?siteId=RefArch 403 416.914 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (7d64265c-1e6b-4fda-9878-2a5c9a8ece5d) GET /mobify/proxy/api/configuration/shopper-configurations/v1/organizations/f_ecom_aaia_prd/configurations?siteId=RefArch 403 119.576 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (7a701404-0abe-4cab-9fa3-2f427fbe2748) GET /mobify/proxy/api/shopper/shopper-context/v1/organizations/f_ecom_aaia_prd/shopper-context/8d6132f2-dbb0-4244-9c36-c89cd35ec3c5?siteId=RefArch 403 112.841 ms - 161
[2m[WebServer] [22m