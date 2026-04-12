# Feature Specification: Product Quick View

## 1. Overview

Allow shoppers to view product details, select variations (size/color), and add items to their cart directly from the Product Listing Page (PLP) without navigating to the Product Detail Page (PDP). This is implemented using the PWA Kit extensibility override pattern and reuses existing Salesforce Commerce SDK hooks and components.

**Slug:** `product-quick-view`
**App:** `apps/commerce-storefront`
**Type:** Storefront

---

## 2. Architecture & Key Discoveries

### 2.1 Existing Patterns to Reuse (DO NOT REBUILD)

The base template `@salesforce/retail-react-app@9.1.1` already ships patterns that MUST be reused:

| Component / Hook | Import Path | Purpose |
|---|---|---|
| `ProductViewModal` | `@salesforce/retail-react-app/app/components/product-view-modal` | Modal wrapping `ProductView`. Used in Cart/Wishlist to edit items. Receives a `ProductSearchHit`, fetches full product via hook, renders `ProductView`. |
| `useProductViewModal` | `@salesforce/retail-react-app/app/hooks/use-product-view-modal` | Calls `useProduct` from `commerce-sdk-react` with correct `expand` params. Returns `{ product, isFetching }`. |
| `ProductView` | `@salesforce/retail-react-app/app/components/product-view` | Full product detail UI: images, price, variant selectors (color/size), quantity picker, Add to Cart button. Uses `useDerivedProduct` internally for variant/inventory state. Handles cart mutations internally via `useShopperBasketsMutation('addItemToBasket')`. |
| `ProductTile` | `@salesforce/retail-react-app/app/components/product-tile` | Tile with `position: relative` container, absolute-positioned overlays (fav icon top-right, promo badges top-left), product image in `AspectRatio`, swatches, price, name. Entire tile wrapped in a `Link`. |

### 2.2 PWA Kit Override Mechanism

- `ccExtensibility.overridesDir: "overrides"` in `package.json`
- Files placed under `overrides/app/components/<name>/index.jsx` shadow the base template's `app/components/<name>/index.jsx`
- The base component can still be imported explicitly: `import X from '@salesforce/retail-react-app/app/components/<name>'`

### 2.3 ProductTile Internal Structure (from base template)

```
Box (container, position: relative)
├── Link (wraps entire tile)
│   ├── Box (imageWrapper, position: relative)
│   │   ├── AspectRatio (1:1)
│   │   │   └── DynamicImage (responsive SFCC image)
│   │   ├── IconButton (favourite heart, position: absolute, top-right)
│   │   └── BadgeGroup (promo badges, position: absolute, top-left)
│   ├── Text (product name)
│   ├── DisplayPrice
│   └── SwatchGroup (color swatches, if variationAttributes present)
```

### 2.4 ProductView Props Contract

```js
ProductView.propTypes = {
  product: PropTypes.object,              // Full ShopperProduct data (from useProduct)
  category: PropTypes.array,              // Breadcrumb categories (optional for modal)
  isProductLoading: PropTypes.bool,       // Show skeleton loaders
  isBasketLoading: PropTypes.bool,        // Disable Add to Cart while basket mutating
  addToCart: PropTypes.func,              // (products) → Promise — handled internally
  showFullLink: PropTypes.bool,           // Show "View Full Details" link
  imageSize: PropTypes.oneOf(['sm', 'md']), // Image gallery size
  showImageGallery: PropTypes.bool,       // Show image carousel
  // ... many more (see reference file)
}
```

### 2.5 useProductViewModal Hook Contract

```js
// Input: product (ProductSearchHit from search results)
// Optional: controlledVariationValues, queryOptions
const { product, isFetching } = useProductViewModal(searchHitProduct)
// Returns: { product: ShopperProduct (full), isFetching: boolean }
```

---

## 3. Implementation Plan

### 3.1 ProductTile Override — `overrides/app/components/product-tile/index.jsx`

**Action:** CREATE (override of base component)

**Requirements:**
- Import the base `ProductTile` from `@salesforce/retail-react-app/app/components/product-tile`
- Wrap it in a container `Box` with `position="relative"` and `role="group"` (enables Chakra `_groupHover` pseudo)
- Add a "Quick View" `Button` absolutely positioned over the product image area:
  - Position: `bottom="0"`, `left="50%"`, `transform="translateX(-50%)"`, `mb={2}`
  - Visibility: hidden by default → visible on `_groupHover`: `opacity={0}` → `_groupHover={{ opacity: 1 }}` with `transition="opacity 0.2s"`
  - Mobile touch fallback: always visible below `lg` breakpoint: `display={{ base: 'block', lg: 'initial' }}` with `opacity={{ base: 1, lg: 0 }}` and `_groupHover={{ opacity: 1 }}`
  - `aria-label={`Quick View ${product?.productName || product?.name || ''}`}`
  - `data-testid="quick-view-btn"`
  - Visual: `size="sm"`, `colorScheme="blue"`, `variant="solid"`, white text
- `onClick` handler MUST:
  1. Call `e.preventDefault()` — prevent the parent `Link` from navigating to PDP
  2. Call `e.stopPropagation()` — prevent event bubbling to tile click handlers
  3. Call `onOpen()` from Chakra `useDisclosure` to open the modal
- Render `QuickViewModal` at the end of the component tree (outside the Link):
  - `<QuickViewModal product={product} isOpen={isOpen} onClose={onClose} />`

**Corner Cases:**
- **Product sets/bundles:** Hide the Quick View button when `product?.type?.set === true` or `product?.type?.bundle === true`. These product types require specialized modal handling (`BundleProductViewModal`) that is out of scope for v1. The standard `ProductView` does not render well for multi-product types in a small modal.
- **Missing product data:** Guard against `product` being `undefined` or missing `productId`. Do not render the Quick View button if there is no `productId`.
- **Keyboard accessibility:** The button must be focusable via Tab key. Since it's rendered inside a `Link`, ensure `tabIndex={0}` and that `onKeyDown` with Enter/Space also triggers the modal (Chakra `Button` handles this by default).
- **SSR safety:** `useDisclosure` is client-only state. The button renders on the server but the modal only activates client-side. No SSR mismatch risk since the modal renders with `isOpen={false}` initially.
- **Prop passthrough:** All original `ProductTile` props (`product`, `dynamicImageProps`, `enableFavourite`, `isFavourite`, `onFavouriteToggle`, `onClick`, `imageViewType`, `selectableAttributeId`, `badgeDetails`, `isRefreshingData`) MUST be forwarded via spread: `<OriginalProductTile {...props} />`.

### 3.2 QuickViewModal Component — `overrides/app/components/quick-view-modal/index.jsx`

**Action:** CREATE (new component)

**Requirements:**
- Props: `product` (ProductSearchHit), `isOpen` (bool), `onClose` (func)
- Uses `useProductViewModal(product)` from `@salesforce/retail-react-app/app/hooks/use-product-view-modal` to fetch full product data when modal opens
- Uses `useIntl` from `react-intl` for the modal aria-label

**Modal structure:**
```jsx
<Modal size="4xl" isOpen={isOpen} onClose={onClose}>
  <ModalOverlay />
  <ModalContent data-testid="quick-view-modal" aria-label={ariaLabel}>
    <ModalCloseButton />
    <ModalBody pb={8} bg="white" paddingBottom={6} marginTop={6}>
      {isFetching ? (
        <Center py={10}>
          <Spinner size="xl" data-testid="quick-view-spinner" />
        </Center>
      ) : (
        <ProductView
          product={productViewModalData.product}
          isProductLoading={productViewModalData.isFetching}
          showFullLink={true}
          imageSize="sm"
        />
      )}
    </ModalBody>
  </ModalContent>
</Modal>
```

**Corner Cases:**
- **Modal aria-label:** Must include the product name for screen readers. Format: `"Quick view for {productName}"`. Obtain `productName` from the fetched product data or fall back to `product?.productName || product?.name || 'product'`.
- **Fetch error handling:** If `useProductViewModal` returns a product that is `null`/`undefined` after fetching (e.g., product deleted, API error), render a user-friendly message: "This product is no longer available" with a close button — not a blank modal or crash.
- **Modal scroll:** For products with many variants or long descriptions, `ModalBody` may overflow. Chakra's default modal scrolls `ModalBody` — verify this works for tall content. If not, add `overflow="auto"` and `maxHeight="80vh"` to `ModalBody`.
- **Focus trap:** Chakra `Modal` traps focus by default. Verify that Tab cycling stays within the modal and Escape closes it. No extra code needed if Chakra is used correctly.
- **Close on overlay click:** Enable `closeOnOverlayClick={true}` (Chakra default) so clicking outside the modal closes it.
- **Cart success feedback:** `ProductView` internally shows toast notifications on successful add-to-cart via `useToast()`. This works without extra wiring. Verify the toast appears above the modal overlay (z-index).
- **ProductView `showFullLink`:** When `true`, `ProductView` renders a "View Full Details" link to the PDP. This is desirable in Quick View so users can navigate to the full PDP if they want.
- **Lazy rendering:** Only call `useProductViewModal` when the modal is open. The hook should only fire `useProduct` when it receives a product prop. If `isOpen` is `false` and the hook still fires network requests, wrap conditionally or rely on the hook's `enabled` query option (verify behavior).

### 3.3 Unit Tests — `overrides/app/components/quick-view-modal/index.test.js`

**Action:** CREATE

**Test runner:** `npm test` → `pwa-kit-dev test` → Jest
**Mocking convention:** Follow patterns from `@salesforce/retail-react-app/app/pages/cart/index.test.js`

**Mocks required:**

```js
// Mock the useProductViewModal hook
jest.mock('@salesforce/retail-react-app/app/hooks/use-product-view-modal', () => ({
  useProductViewModal: jest.fn()
}))

// Mock ProductView as a simple stub (it has deep dependency chains)
jest.mock('@salesforce/retail-react-app/app/components/product-view', () => {
  const React = require('react')
  return {
    __esModule: true,
    default: (props) => React.createElement('div', { 'data-testid': 'product-view' }, 'ProductView')
  }
})
```

**Test cases:**

| # | Test Name | Setup | Assertion |
|---|---|---|---|
| 1 | renders loading spinner when product is fetching | `useProductViewModal` returns `{ product: null, isFetching: true }` | `screen.getByTestId('quick-view-spinner')` is visible; `screen.queryByTestId('product-view')` is `null` |
| 2 | renders ProductView when product is loaded | `useProductViewModal` returns `{ product: mockProduct, isFetching: false }` | `screen.getByTestId('product-view')` is visible; `screen.queryByTestId('quick-view-spinner')` is `null` |
| 3 | modal has correct data-testid | Render with `isOpen={true}` | `screen.getByTestId('quick-view-modal')` exists |
| 4 | modal has accessible aria-label | Render with product that has `name: 'Test Shoes'` | `ModalContent` has `aria-label` containing "Test Shoes" |
| 5 | does not render modal content when closed | Render with `isOpen={false}` | `screen.queryByTestId('quick-view-modal')` is `null` |
| 6 | calls onClose when close button clicked | Render with `isOpen={true}`, click `ModalCloseButton` | `onClose` mock function called once |

**Additional mocks likely needed** (PWA Kit test environment):
- `react-intl` `IntlProvider` wrapper (or mock `useIntl`)
- Chakra `ChakraProvider` wrapper
- `react-router-dom` `MemoryRouter` wrapper (ProductView may use router hooks)
- `commerce-sdk-react` `CommerceApiProvider` (if not mocked away by ProductView stub)

### 3.4 E2E Tests — `e2e/quick-view.spec.ts`

**Action:** CREATE

**Test runner:** Playwright (`npx playwright test e2e/quick-view.spec.ts`)
**Base URL:** `process.env.STOREFRONT_URL || 'http://localhost:3000'`
**Pattern:** Follow `e2e/storefront-smoke.spec.ts` diagnostic hooks (console error capture, failed request capture, screenshot on failure).

**Test suite: `Quick View`**

#### Test 1: Quick View button appears on hover

```
Steps:
1. Navigate to a category page (try '/category/womens', fall back to clicking first nav link)
2. Wait for product tiles to load: locator('[data-testid="product-tile"], .product-tile, article').first() is visible (timeout: 15s)
3. Hover over the first product tile
4. Assert: '[data-testid="quick-view-btn"]' within the first tile becomes visible (timeout: 5s)
```

**Corner cases to handle:**
- The category URL path may differ per SFCC sandbox configuration. Fall back to navigating via the site's main nav if direct URL fails.
- On slow sandbox instances, product tiles may take 10–15s to render. Use generous timeouts.

#### Test 2: Quick View modal opens and loads product data

```
Steps:
1. Navigate to a category page, wait for tiles
2. Hover first product tile
3. Click '[data-testid="quick-view-btn"]' on the first tile
4. Assert: '[data-testid="quick-view-modal"]' is visible (timeout: 10s)
5. Assert: Loading spinner ('[data-testid="quick-view-spinner"]') appears initially (may be fast — use a soft check or skip if data loads instantly)
6. Wait for spinner to disappear (if it appeared)
7. Assert: Product name is visible inside the modal (h1 or [data-testid="product-name"] within the modal)
8. Assert: At least one variant selector is visible (swatch buttons or select elements)
```

**Corner cases:**
- SFCC sandbox API may be slow (2–5s for useProduct). Use `waitForSelector` with 15s timeout.
- Some products may not have variants (e.g., gift cards). The test should not fail if variant selectors are absent — check with a soft assertion or only assert if elements exist.

#### Test 3: Select variant and add to cart from Quick View

```
Steps:
1. Navigate to category page, open Quick View on first product (reuse steps above)
2. Wait for product data to load in modal
3. If size selector exists: click the first available (non-disabled) size swatch/option
4. If color selector exists: click the first available color swatch (may already be pre-selected)
5. Click the "Add to Cart" button inside the modal
6. Assert one of:
   a. A success toast notification appears (look for role="alert" or Chakra toast container with text containing "added" or "cart")
   b. The mini-cart / cart icon badge quantity increases
   c. An "Added to Cart" confirmation modal/overlay appears (retail-react-app uses AddToCartModal)
7. Assert: No console errors related to the add-to-cart flow
```

**Corner cases:**
- **Out-of-stock variants:** If all variants of the first product are out of stock, the Add to Cart button will be disabled. The test should skip or try the next product tile.
- **Required variant selection:** `ProductView` may disable Add to Cart until all required variants (size + color) are selected. The test must select all required variants before clicking Add to Cart.
- **Guest basket creation:** On first add-to-cart, SCAPI creates a new basket for the guest shopper. This is an additional API call that may take 2–3s. Wait for the toast/confirmation with adequate timeout (10s).
- **SLAS authentication:** The storefront uses SLAS for guest authentication. If the auth token is expired or missing, API calls will fail silently (401). The test should check for `requestfailed` events related to `shopper/auth` and fail fast with a descriptive message.

#### Test 4: Modal closes correctly

```
Steps:
1. Open Quick View modal on first product
2. Click the modal close button (ModalCloseButton, typically an X icon)
3. Assert: Modal is no longer visible
4. Assert: The PLP page is still showing (product tiles still visible)
5. Verify: Page URL has NOT changed (no navigation to PDP occurred)
```

**Corner cases:**
- **Escape key close:** Also test that pressing Escape closes the modal (separate sub-test or combined).
- **Overlay click close:** Clicking outside the modal content (on the overlay) should also close it.

#### Test 5: Quick View does not navigate away from PLP

```
Steps:
1. Record the current URL
2. Open Quick View modal, interact with product (select variant)
3. Close the modal
4. Assert: URL is unchanged (still on the PLP/category page)
5. Assert: Product tiles are still rendered (PLP state preserved)
```

**E2E diagnostic hooks (copy from storefront-smoke.spec.ts):**

```typescript
let consoleErrors: string[] = [];
let failedRequests: string[] = [];

test.beforeEach(async ({ page }) => {
  consoleErrors = [];
  failedRequests = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('requestfailed', (req) => {
    failedRequests.push(`${req.method()} ${req.url()} - ${req.failure()?.errorText}`);
  });
});

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== 'passed') {
    console.log(`\n--- Browser Diagnostics for "${testInfo.title}" ---`);
    if (consoleErrors.length > 0) console.log('Console errors:', consoleErrors);
    if (failedRequests.length > 0) console.log('Failed requests:', failedRequests);
    await page.screenshot({
      path: `test-results/failure-${testInfo.title.replace(/\s+/g, '-')}.png`,
    });
  }
});
```

---

## 4. File Manifest

| Action | Path (relative to `apps/commerce-storefront/`) | Description |
|---|---|---|
| **CREATE** | `overrides/app/components/product-tile/index.jsx` | ProductTile override: wraps base tile, adds Quick View button overlay |
| **CREATE** | `overrides/app/components/quick-view-modal/index.jsx` | QuickViewModal component: Chakra Modal → ProductView with data fetching |
| **CREATE** | `overrides/app/components/quick-view-modal/index.test.js` | Jest unit tests for QuickViewModal |
| **CREATE** | `e2e/quick-view.spec.ts` | Playwright E2E tests for Quick View feature |

**Reference files (DO NOT modify):**

| Path | What to learn from it |
|---|---|
| `node_modules/@salesforce/retail-react-app/app/components/product-view-modal/index.jsx` | Pattern: modal wrapping `ProductView` with `useProductViewModal`. Copy the modal structure. |
| `node_modules/@salesforce/retail-react-app/app/hooks/use-product-view-modal.js` | The hook API: `useProductViewModal(product)` → `{ product, isFetching }` |
| `node_modules/@salesforce/retail-react-app/app/components/product-view/index.jsx` | `ProductView` props contract and internal hook usage |
| `node_modules/@salesforce/retail-react-app/app/components/product-tile/index.jsx` | Base `ProductTile` structure, props, and Chakra theme parts |
| `e2e/storefront-smoke.spec.ts` | E2E test patterns, diagnostic hooks, locator strategies |
| `overrides/app/pages/home/index.jsx` | Existing override example showing import patterns and `commerce-sdk-react` usage |

---

## 5. Verification Checklist

| # | Check | Command / Action |
|---|---|---|
| 1 | Build succeeds (override resolution works) | `cd apps/commerce-storefront && npm run build` |
| 2 | Unit tests pass | `cd apps/commerce-storefront && npm test -- --testPathPattern=quick-view-modal` |
| 3 | E2E tests pass | `cd apps/commerce-storefront && npx playwright test e2e/quick-view.spec.ts` |
| 4 | Quick View button visible on hover | Start dev server → navigate to category page → hover product tile |
| 5 | Modal opens with spinner then loads | Click Quick View → spinner appears → product data loads |
| 6 | Variant selection works | Select size/color swatches inside modal |
| 7 | Add to Cart works | Click Add to Cart → toast notification appears |
| 8 | Modal closes cleanly | Click X / press Escape / click overlay → modal closes, PLP preserved |
| 9 | No PDP navigation | URL unchanged after opening/closing Quick View |
| 10 | Accessibility: keyboard | Tab to Quick View button → Enter opens modal → Tab cycles within modal → Escape closes |
| 11 | Accessibility: screen reader | Modal has `aria-label` with product name, button has `aria-label` |
| 12 | Mobile: button visible | On small viewport, Quick View button always visible (no hover needed) |
| 13 | Sets/bundles excluded | Product set/bundle tiles do NOT show Quick View button |

---

## 6. Architectural Decisions

| Decision | Rationale |
|---|---|
| Reuse `useProductViewModal` hook (not raw `useProduct`) | DRY — same hook used by Cart/Wishlist edit modals. Handles correct `expand` params (`promotions`, `availability`, `images`). |
| Override `ProductTile` via `overrides/` (not theme-only) | Need new DOM element (button) + React state (`useDisclosure`). CSS/theme-only changes cannot add interactive elements. |
| `ProductView` handles cart internally | No external `addToCart` wiring needed. `ProductView` calls `useShopperBasketsMutation('addItemToBasket')` and `useCurrentBasket` internally. Toast notifications also handled internally via `useToast`. |
| Hide Quick View for sets/bundles | `ProductView` in a small modal does not render well for multi-product types. Sets need `setProducts` expansion, bundles need `BundleProductViewModal`. Out of scope for v1. |
| Mobile: always-visible button | Hover-to-reveal doesn't work on touch devices. `opacity: { base: 1, lg: 0 }` with `_groupHover: { opacity: 1 }` ensures the button is always visible on mobile, hover-reveal on desktop. |

---

## 7. Corner Cases Summary

### Implementation Corner Cases

| # | Case | Handling |
|---|---|---|
| 1 | Product sets (`product.type.set === true`) | Do not render Quick View button |
| 2 | Product bundles (`product.type.bundle === true`) | Do not render Quick View button |
| 3 | Missing `productId` on product prop | Do not render Quick View button; guard with `if (!product?.productId) return <OriginalProductTile {...props} />` |
| 4 | Parent `Link` navigation on button click | `e.preventDefault()` + `e.stopPropagation()` on button `onClick` |
| 5 | Product deleted/unavailable after search | Show "Product unavailable" message in modal if fetched product is `null` after `isFetching` completes |
| 6 | Long product descriptions overflowing modal | `ModalBody` scroll with `overflow="auto"`, optionally `maxHeight="80vh"` |
| 7 | Toast z-index behind modal overlay | Chakra toast portals to `document.body` by default — should render above modal. Verify in testing. |
| 8 | SSR hydration mismatch | `useDisclosure` initializes with `isOpen: false` on both server and client. Modal content only rendered when `isOpen=true` (client-only toggle). No mismatch. |
| 9 | Multiple Quick Views opened simultaneously | Only one modal per tile instance. `useDisclosure` is per-tile. Chakra modal blocks interaction with backdrop — only one modal visible at a time. |
| 10 | Rapid open/close causing stale data | `useProductViewModal` refetches on product change. Closing and reopening for same product uses cached data (React Query). |

### Testing Corner Cases

| # | Case | Handling |
|---|---|---|
| 1 | Category URL varies per sandbox | Try direct `/category/womens` first; fall back to clicking first nav link |
| 2 | Slow SFCC sandbox API response | Use 15s timeouts for product tile load, 10s for modal load |
| 3 | Product has no variants (e.g., gift card) | Soft-assert variant selectors; do not fail if absent |
| 4 | All variants out of stock | Check if Add to Cart is disabled; skip add-to-cart assertion or try next product |
| 5 | Guest SLAS token expired | Check for auth-related `requestfailed` events; fail fast with descriptive message |
| 6 | Spinner too fast to catch | Use soft check for spinner (don't fail if it's not caught — fast API response) |
| 7 | AddToCartModal overlay captures success | Check for toast OR AddToCartModal confirmation — retail-react-app may show either |
| 8 | Mock leaking between unit tests | Use `beforeEach` to reset all mock return values; `jest.clearAllMocks()` in `afterEach` |
| 9 | ProductView stub needs providers | Wrap test renders in `ChakraProvider` + `IntlProvider` + `MemoryRouter` |
| 10 | CI vs local server differences | E2E uses `STOREFRONT_URL` env var when set; tests against `localhost:3000` when not set |
