# Risk Assessment: Product Quick View

**Feature:** `product-quick-view`
**App:** `apps/commerce-storefront`
**Date:** 2026-04-13
**Overall Risk Level:** LOW

---

## 1. Architectural Decision Records (ADRs)

### ADR-001: Override ProductTile via PWA Kit Extensibility (Not Theme-Only)

- **Context:** Quick View requires adding a new interactive DOM element (overlay bar) and React state (useDisclosure) to ProductTile. CSS/theme-only changes cannot add interactive elements.
- **Decision:** Create `overrides/app/components/product-tile/index.jsx` to shadow the base template's ProductTile. Import and wrap the original component.
- **Consequences:**
  - (+) Full control over tile DOM structure
  - (+) Original ProductTile still importable via explicit path
  - (-) Override must be maintained across base template version upgrades (9.1.x → future)
  - (-) Any future base ProductTile changes (props, structure) need manual reconciliation

### ADR-002: Lazy-Load QuickViewModal via React.lazy

- **Context:** The PLP renders 20-60 ProductTiles per page. If QuickViewModal (which calls useProductViewModal, useProduct, useIntl, etc.) mounts for every tile during SSR, it would trigger 20-60 product API fetches on the server and increase bundle size.
- **Decision:** Use `React.lazy(() => import('../quick-view-modal'))` combined with `{isOpen && <Suspense>...}` guard. The modal module is never imported during SSR.
- **Consequences:**
  - (+) Zero SSR overhead — no server-side product fetches per tile
  - (+) Code splitting — modal JS chunk only loaded on first Quick View click
  - (+) No hydration mismatches
  - (-) Small initial delay (~100ms) on first Quick View click while chunk loads

### ADR-003: Reuse useProductViewModal Hook (Not Raw useProduct)

- **Context:** The base template already has `useProductViewModal` used in Cart/Wishlist edit modals. It wraps `useProduct` with correct `expand` parameters (images, promotions, availability).
- **Decision:** Reuse `useProductViewModal` rather than calling `useProduct` directly.
- **Consequences:**
  - (+) DRY — consistent data fetching across all product modal UIs
  - (+) Correct expand params guaranteed (no missing image groups or promotions)
  - (+) Benefits from any upstream improvements to the hook
  - (-) Coupled to hook's API contract — if Salesforce changes the hook interface in a major version, our modal must adapt

### ADR-004: Inline SVG Eye Icon (Not @chakra-ui/icons)

- **Context:** `@chakra-ui/icons` was not reliably available during SSR in the PWA Kit build environment. Using it caused build warnings and potential runtime errors.
- **Decision:** Create a simple inline SVG `EyeIcon` component (~8 lines) directly in the ProductTile override file.
- **Consequences:**
  - (+) Zero external dependency for icon rendering
  - (+) SSR-safe — deterministic SVG output
  - (+) Bundle size savings (no @chakra-ui/icons package tree-shaken in)
  - (-) Must manually maintain icon SVG if design changes

### ADR-005: QuickViewErrorBoundary for Modal Isolation

- **Context:** ProductView is a complex base template component with many internal hooks (useDerivedProduct, useShopperBasketsMutation, useCurrentBasket, useToast). If any of these fail at render time, the error would propagate to the route-level AppErrorBoundary, replacing the entire PLP page with a crash screen.
- **Decision:** Wrap ProductView in a class-based `QuickViewErrorBoundary` that catches render errors and shows a friendly fallback within the modal.
- **Consequences:**
  - (+) PLP page stays intact even if modal content crashes
  - (+) Graceful degradation — shopper sees error message, can close modal, continue browsing
  - (-) Error boundary does not catch async errors (hook fetch failures) — those are handled by the isFetching/isUnavailable state logic

### ADR-006: Full-Width Overlay Bar (Not Small Centered Button)

- **Context:** Reference mockup showed a full-bleed semi-transparent dark bar at the bottom of the product image. Alternative was a small centered "Quick View" button.
- **Decision:** Implement full-width overlay bar with slide-up animation on desktop hover.
- **Consequences:**
  - (+) Larger click/tap target (Fitts's Law) — better usability on mobile
  - (+) Cleaner visual design — consistent with reference mockup
  - (+) Semi-transparent background keeps product image partially visible
  - (-) Bar partially obscures bottom of product image when visible (acceptable trade-off per design)

---

## 2. Blast Radius Analysis

### 2.1 Files Modified/Created

| File | Action | Blast Radius |
|---|---|---|
| `overrides/app/components/product-tile/index.jsx` | CREATE (override) | **HIGH** — Affects every ProductTile instance across the entire storefront (PLP, search results, wishlist grids, Einstein recommendations). Any rendering bug here impacts all product grids. |
| `overrides/app/components/quick-view-modal/index.jsx` | CREATE (new) | **LOW** — Only mounted when shopper clicks Quick View. Lazy-loaded. Failure contained by ErrorBoundary. |
| `overrides/app/components/product-tile/index.test.js` | CREATE (test) | **NONE** — Test-only file. |
| `overrides/app/components/quick-view-modal/index.test.js` | CREATE (test) | **NONE** — Test-only file. |

### 2.2 Dependency Impact Map

```
ProductTile Override (HIGH BLAST RADIUS)
  |
  |-- Affects: Every page that renders product grids
  |     |-- /category/* (PLP pages)
  |     |-- /search (search results)
  |     |-- / (homepage product recommendations)
  |     |-- /account/wishlist (wishlist grid)
  |     |-- Einstein recommendation carousels
  |
  |-- Dependencies (upstream):
  |     |-- @salesforce/retail-react-app/app/components/product-tile (base)
  |     |-- @salesforce/retail-react-app/app/components/shared/ui (Chakra)
  |     |-- React.lazy, React.Suspense (React core)
  |
  |-- Dependencies (downstream):
       |-- QuickViewModal (lazy-loaded, isolated)
            |-- useProductViewModal hook
            |-- ProductView (base template)
            |-- SCAPI Shopper Products API
            |-- SCAPI Shopper Baskets API
```

### 2.3 Risk Mitigation for ProductTile Override

The ProductTile override is the highest-risk component because it wraps every product tile on the site. Mitigations:

1. **Prop passthrough via spread:** `<OriginalProductTile product={product} {...rest} />` ensures all existing props flow through unchanged.
2. **Additive-only change:** The override only ADDS elements (overlay bar + modal). It does not modify or remove any base tile behavior.
3. **Conditional rendering:** Quick View bar only renders when `showQuickView` is true. Products without `productId`, sets, and bundles render the original tile unmodified.
4. **Lazy modal mounting:** `{isOpen && <Suspense>...}` ensures modal code never executes unless explicitly triggered. No perf impact on page load.
5. **Error boundary isolation:** If QuickViewModal crashes, ErrorBoundary catches it within the modal — PLP remains functional.
6. **Skeleton re-export:** `export {Skeleton} from '...'` ensures the tile's loading skeleton is available to consumers.

---

## 3. Risk Matrix

### 3.1 Short-Term Risks (0-3 months)

| # | Risk | Likelihood | Impact | Severity | Mitigation |
|---|---|---|---|---|---|
| R1 | ProductTile override breaks product grid rendering | Low | Critical | Medium | Unit tests cover rendering, prop passthrough. Manual QA on PLP/search/wishlist. |
| R2 | useProductViewModal API mismatch with newer base template version | Low | High | Medium | Pin @salesforce/retail-react-app@9.1.1. Test after any upgrade. |
| R3 | Quick View click accidentally navigates to PDP | Low | Medium | Low | e.preventDefault() + e.stopPropagation() tested. Covered in unit tests. |
| R4 | Modal performance on low-end devices | Medium | Low | Low | React.lazy code splitting limits initial load. Modal is single ProductView instance. |
| R5 | SCAPI rate limiting from rapid Quick View opens | Low | Medium | Low | React Query caching prevents duplicate fetches. Products cached after first fetch. |

### 3.2 Long-Term Risks (3-12 months)

| # | Risk | Likelihood | Impact | Severity | Mitigation |
|---|---|---|---|---|---|
| R6 | Base template ProductTile structure changes in future PWA Kit versions | Medium | High | Medium | Override imports base via explicit path. Version-pin in package.json. Reconcile during upgrades. |
| R7 | useProductViewModal hook contract changes | Low | High | Medium | Hook reused from base template — Salesforce maintains backward compatibility. Monitor release notes. |
| R8 | Product sets/bundles support requested | High | Medium | Medium | v1 explicitly excludes sets/bundles. Future ADR needed for BundleProductViewModal integration. |
| R9 | Design system migration (Chakra UI v2 to v3) | Low | High | Medium | Override uses Chakra primitives (Box, Modal) which are stable across minor versions. Major version needs full audit. |
| R10 | Accessibility audit findings | Medium | Medium | Medium | WCAG AA compliant design (4.5:1 contrast, focus management, aria-labels). Keyboard testing covered in unit tests. |

### 3.3 Risk Heat Map

```
              Low Impact    Medium Impact    High Impact    Critical Impact
            +-------------+---------------+-------------+----------------+
  High      |             | R8            |             |                |
  Likelihood|             |               |             |                |
            +-------------+---------------+-------------+----------------+
  Medium    | R4          | R10           | R6, R9      |                |
  Likelihood|             |               |             |                |
            +-------------+---------------+-------------+----------------+
  Low       |             | R3, R5        | R2, R7      | R1             |
  Likelihood|             |               |             |                |
            +-------------+---------------+-------------+----------------+
```

---

## 4. Performance Impact Assessment

| Metric | Impact | Details |
|---|---|---|
| **PLP Initial Load (LCP)** | Negligible | ProductTile override adds ~4KB uncompressed. Overlay bar is pure CSS (opacity/transform). QuickViewModal not loaded until clicked. |
| **PLP Time to Interactive** | Negligible | No additional hooks execute on page load. useDisclosure is lightweight (boolean state). |
| **Quick View Open Latency** | ~200-400ms | First open: React.lazy chunk download (~20KB gzipped) + SCAPI product fetch (~100-300ms with proxy). Subsequent opens for same product: ~50ms (cached). |
| **Memory Footprint** | Minimal | Only one QuickViewModal instance active at a time. Unmounted on close. React Query manages product cache with default GC. |
| **Bundle Size** | +4KB (tile chunk), +20KB (modal chunk, lazy) | Modal chunk only loaded on demand. No new npm dependencies. |

---

## 5. Security Considerations

| Concern | Assessment |
|---|---|
| **No new API surface** | Feature reuses existing SCAPI proxy and SDK hooks. No new API endpoints or authentication flows. |
| **No credential exposure** | SLAS client ID is a public identifier already in config/default.js. No secrets in component code. |
| **XSS vectors** | Product names rendered via React JSX (auto-escaped). No dangerouslySetInnerHTML. Aria-labels use intl.formatMessage (sanitized). |
| **CSRF for cart mutations** | useShopperBasketsMutation uses SLAS access tokens with basket-scoped authorization. Standard SCAPI CSRF protection applies. |
| **Content injection** | Product images loaded via SFCC DIS (Dynamic Image Service) URLs. No user-uploaded content vectors. |

---

## 6. Testing Coverage Summary

| Layer | Coverage | Details |
|---|---|---|
| **Unit Tests** | 30 test cases across 2 files | ProductTile: 14 tests (rendering, interaction, accessibility, visual). QuickViewModal: 16 tests (loading, error, success, a11y). |
| **E2E Tests** | Playwright test suite | Quick View button visibility, modal open/close, product data rendering, add-to-cart flow. |
| **SSR Safety** | Architectural guarantee | React.lazy + isOpen guard prevents all modal hooks from executing during SSR. Verified by build + hydration. |
| **Error Handling** | ErrorBoundary + isUnavailable state | Render errors caught by boundary. API errors handled by hook state. Both show user-friendly messages. |

---

## 7. Upgrade Path

When upgrading `@salesforce/retail-react-app` from 9.1.1 to a future version:

1. **Check ProductTile base changes:** Diff `node_modules/@salesforce/retail-react-app/app/components/product-tile/index.jsx` between versions. Our override imports and wraps the base — any new props or structural changes need review.
2. **Check useProductViewModal changes:** Verify the hook still returns `{ product, isFetching }`. If the signature changes, update QuickViewModal accordingly.
3. **Check ProductView prop contract:** Verify `showFullLink`, `imageSize`, `isProductLoading`, `product` props still exist and behave the same.
4. **Check Chakra UI version:** If PWA Kit upgrades Chakra, verify Modal, Box, useDisclosure APIs are compatible.
5. **Run unit tests:** `npm test -- --testPathPattern="(product-tile|quick-view-modal)"` — all 30 tests should pass.
6. **Run E2E tests:** `npx playwright test` — verify Quick View flow end-to-end.
