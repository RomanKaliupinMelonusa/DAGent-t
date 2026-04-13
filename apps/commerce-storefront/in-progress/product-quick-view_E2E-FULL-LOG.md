Running 21 tests using 1 worker

[1A[2K[1/21] [chromium] › e2e/product-quick-view.spec.ts:151:9 › Quick View Overlay Bar (PLP) › product tiles on PLP render Quick View buttons





[1A[2K[2/21] [chromium] › e2e/product-quick-view.spec.ts:160:9 › Quick View Overlay Bar (PLP) › Quick View button has accessible aria-label with product name
[1A[2K[3/21] [chromium] › e2e/product-quick-view.spec.ts:172:9 › Quick View Overlay Bar (PLP) › Quick View button contains "Quick View" text
[1A[2K[4/21] [chromium] › e2e/product-quick-view.spec.ts:183:9 › Quick View Overlay Bar (PLP) › clicking Quick View does NOT navigate away from PLP
[1A[2K[5/21] [chromium] › e2e/product-quick-view.spec.ts:205:9 › Quick View Modal › clicking Quick View button opens the modal with spinner or content
[1A[2K[6/21] [chromium] › e2e/product-quick-view.spec.ts:218:9 › Quick View Modal › modal displays a loading spinner before content loads
[1A[2K[7/21] [chromium] › e2e/product-quick-view.spec.ts:243:9 › Quick View Modal › modal has data-testid="quick-view-modal"


[1A[2K[chromium] › e2e/product-quick-view.spec.ts:243:9 › Quick View Modal › modal has data-testid="quick-view-modal"

--- Browser Diagnostics for "modal has data-testid="quick-view-modal"" ---

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
  [32m'GET http://localhost:3000/callback?usid=5648ec63-1c61-4fc6-8320-ffd19368b667&code=dwtgLaAkTr03WwJbEQRwuImHRuBe13fGHCHcQihP7B0 - net::ERR_ABORTED'[39m,
  [32m'POST https://g82wgnrvm-ywk9dggrrw8mtggy.pc-rnd.c360a.salesforce.com/web/events/7ae070a6-f4ec-4def-a383-d9cacc3f20a1/ - net::ERR_NAME_NOT_RESOLVED'[39m
]

[1A[2K  1) [chromium] › e2e/product-quick-view.spec.ts:243:9 › Quick View Modal › modal has data-testid="quick-view-modal" 

    Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoBeVisible[2m([22m[2m)[22m failed

    Locator: locator('[data-testid="quick-view-modal"]')
    Expected: visible
    Timeout: 5000ms
    Error: element(s) not found

    Call log:
    [2m  - Expect "toBeVisible" with timeout 5000ms[22m
    [2m  - waiting for locator('[data-testid="quick-view-modal"]')[22m


      251 |         const modal = page.locator('[data-testid="quick-view-modal"]')
      252 |         await modal.waitFor({state: 'visible', timeout: 15_000})
    > 253 |         await expect(modal).toBeVisible()
          |                             ^
      254 |     })
      255 |
      256 |     test('modal has accessible aria-label containing product name', async ({page}) => {
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:253:29

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Quick-V-60172-ta-testid-quick-view-modal--chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/product-quick-view-Quick-V-60172-ta-testid-quick-view-modal--chromium/error-context.md


[1A[2K[8/21] [chromium] › e2e/product-quick-view.spec.ts:256:9 › Quick View Modal › modal has accessible aria-label containing product name
[1A[2K[9/21] [chromium] › e2e/product-quick-view.spec.ts:273:9 › Quick View Modal › modal can be closed via the close button


[1A[2K[chromium] › e2e/product-quick-view.spec.ts:273:9 › Quick View Modal › modal can be closed via the close button

--- Browser Diagnostics for "modal can be closed via the close button" ---

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
  [32m'GET http://localhost:3000/callback?usid=e1d891f5-9979-44da-b247-8f093b9fe657&code=Q3qh_IF2n15xulu4G1youY0uygP4FAGFw2SZcQK6p8c - net::ERR_ABORTED'[39m,
  [32m'POST https://g82wgnrvm-ywk9dggrrw8mtggy.pc-rnd.c360a.salesforce.com/web/events/7ae070a6-f4ec-4def-a383-d9cacc3f20a1/ - net::ERR_NAME_NOT_RESOLVED'[39m
]

[1A[2K  2) [chromium] › e2e/product-quick-view.spec.ts:273:9 › Quick View Modal › modal can be closed via the close button 

    [31mTest timeout of 60000ms exceeded.[39m

    Error: locator.click: Test timeout of 60000ms exceeded.
    Call log:
    [2m  - waiting for locator('[aria-label="Close"]').first()[22m
    [2m    - locator resolved to <button type="button" aria-label="Close" data-focus-visible-added="" class="chakra-modal__close-btn css-1ik4h6n focus-visible">…</button>[22m
    [2m  - attempting click action[22m
    [2m    2 × waiting for element to be visible, enabled and stable[22m
    [2m      - element is not stable[22m
    [2m    - retrying click action[22m
    [2m    - waiting 20ms[22m
    [2m    - waiting for element to be visible, enabled and stable[22m
    [2m    - element is not stable[22m
    [2m  - retrying click action[22m
    [2m    - waiting 100ms[22m
    [2m    - waiting for element to be visible, enabled and stable[22m
    [2m  - element was detached from the DOM, retrying[22m


      285 |         const closeBtn = page.locator('[aria-label="Close"]').first()
      286 |         await closeBtn.waitFor({state: 'visible', timeout: 5_000})
    > 287 |         await closeBtn.click()
          |                        ^
      288 |
      289 |         // Modal should disappear
      290 |         await expect(modal).not.toBeVisible({timeout: 5_000})
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:287:24

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Quick-V-5c6b4-closed-via-the-close-button-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/product-quick-view-Quick-V-5c6b4-closed-via-the-close-button-chromium/error-context.md


[1A[2K[10/21] [chromium] › e2e/product-quick-view.spec.ts:293:9 › Quick View Modal › modal can be closed via Escape key
[1A[2K[11/21] [chromium] › e2e/product-quick-view.spec.ts:341:9 › Quick View Modal Content › modal displays product name


[1A[2K[chromium] › e2e/product-quick-view.spec.ts:341:9 › Quick View Modal Content › modal displays product name

--- Browser Diagnostics for "modal displays product name" ---

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
  [32m'GET http://localhost:3000/callback?usid=efc052d8-8864-4349-9827-1ca09114e228&code=1hHs46BBQjK4euPl5fCVGTkSxu2WrSxUBYp4__fotoY - net::ERR_ABORTED'[39m,
  [32m'POST https://g82wgnrvm-ywk9dggrrw8mtggy.pc-rnd.c360a.salesforce.com/web/events/7ae070a6-f4ec-4def-a383-d9cacc3f20a1/ - net::ERR_NAME_NOT_RESOLVED'[39m
]

[1A[2K  3) [chromium] › e2e/product-quick-view.spec.ts:341:9 › Quick View Modal Content › modal displays product name 

    TimeoutError: locator.waitFor: Timeout 10000ms exceeded.
    Call log:
    [2m  - waiting for locator('[data-testid="quick-view-modal"]').locator('h1, h2, [data-testid="product-name"]').first() to be visible[22m


      346 |         // ProductView renders product name as a heading
      347 |         const productName = modal.locator('h1, h2, [data-testid="product-name"]').first()
    > 348 |         await productName.waitFor({state: 'visible', timeout: 10_000})
          |                           ^
      349 |         const text = await productName.textContent()
      350 |         expect(text?.trim().length).toBeGreaterThan(0)
      351 |     })
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:348:27

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Quick-V-96986-modal-displays-product-name-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/product-quick-view-Quick-V-96986-modal-displays-product-name-chromium/error-context.md


[1A[2K[12/21] [chromium] › e2e/product-quick-view.spec.ts:353:9 › Quick View Modal Content › modal displays product price
[1A[2K[chromium] › e2e/product-quick-view.spec.ts:353:9 › Quick View Modal Content › modal displays product price

--- Browser Diagnostics for "modal displays product price" ---

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
    [32m'React will try to recreate this component tree from scratch using the error boundary you provided, AppErrorBoundary.'[39m
]

[1A[2KFailed requests: [
  [32m'GET http://localhost:3000/callback?usid=190a2719-da02-42d2-addb-57b97cf146a9&code=ntGvkwXO0GQSFy3SMPXAxDWP4U7ijISQH_cQdwty5E8 - net::ERR_ABORTED'[39m,
  [32m'POST https://g82wgnrvm-ywk9dggrrw8mtggy.pc-rnd.c360a.salesforce.com/web/events/7ae070a6-f4ec-4def-a383-d9cacc3f20a1/ - net::ERR_NAME_NOT_RESOLVED'[39m
]

[1A[2K  4) [chromium] › e2e/product-quick-view.spec.ts:353:9 › Quick View Modal Content › modal displays product price 

    Error: PWA Kit crash page detected after opening Quick View modal. Stack: no stack

      140 |             .textContent()
      141 |             .catch(() => 'no stack')
    > 142 |         throw new Error(`PWA Kit crash page detected after opening Quick View modal. Stack: ${stack}`)
          |               ^
      143 |     }
      144 |
      145 |     return winner
        at assertModalOutcome (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:142:15)
        at openQuickViewAndWaitForContent (/workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:327:25)
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:354:9

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Quick-V-ef85e-odal-displays-product-price-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/product-quick-view-Quick-V-ef85e-odal-displays-product-price-chromium/error-context.md


[1A[2K[13/21] [chromium] › e2e/product-quick-view.spec.ts:367:9 › Quick View Modal Content › modal displays Add to Cart button


[1A[2K[chromium] › e2e/product-quick-view.spec.ts:367:9 › Quick View Modal Content › modal displays Add to Cart button

--- Browser Diagnostics for "modal displays Add to Cart button" ---

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
  [32m'GET http://localhost:3000/callback?usid=7b23603c-7991-4164-b63b-133f81676b64&code=IxmpevLtjP6GHeiCCFdRWJ0HBtwsCx3sWcBZtcZdE7c - net::ERR_ABORTED'[39m,
  [32m'POST https://g82wgnrvm-ywk9dggrrw8mtggy.pc-rnd.c360a.salesforce.com/web/events/7ae070a6-f4ec-4def-a383-d9cacc3f20a1/ - net::ERR_NAME_NOT_RESOLVED'[39m
]

[1A[2K  5) [chromium] › e2e/product-quick-view.spec.ts:367:9 › Quick View Modal Content › modal displays Add to Cart button 

    TimeoutError: locator.waitFor: Timeout 10000ms exceeded.
    Call log:
    [2m  - waiting for locator('[data-testid="quick-view-modal"]').getByRole('button', { name: /add to cart/i }) to be visible[22m


      372 |         // ProductView renders an "Add to Cart" button
      373 |         const addToCartBtn = modal.getByRole('button', {name: /add to cart/i})
    > 374 |         await addToCartBtn.waitFor({state: 'visible', timeout: 10_000})
          |                            ^
      375 |         await expect(addToCartBtn).toBeVisible()
      376 |     })
      377 |
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:374:28

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Quick-V-f3d4d-displays-Add-to-Cart-button-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/product-quick-view-Quick-V-f3d4d-displays-Add-to-Cart-button-chromium/error-context.md


[1A[2K[14/21] [chromium] › e2e/product-quick-view.spec.ts:378:9 › Quick View Modal Content › modal displays "View Full Details" link to PDP


[1A[2K[chromium] › e2e/product-quick-view.spec.ts:378:9 › Quick View Modal Content › modal displays "View Full Details" link to PDP

--- Browser Diagnostics for "modal displays "View Full Details" link to PDP" ---

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
  [32m'GET http://localhost:3000/callback?usid=a8008b15-ecc2-45b4-883a-f76cd6d865b6&code=zUqPmqgreYFwqBC3_XRNaELpgE0na7PeHN2I9ZqIClY - net::ERR_ABORTED'[39m,
  [32m'POST https://g82wgnrvm-ywk9dggrrw8mtggy.pc-rnd.c360a.salesforce.com/web/events/7ae070a6-f4ec-4def-a383-d9cacc3f20a1/ - net::ERR_NAME_NOT_RESOLVED'[39m
]

[1A[2K  6) [chromium] › e2e/product-quick-view.spec.ts:378:9 › Quick View Modal Content › modal displays "View Full Details" link to PDP 

    TimeoutError: locator.waitFor: Timeout 10000ms exceeded.
    Call log:
    [2m  - waiting for locator('[data-testid="quick-view-modal"]').getByRole('link', { name: /full detail/i }).or(locator('[data-testid="quick-view-modal"]').locator('a[href*="/product/"]')).first() to be visible[22m


      387 |         await fullDetailsLink
      388 |             .first()
    > 389 |             .waitFor({state: 'visible', timeout: 10_000})
          |              ^
      390 |         await expect(fullDetailsLink.first()).toBeVisible()
      391 |     })
      392 |
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:389:14

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Quick-V-2c7ad-ew-Full-Details-link-to-PDP-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/product-quick-view-Quick-V-2c7ad-ew-Full-Details-link-to-PDP-chromium/error-context.md


[1A[2K[15/21] [chromium] › e2e/product-quick-view.spec.ts:393:9 › Quick View Modal Content › modal renders product image


[1A[2K[chromium] › e2e/product-quick-view.spec.ts:393:9 › Quick View Modal Content › modal renders product image

--- Browser Diagnostics for "modal renders product image" ---

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
  [32m'GET http://localhost:3000/callback?usid=054f793d-0bd7-4f41-9675-17f4d338bae1&code=eFE26I7xPS55Lc4SqpKE6wu2nqB23d5I1g34dG5kPlw - net::ERR_ABORTED'[39m,
  [32m'POST https://g82wgnrvm-ywk9dggrrw8mtggy.pc-rnd.c360a.salesforce.com/web/events/7ae070a6-f4ec-4def-a383-d9cacc3f20a1/ - net::ERR_NAME_NOT_RESOLVED'[39m
]

[1A[2K  7) [chromium] › e2e/product-quick-view.spec.ts:393:9 › Quick View Modal Content › modal renders product image 

    TimeoutError: locator.waitFor: Timeout 10000ms exceeded.
    Call log:
    [2m  - waiting for locator('[data-testid="quick-view-modal"]').locator('img[src*="dw.demandware"], img[src*="edge"], img[alt]').first() to be visible[22m


      398 |         // ProductView renders at least one product image
      399 |         const image = modal.locator('img[src*="dw.demandware"], img[src*="edge"], img[alt]').first()
    > 400 |         await image.waitFor({state: 'visible', timeout: 10_000})
          |                     ^
      401 |         await expect(image).toBeVisible()
      402 |     })
      403 | })
        at /workspaces/DAGent-t/apps/commerce-storefront/e2e/product-quick-view.spec.ts:400:21

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/product-quick-view-Quick-V-c7dd9-modal-renders-product-image-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/product-quick-view-Quick-V-c7dd9-modal-renders-product-image-chromium/error-context.md


[1A[2K[16/21] [chromium] › e2e/product-quick-view.spec.ts:408:9 › Quick View Edge Cases › opening and closing modal preserves PLP URL
[1A[2K[17/21] [chromium] › e2e/product-quick-view.spec.ts:429:9 › Quick View Edge Cases › multiple Quick View buttons exist for multiple products
[1A[2K[18/21] [chromium] › e2e/product-quick-view.spec.ts:440:9 › Quick View Edge Cases › can open Quick View for different products sequentially


[1A[2K[19/21] [chromium] › e2e/storefront-smoke.spec.ts:52:7 › Storefront Smoke Tests › homepage loads and renders
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


[1A[2K[20/21] [chromium] › e2e/storefront-smoke.spec.ts:59:7 › Storefront Smoke Tests › can navigate to a category/PLP page








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
  [32m'Failed to load resource: net::ERR_NAME_NOT_RESOLVED'[39m,
  [32m'retail-react-app.use-datacloud._handleApiError ERROR [DataCloudApi] Error sending Data Cloud event {}'[39m
]

[1A[2KFailed requests: [
  [32m'GET http://localhost:3000/callback?usid=2fee73fc-c2db-4e87-bd1c-aed39bc06f1a&code=RsoSsL-c2gFJ4AuK2MS3zke22UzMXO-6_SiwMlVCO7g - net::ERR_ABORTED'[39m,
  [32m'GET http://localhost:3000/callback?usid=f7e5e5ce-969f-4e32-88cf-85c4131b6e39&code=2cIcJ-AbzgEhzoWisv0GfgLsEU4g4HhdzG8M0gkCqr8 - net::ERR_ABORTED'[39m,
  [32m'GET http://localhost:3000/callback?usid=5cb2d81c-679c-4638-be6c-bd2f4b548355&code=dQCNpqJIaeeFlL8E4uNUU3GuzN_6pWlnhcjChO21t8M - net::ERR_ABORTED'[39m,
  [32m'POST https://g82wgnrvm-ywk9dggrrw8mtggy.pc-rnd.c360a.salesforce.com/web/events/7ae070a6-f4ec-4def-a383-d9cacc3f20a1/ - net::ERR_NAME_NOT_RESOLVED'[39m
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


[1A[2K[21/21] [chromium] › e2e/storefront-smoke.spec.ts:71:7 › Storefront Smoke Tests › product detail page shows product info
[1A[2K  9 failed
    [chromium] › e2e/product-quick-view.spec.ts:243:9 › Quick View Modal › modal has data-testid="quick-view-modal" 
    [chromium] › e2e/product-quick-view.spec.ts:273:9 › Quick View Modal › modal can be closed via the close button 
    [chromium] › e2e/product-quick-view.spec.ts:341:9 › Quick View Modal Content › modal displays product name 
    [chromium] › e2e/product-quick-view.spec.ts:353:9 › Quick View Modal Content › modal displays product price 
    [chromium] › e2e/product-quick-view.spec.ts:367:9 › Quick View Modal Content › modal displays Add to Cart button 
    [chromium] › e2e/product-quick-view.spec.ts:378:9 › Quick View Modal Content › modal displays "View Full Details" link to PDP 
    [chromium] › e2e/product-quick-view.spec.ts:393:9 › Quick View Modal Content › modal renders product image 
    [chromium] › e2e/storefront-smoke.spec.ts:52:7 › Storefront Smoke Tests › homepage loads and renders 
    [chromium] › e2e/storefront-smoke.spec.ts:59:7 › Storefront Smoke Tests › can navigate to a category/PLP page 
  12 passed (4.3m)
[1A[2K[2m[WebServer] [22m(node:86934) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
[2m[WebServer] [22m(Use `node --trace-deprecation ...` to show where the warning was created)
[1A[2K[2m[WebServer] [22m(node:86991) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
[2m[WebServer] [22m(Use `node --trace-deprecation ...` to show where the warning was created)
[1A[2K[2m[WebServer] [22m(node:86991) [DEP0060] DeprecationWarning: The `util._extend` API is deprecated. Please use Object.assign() instead.
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
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (56449df1-09d1-41a9-9887-536649d08b84) GET /mobify/proxy/api/configuration/shopper-configurations/v1/organizations/f_ecom_aaia_prd/configurations?siteId=RefArch 403 114.465 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (ebd01647-261f-4be7-a2dd-d73bd45a884d) GET /mobify/proxy/api/shopper/shopper-context/v1/organizations/f_ecom_aaia_prd/shopper-context/5648ec63-1c61-4fc6-8320-ffd19368b667?siteId=RefArch 403 113.416 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (90a0d162-b13c-4243-8bf2-eb3f43ab6ca0) GET /mobify/proxy/api/shopper/shopper-context/v1/organizations/f_ecom_aaia_prd/shopper-context/e1d891f5-9979-44da-b247-8f093b9fe657?siteId=RefArch 403 151.302 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (ffb2af77-ff1a-48e1-990e-f974dcac34d3) GET /mobify/proxy/api/configuration/shopper-configurations/v1/organizations/f_ecom_aaia_prd/configurations?siteId=RefArch 403 489.503 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (06693964-6879-425b-b7dd-22de08cdb6d0) GET /mobify/proxy/api/shopper/shopper-context/v1/organizations/f_ecom_aaia_prd/shopper-context/efc052d8-8864-4349-9827-1ca09114e228?siteId=RefArch 403 134.671 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (9a2260fe-0dab-47a0-99a7-d66b32424981) GET /mobify/proxy/api/configuration/shopper-configurations/v1/organizations/f_ecom_aaia_prd/configurations?siteId=RefArch 403 474.442 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (b2f9ba93-365f-406f-8b24-d958c4074b5f) GET /mobify/proxy/api/shopper/shopper-context/v1/organizations/f_ecom_aaia_prd/shopper-context/7b23603c-7991-4164-b63b-133f81676b64?siteId=RefArch 403 174.522 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (325ff037-0fe5-484f-b62f-54d4c1aee2c2) GET /mobify/proxy/api/configuration/shopper-configurations/v1/organizations/f_ecom_aaia_prd/configurations?siteId=RefArch 403 512.408 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (026fc2f3-dbd6-46fa-8938-f501fc8c72f7) GET /mobify/proxy/api/configuration/shopper-configurations/v1/organizations/f_ecom_aaia_prd/configurations?siteId=RefArch 403 145.141 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (b4d77ab7-7f9f-467e-ac8d-6527ee59390b) GET /mobify/proxy/api/shopper/shopper-context/v1/organizations/f_ecom_aaia_prd/shopper-context/a8008b15-ecc2-45b4-883a-f76cd6d865b6?siteId=RefArch 403 169.058 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (95d715db-0b00-4c84-b805-ee956021898b) GET /mobify/proxy/api/configuration/shopper-configurations/v1/organizations/f_ecom_aaia_prd/configurations?siteId=RefArch 403 149.311 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (fdd1a978-eff7-4df0-aabd-3b629f3199ec) GET /mobify/proxy/api/shopper/shopper-context/v1/organizations/f_ecom_aaia_prd/shopper-context/054f793d-0bd7-4f41-9675-17f4d338bae1?siteId=RefArch 403 157.358 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (3a92e9f6-fe5f-4ed7-a048-a6225c8fd25d) GET /mobify/proxy/api/configuration/shopper-configurations/v1/organizations/f_ecom_aaia_prd/configurations?siteId=RefArch 403 560.263 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (1287d584-f834-484d-b9e9-9b7598e338c0) GET /mobify/proxy/api/shopper/shopper-context/v1/organizations/f_ecom_aaia_prd/shopper-context/27390d51-4c04-47a5-bed4-3d7e1191b161?siteId=RefArch 403 357.233 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (0045bbc4-2357-4c63-b127-47752ec5a706) GET /mobify/proxy/api/configuration/shopper-configurations/v1/organizations/f_ecom_aaia_prd/configurations?siteId=RefArch 403 168.547 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (937e5a27-ee51-4b5f-bbfb-3f7c15d9944d) GET /mobify/proxy/api/customer/shopper-customers/v1/organizations/f_ecom_aaia_prd/customers/abkKxJxrAXxKkRwXhIwGYYxrE1/baskets?siteId=RefArch 400 344.741 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (1bc4c957-2243-4c98-bd9d-8c0e9e44a667) GET /mobify/proxy/api/customer/shopper-customers/v1/organizations/f_ecom_aaia_prd/customers/abxHBJlusZw0sRmrw3xGYYxrkW/baskets?siteId=RefArch 400 354.651 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (80b88c4b-49f8-4454-b215-6f5f59dae937) GET /mobify/proxy/api/customer/shopper-customers/v1/organizations/f_ecom_aaia_prd/customers/abkKxJxrAXxKkRwXhIwGYYxrE1/product-lists?siteId=RefArch 400 362.662 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (2f5c3395-4bf9-4961-b366-82eae5dc42c4) GET /mobify/proxy/api/shopper/shopper-context/v1/organizations/f_ecom_aaia_prd/shopper-context/2fee73fc-c2db-4e87-bd1c-aed39bc06f1a?siteId=RefArch 403 532.292 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (47483d67-5437-4937-ac16-3bffe3d2d50f) GET /mobify/proxy/api/shopper/shopper-context/v1/organizations/f_ecom_aaia_prd/shopper-context/f7e5e5ce-969f-4e32-88cf-85c4131b6e39?siteId=RefArch 403 163.293 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (5d129041-5216-477e-b919-6fff0c649eed) GET /mobify/proxy/api/shopper/shopper-context/v1/organizations/f_ecom_aaia_prd/shopper-context/5cb2d81c-679c-4638-be6c-bd2f4b548355?siteId=RefArch 403 153.626 ms - 161
[2m[WebServer] [22m
[1A[2K[2m[WebServer] [22mpwa-kit-runtime.httprequest ERROR (88a4face-afec-4f7b-8f4d-03f7e3949099) GET /mobify/proxy/api/customer/shopper-customers/v1/organizations/f_ecom_aaia_prd/customers/abxHBJlusZw0sRmrw3xGYYxrkW/product-lists?siteId=RefArch 400 1063.088 ms - 161
[2m[WebServer] [22m