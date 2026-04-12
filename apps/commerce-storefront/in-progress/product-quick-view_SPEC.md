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

## 3. UI/UX Design

### 3.1 Quick View Trigger — Product Tile Overlay Bar

The Quick View trigger is a **full-width semi-transparent dark overlay bar** anchored to the bottom of the product image area. This design follows the reference mockup:

```
┌────────────────────────────────┐
│ [New]                          │  ← Badge (top-left, existing)
│                                │
│         (product image)        │
│                                │
│                                │
├────────────────────────────────┤
│ ● Quick View                   │  ← Overlay bar (bottom of image)
├────────────────────────────────┤
│ Jewellery                      │
│ ENGAGEMENT RINGS               │
│ $99.00                         │
└────────────────────────────────┘
```

**Visual Specifications:**

| Property | Value | Rationale |
|---|---|---|
| **Width** | `100%` of the image container | Full-bleed bar, not a floating button — larger click target, cleaner visual |
| **Height** | Auto, padded `py={2}` (~36px) | Comfortable tap target without obscuring too much of the image |
| **Background** | `rgba(0, 0, 0, 0.6)` | Semi-transparent dark overlay — product image remains partially visible underneath |
| **Backdrop filter** | `blur(2px)` | Subtle frosted glass effect for depth (graceful degradation — falls back to solid overlay on unsupported browsers) |
| **Text color** | `white` | High contrast against dark overlay (WCAG AA 4.5:1 minimum) |
| **Font size** | `sm` (14px) | Consistent with tile metadata text sizing |
| **Font weight** | `semibold` (600) | Distinct from regular body text, signals interactivity |
| **Icon** | `ViewIcon` from `@chakra-ui/icons` (eye icon) | Visual affordance — "view" semantics. Placed left of text with `mr={2}` spacing |
| **Position** | `absolute`, `bottom="0"`, `left="0"`, `right="0"` | Anchored to bottom edge of the image wrapper `Box` |
| **Border radius** | `0` (none) | Flush with image edges — no gap between bar and image boundary |
| **Cursor** | `pointer` | Standard interactive element affordance |
| **Z-index** | `1` | Above the product image, below the favourite heart icon (`z-index: 2`) and badge group |

**Hover/Reveal Behavior:**

| Viewport | Default State | Hover State | Rationale |
|---|---|---|---|
| **Desktop** (`lg` and above) | Hidden: `opacity: 0`, `transform: translateY(100%)` | Visible: `opacity: 1`, `transform: translateY(0)` | Slide-up reveal on hover — elegant entrance without covering image at rest |
| **Mobile/Tablet** (below `lg`) | Always visible: `opacity: 1`, `transform: translateY(0)` | N/A (no hover on touch) | Touch devices lack hover — bar must always be accessible |
| **Transition** | `transition: "all 0.25s ease-in-out"` | — | Smooth 250ms animation for slide + fade. `ease-in-out` for natural feel |
| **Overflow** | Image wrapper: `overflow: "hidden"` | — | Hides the bar below the image edge when `translateY(100%)` — clean slide-in from bottom |

**Interaction States:**

| State | Visual Change |
|---|---|
| **Resting (desktop)** | Bar hidden below image edge |
| **Hover (desktop)** | Bar slides up into view with fade-in |
| **Focus (keyboard Tab)** | Bar becomes visible (same as hover) + `outline: 2px solid` focus ring on the bar/button for accessibility |
| **Active (click/tap)** | `background: rgba(0, 0, 0, 0.75)` — slightly darker feedback on press |
| **Disabled (sets/bundles)** | Bar not rendered at all — no visual hint for unsupported product types |

### 3.2 Quick View Modal — Layout & UX

When the shopper clicks the overlay bar, a **centered modal** opens over the PLP without navigating away:

```
┌─────────────────────────────────────────────────────┐
│                                              [X]    │  ← ModalCloseButton (top-right)
│  ┌──────────────┐   Product Name (h2)               │
│  │              │   ────────────────                │
│  │   Product    │   Price: $99.00                   │
│  │   Image      │                                   │
│  │   Gallery    │   Color: ● ● ● ●  (swatches)     │
│  │   (sm)       │   Size:  [S] [M] [L] [XL]        │
│  │              │   Qty:   [1] [+] [-]              │
│  │              │                                   │
│  └──────────────┘   [   Add to Cart   ]             │
│                                                     │
│                     View Full Details →              │  ← Link to PDP
└─────────────────────────────────────────────────────┘
```

**Modal UX Details:**

| Element | Behavior | Test ID |
|---|---|---|
| **Loading state** | Centered `Spinner` (size `xl`) while `useProductViewModal` fetches full product data. Replaces entire modal body. | `quick-view-spinner` |
| **Error state** | "This product is no longer available" message with icon + close button if product fetch returns `null` | `quick-view-error` |
| **Image gallery** | `imageSize="sm"` — compact gallery suitable for modal width. Supports swipe on mobile via `ProductView` internals. | (within `product-view`) |
| **Variant selectors** | Color swatches (circle buttons with color fill) + size selector (button group or dropdown). Rendered by `ProductView` using `useDerivedProduct`. Selecting a variant updates the image gallery and price dynamically. | `product-view` child elements |
| **Quantity picker** | Increment/decrement stepper with numeric input. Bounded by inventory `orderable` quantity. Rendered by `ProductView`. | (within `product-view`) |
| **Add to Cart button** | Full-width primary button. Disabled until all required variants are selected. Shows loading spinner during basket mutation. On success, triggers a Chakra toast notification ("Item added to cart"). | (within `product-view`) |
| **"View Full Details" link** | Text link below the add-to-cart area. Navigates to the PDP (`/product/{productId}`). Enabled via `showFullLink={true}` prop. | (within `product-view`) |
| **Close mechanisms** | (1) Click `X` button, (2) Press `Escape` key, (3) Click overlay backdrop. All close the modal and return focus to the Quick View trigger bar. | — |
| **Scroll behavior** | `ModalBody` scrolls vertically for products with many variants. `overflow="auto"`, `maxHeight="80vh"`. The overlay and close button remain fixed. | — |
| **Focus management** | Chakra `Modal` traps focus inside the modal. On open, focus moves to the first interactive element. On close, focus returns to the trigger element. | — |

**Responsive Modal Sizing:**

| Viewport | Modal `size` | Layout |
|---|---|---|
| Desktop (`lg`+) | `4xl` (~896px) | Side-by-side: image left, details right (2-column `ProductView` layout) |
| Tablet (`md`) | `4xl` (fills most of screen) | Stacked: image top, details below (single column) |
| Mobile (`base`) | `full` or near-full | Full-screen modal experience. Close button prominent. Touch-optimized tap targets. |

---

## 4. Implementation Plan

### 4.1 ProductTile Override — `overrides/app/components/product-tile/index.jsx`

**Action:** CREATE (override of base component)

**Requirements:**
- Import the base `ProductTile` from `@salesforce/retail-react-app/app/components/product-tile`
- Import `ViewIcon` from `@chakra-ui/icons` for the eye icon
- Wrap it in a container `Box` with `position="relative"` and `role="group"` (enables Chakra `_groupHover` pseudo)
- The image wrapper `Box` MUST have `overflow="hidden"` to clip the bar when it slides below the image edge
- Add a Quick View **overlay bar** (not a small button) absolutely positioned at the bottom of the image area:

**Overlay bar Chakra props (matching UI/UX spec section 3.1):**
```jsx
<Box
  as="button"
  data-testid="quick-view-btn"
  aria-label={`Quick View ${product?.productName || product?.name || ''}`}
  position="absolute"
  bottom="0"
  left="0"
  right="0"
  display="flex"
  alignItems="center"
  justifyContent="center"
  py={2}
  bg="rgba(0, 0, 0, 0.6)"
  backdropFilter="blur(2px)"
  color="white"
  fontSize="sm"
  fontWeight="semibold"
  cursor="pointer"
  zIndex={1}
  opacity={{ base: 1, lg: 0 }}
  transform={{ base: 'translateY(0)', lg: 'translateY(100%)' }}
  _groupHover={{ opacity: 1, transform: 'translateY(0)' }}
  _focus={{ opacity: 1, transform: 'translateY(0)', outline: '2px solid', outlineColor: 'blue.300' }}
  _active={{ bg: 'rgba(0, 0, 0, 0.75)' }}
  transition="all 0.25s ease-in-out"
  onClick={handleQuickView}
>
  <ViewIcon mr={2} />
  Quick View
</Box>
```

- `handleQuickView` handler MUST:
  1. Call `e.preventDefault()` — prevent the parent `Link` from navigating to PDP
  2. Call `e.stopPropagation()` — prevent event bubbling to tile click handlers
  3. Call `onOpen()` from Chakra `useDisclosure` to open the modal
- Render `QuickViewModal` at the end of the component tree (outside the Link):
  - `<QuickViewModal product={product} isOpen={isOpen} onClose={onClose} />`

**Corner Cases:**
- **Product sets/bundles:** Hide the Quick View bar when `product?.type?.set === true` or `product?.type?.bundle === true`. These product types require specialized modal handling (`BundleProductViewModal`) that is out of scope for v1. The standard `ProductView` does not render well for multi-product types in a small modal.
- **Missing product data:** Guard against `product` being `undefined` or missing `productId`. Do not render the Quick View bar if there is no `productId`.
- **Keyboard accessibility:** The `Box as="button"` renders a semantic `<button>` element, making it focusable via Tab. The `_focus` pseudo reveals the bar even without hover (critical for keyboard-only users). Enter/Space triggers the `onClick` handler natively.
- **SSR safety:** `useDisclosure` initializes with `isOpen: false` on both server and client. The bar renders on the server with `opacity: 0` / `translateY(100%)` on desktop. No SSR mismatch.
- **Prop passthrough:** All original `ProductTile` props (`product`, `dynamicImageProps`, `enableFavourite`, `isFavourite`, `onFavouriteToggle`, `onClick`, `imageViewType`, `selectableAttributeId`, `badgeDetails`, `isRefreshingData`) MUST be forwarded via spread: `<OriginalProductTile {...props} />`.
- **Overlay bar click area:** The full-width bar provides a larger click/tap target than a small centered button — improves usability on both desktop and mobile (Fitts's Law).

### 4.2 QuickViewModal Component — `overrides/app/components/quick-view-modal/index.jsx`

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

### 4.3 Unit Tests

Two test files are required — one for the QuickViewModal component and one for the ProductTile override — to ensure all components rendered inside the modal and the overlay bar trigger are fully covered.

**Test runner:** `npm test` → `pwa-kit-dev test` → Jest
**Mocking convention:** Follow patterns from `@salesforce/retail-react-app/app/pages/cart/index.test.js`
**Test utility:** Use `renderWithProviders` from `@salesforce/retail-react-app/app/utils/test-utils` (wraps in `ChakraProvider` + `IntlProvider` + `BrowserRouter` + mocked `CommerceApiProvider`)

---

#### 4.3.1 QuickViewModal Tests — `overrides/app/components/quick-view-modal/index.test.js`

**Action:** CREATE

**Mocks required:**

```js
// Mock the useProductViewModal hook
jest.mock('@salesforce/retail-react-app/app/hooks/use-product-view-modal', () => ({
  useProductViewModal: jest.fn()
}))

// For integration-level tests: use real ProductView (no mock)
// For isolated modal tests: stub ProductView to avoid deep dependency chains
jest.mock('@salesforce/retail-react-app/app/components/product-view', () => {
  const React = require('react')
  return {
    __esModule: true,
    default: (props) => {
      // Render testable sub-elements that mirror real ProductView structure
      return React.createElement('div', { 'data-testid': 'product-view' },
        props.product?.name && React.createElement('h2', { 'data-testid': 'product-name' }, props.product.name),
        props.product?.price && React.createElement('span', { 'data-testid': 'product-price' }, `$${props.product.price}`),
        props.showFullLink && React.createElement('a', { 'data-testid': 'full-details-link', href: '#' }, 'View Full Details'),
        props.isProductLoading && React.createElement('div', { 'data-testid': 'product-view-loading' }, 'Loading...'),
        React.createElement('button', { 'data-testid': 'add-to-cart-btn' }, 'Add to Cart')
      )
    }
  }
})
```

**Test cases — Modal Shell:**

| # | Test Name | Setup | Assertion |
|---|---|---|---|
| 1 | renders loading spinner when product is fetching | `useProductViewModal` returns `{ product: null, isFetching: true }` | `screen.getByTestId('quick-view-spinner')` is visible; `screen.queryByTestId('product-view')` is `null` |
| 2 | renders ProductView when product is loaded | `useProductViewModal` returns `{ product: mockProduct, isFetching: false }` | `screen.getByTestId('product-view')` is visible; `screen.queryByTestId('quick-view-spinner')` is `null` |
| 3 | modal has correct data-testid | Render with `isOpen={true}` | `screen.getByTestId('quick-view-modal')` exists |
| 4 | modal has accessible aria-label with product name | Render with product `name: 'Test Shoes'`, `isOpen={true}` | `ModalContent` has `aria-label` containing "Test Shoes" |
| 5 | does not render modal content when closed | Render with `isOpen={false}` | `screen.queryByTestId('quick-view-modal')` is `null` |
| 6 | calls onClose when close button clicked | Render with `isOpen={true}`, click `ModalCloseButton` | `onClose` mock function called once |
| 7 | shows error state when product is unavailable | `useProductViewModal` returns `{ product: null, isFetching: false }` | `screen.getByTestId('quick-view-error')` is visible with "no longer available" text |

**Test cases — Modal Content (ProductView integration via stub):**

| # | Test Name | Setup | Assertion |
|---|---|---|---|
| 8 | passes product data to ProductView | `useProductViewModal` returns `{ product: { name: 'Ring', price: 99 }, isFetching: false }` | `screen.getByTestId('product-name')` contains "Ring"; `screen.getByTestId('product-price')` contains "$99" |
| 9 | renders "View Full Details" link in modal | `useProductViewModal` returns loaded product | `screen.getByTestId('full-details-link')` exists with text "View Full Details" |
| 10 | renders Add to Cart button in modal | `useProductViewModal` returns loaded product | `screen.getByTestId('add-to-cart-btn')` exists |
| 11 | passes `showFullLink={true}` to ProductView | Inspect ProductView stub props | Stub renders the full details link (confirms prop forwarding) |
| 12 | passes `imageSize="sm"` to ProductView | Inspect ProductView stub rendered with correct image size prop | Verify via mock: `ProductView` called with `imageSize="sm"` |
| 13 | passes `isProductLoading` to ProductView | `useProductViewModal` returns `{ product: mockProduct, isFetching: true }` but product exists | `screen.getByTestId('product-view-loading')` exists (ProductView receives loading state) |

**Test cases — Accessibility & Focus:**

| # | Test Name | Setup | Assertion |
|---|---|---|---|
| 14 | modal traps focus when open | Render with `isOpen={true}`, simulate Tab keypress | Focus stays within modal container (does not escape to page behind) |
| 15 | Escape key closes modal | Render with `isOpen={true}`, fire `Escape` keydown on modal | `onClose` mock called once |
| 16 | aria-label falls back to generic text when product name missing | Render with product having no `name` field | `aria-label` contains "product" (fallback) |

---

#### 4.3.2 ProductTile Override Tests — `overrides/app/components/product-tile/index.test.js`

**Action:** CREATE

**Mocks required:**

```js
// Mock the base ProductTile
jest.mock('@salesforce/retail-react-app/app/components/product-tile', () => {
  const React = require('react')
  return {
    __esModule: true,
    default: (props) => React.createElement('div', { 'data-testid': 'base-product-tile' },
      React.createElement('a', { href: `/product/${props.product?.productId}` },
        React.createElement('div', { 'data-testid': 'image-wrapper' }, 'Product Image')
      )
    )
  }
})

// Mock QuickViewModal to isolate tile tests
jest.mock('../quick-view-modal', () => {
  const React = require('react')
  return {
    __esModule: true,
    default: (props) => props.isOpen
      ? React.createElement('div', { 'data-testid': 'quick-view-modal' }, 'Modal')
      : null
  }
})
```

**Test cases — Overlay Bar Rendering:**

| # | Test Name | Setup | Assertion |
|---|---|---|---|
| 1 | renders Quick View overlay bar on standard product | Product with `productId: '123'` | `screen.getByTestId('quick-view-btn')` exists |
| 2 | overlay bar contains eye icon and "Quick View" text | Standard product | Bar contains `ViewIcon` + text "Quick View" |
| 3 | overlay bar has correct aria-label | Product with `productName: 'Diamond Ring'` | `aria-label` is "Quick View Diamond Ring" |
| 4 | does NOT render bar for product sets | Product with `type: { set: true }` | `screen.queryByTestId('quick-view-btn')` is `null` |
| 5 | does NOT render bar for product bundles | Product with `type: { bundle: true }` | `screen.queryByTestId('quick-view-btn')` is `null` |
| 6 | does NOT render bar when productId is missing | Product with no `productId` | `screen.queryByTestId('quick-view-btn')` is `null` |
| 7 | forwards all props to base ProductTile | Render with `enableFavourite={true}`, `badgeDetails=[...]` | Base tile stub receives all props via spread |

**Test cases — Interaction:**

| # | Test Name | Setup | Assertion |
|---|---|---|---|
| 8 | clicking bar opens QuickViewModal | Click `quick-view-btn` | `screen.getByTestId('quick-view-modal')` appears |
| 9 | clicking bar calls preventDefault | Click `quick-view-btn`, inspect event | `e.preventDefault()` was called (no navigation) |
| 10 | clicking bar calls stopPropagation | Click `quick-view-btn`, inspect event | `e.stopPropagation()` was called |
| 11 | closing modal hides QuickViewModal | Open modal → trigger `onClose` | `screen.queryByTestId('quick-view-modal')` is `null` |

**Test cases — Visual States (style assertions):**

| # | Test Name | Setup | Assertion |
|---|---|---|---|
| 12 | bar has semi-transparent dark background | Render standard product | Bar element has `background: rgba(0, 0, 0, 0.6)` style |
| 13 | bar is full-width (left:0, right:0) | Render standard product | Bar element has `position: absolute`, `left: 0`, `right: 0` |
| 14 | container has role="group" for hover pseudo | Render standard product | Wrapper `Box` has `role="group"` attribute |

**Additional mocks likely needed** (PWA Kit test environment):
- `@chakra-ui/icons` `ViewIcon` — import or mock
- `renderWithProviders` wraps in `ChakraProvider` + `IntlProvider` + `BrowserRouter` + mocked `CommerceApiProvider`

### 4.4 E2E Tests — `e2e/quick-view.spec.ts`

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

## 5. File Manifest

| Action | Path (relative to `apps/commerce-storefront/`) | Description |
|---|---|---|
| **CREATE** | `overrides/app/components/product-tile/index.jsx` | ProductTile override: wraps base tile, adds full-width Quick View overlay bar |
| **CREATE** | `overrides/app/components/product-tile/index.test.js` | Jest unit tests for ProductTile override (overlay bar trigger, interaction, accessibility) |
| **CREATE** | `overrides/app/components/quick-view-modal/index.jsx` | QuickViewModal component: Chakra Modal → ProductView with data fetching |
| **CREATE** | `overrides/app/components/quick-view-modal/index.test.js` | Jest unit tests for QuickViewModal (modal shell, content rendering, error state, accessibility) |
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

## 6. Verification Checklist

| # | Check | Command / Action |
|---|---|---|
| 1 | Build succeeds (override resolution works) | `cd apps/commerce-storefront && npm run build` |
| 2 | QuickViewModal unit tests pass | `cd apps/commerce-storefront && npm test -- --testPathPattern=quick-view-modal` |
| 3 | ProductTile override unit tests pass | `cd apps/commerce-storefront && npm test -- --testPathPattern=product-tile` |
| 4 | E2E tests pass | `cd apps/commerce-storefront && npx playwright test e2e/quick-view.spec.ts` |
| 5 | Overlay bar appears on hover (desktop) | Start dev server → navigate to category page → hover product tile → dark bar slides up from bottom of image |
| 6 | Overlay bar always visible on mobile | Resize viewport < 1024px → bar visible without hover |
| 7 | Bar has eye icon + “Quick View” text | Visual: `ViewIcon` left of white “Quick View” text on semi-transparent dark background |
| 8 | Modal opens with spinner then loads | Click Quick View bar → spinner appears → product data loads with image gallery, variant selectors, price |
| 9 | Image gallery renders in modal (`imageSize="sm"`) | ProductView shows compact product image(s) inside modal |
| 10 | Variant selectors work in modal | Select size/color swatches inside modal → image and price update |
| 11 | Add to Cart works from modal | Click Add to Cart → toast notification appears above modal |
| 12 | "View Full Details" link present | Link visible inside modal → navigates to PDP on click |
| 13 | Error state for unavailable product | If product API returns null → modal shows “no longer available” message (not blank) |
| 14 | Modal closes cleanly | Click X / press Escape / click overlay → modal closes, PLP preserved |
| 15 | No PDP navigation on Quick View interaction | URL unchanged after opening/closing Quick View |
| 16 | Accessibility: keyboard | Tab to overlay bar (bar reveals via `_focus`) → Enter opens modal → Tab cycles within modal → Escape closes |
| 17 | Accessibility: screen reader | Modal has `aria-label` with product name, bar has `aria-label` |
| 18 | Mobile: bar always visible | On small viewport, overlay bar is always visible (no hover needed) |
| 19 | Sets/bundles excluded | Product set/bundle tiles do NOT show Quick View bar |
| 20 | Quantity picker works in modal | Increment/decrement quantity inside modal before adding to cart |

---

## 7. Architectural Decisions

| Decision | Rationale |
|---|---|
| **Full-width overlay bar** (not a small centered button) | Matches reference design mockup. Larger click target improves usability (Fitts’s Law). Semi-transparent dark background maintains visual hierarchy — product image stays visible underneath. |
| **Slide-up animation** (`translateY(100%)` → `0`) | More polished than simple opacity fade. The bar “emerges” from the image bottom edge, drawing attention without jarring pop-in. `overflow: hidden` on image wrapper clips the bar cleanly. |
| **`Box as="button"`** (not Chakra `Button`) | Renders a semantic `<button>` for accessibility while allowing full custom styling (no Chakra button theme interference). Native focus/click handling. |
| **`ViewIcon` eye icon** | Visual affordance — communicates “view/preview” semantics. Consistent with e-commerce Quick View patterns (eye = peek at product). |
| Reuse `useProductViewModal` hook (not raw `useProduct`) | DRY — same hook used by Cart/Wishlist edit modals. Handles correct `expand` params (`promotions`, `availability`, `images`). |
| Override `ProductTile` via `overrides/` (not theme-only) | Need new DOM element (overlay bar) + React state (`useDisclosure`). CSS/theme-only changes cannot add interactive elements. |
| `ProductView` handles cart internally | No external `addToCart` wiring needed. `ProductView` calls `useShopperBasketsMutation('addItemToBasket')` and `useCurrentBasket` internally. Toast notifications also handled internally via `useToast`. |
| Hide Quick View for sets/bundles | `ProductView` in a small modal does not render well for multi-product types. Sets need `setProducts` expansion, bundles need `BundleProductViewModal`. Out of scope for v1. |
| Mobile: always-visible bar | Hover-to-reveal doesn’t work on touch devices. `opacity: { base: 1, lg: 0 }` with `transform: { base: 'translateY(0)', lg: 'translateY(100%)' }` ensures the bar is always visible on mobile, slide-reveal on desktop. |
| **Two unit test files** (tile + modal) | Separation of concerns: tile tests verify overlay bar rendering/interaction, modal tests verify content/data flow. Prevents monolithic test file. Each file can run independently. |

---

## 8. Corner Cases Summary

### Implementation Corner Cases

| # | Case | Handling |
|---|---|---|
| 1 | Product sets (`product.type.set === true`) | Do not render Quick View overlay bar |
| 2 | Product bundles (`product.type.bundle === true`) | Do not render Quick View overlay bar |
| 3 | Missing `productId` on product prop | Do not render Quick View bar; guard with `if (!product?.productId) return <OriginalProductTile {...props} />` |
| 4 | Parent `Link` navigation on bar click | `e.preventDefault()` + `e.stopPropagation()` on bar `onClick` |
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
