# Risk Assessment: Product Quick View

**Feature:** `product-quick-view`
**App:** `apps/commerce-storefront`
**Date:** 2026-04-19
**Author:** Executive Architect (automated)

---

## 1. Architectural Decision Records (ADRs)

### ADR-001: Override ProductTile via PWA Kit extensibility (not theme-only)

| Field | Value |
|---|---|
| **Status** | Accepted |
| **Context** | The Quick View feature requires adding new DOM elements (overlay bar, modal) and React state (useDisclosure) to every ProductTile. Chakra theme customizations can only alter styles, not inject interactive elements. |
| **Decision** | Use the PWA Kit `overrides/` directory to shadow `app/components/product-tile/index.jsx`. The override wraps the base component and adds Quick View behavior. |
| **Consequences** | (+) All pages rendering ProductTile automatically gain Quick View without page-level changes. (+) Base component is imported and rendered unchanged — prop contract preserved. (-) Override must be maintained across base template upgrades. (-) Any breaking change to ProductTile props in a future `retail-react-app` version requires override update. |
| **Risk Level** | **Medium** — Override coupling to base template version |

### ADR-002: Reuse useProductViewModal hook (not raw useProduct)

| Field | Value |
|---|---|
| **Status** | Accepted |
| **Context** | The base template already provides `useProductViewModal` which wraps `useProduct` with the correct `expand` parameters (promotions, availability, images). The cart and wishlist edit modals use this same hook. |
| **Decision** | Reuse the existing hook rather than creating a custom one. |
| **Consequences** | (+) DRY — consistent data shape across all product modals. (+) Benefit from any upstream bug fixes to the hook. (-) If the hook's API changes in a future release, QuickViewModal must adapt. (-) Cannot customize the `expand` params without forking the hook. |
| **Risk Level** | **Low** — Hook is stable, well-tested in base template |

### ADR-003: Delegate cart mutations to ProductView internals

| Field | Value |
|---|---|
| **Status** | Accepted |
| **Context** | `ProductView` internally uses `useShopperBasketsMutation('addItemToBasket')` and `useCurrentBasket()` to handle the entire Add to Cart flow, including toast notifications via `useToast()`. |
| **Decision** | Do NOT wire external `addToCart` callbacks. Let ProductView manage cart operations internally. |
| **Consequences** | (+) Zero custom cart logic to maintain. (+) Toast notifications, error handling, and loading states come for free. (-) Cannot easily customize the post-add-to-cart behavior (e.g., auto-close modal on add). (-) If ProductView changes its internal cart handling, our feature implicitly changes. |
| **Risk Level** | **Low** — Standard pattern used by existing Cart/Wishlist modals |

### ADR-004: Hide Quick View for product sets and bundles

| Field | Value |
|---|---|
| **Status** | Accepted |
| **Context** | Product sets require `setProducts` expansion and a specialized `SetProductViewModal`. Bundles require `BundleProductViewModal`. The standard `ProductView` in a compact modal does not render well for multi-product types. |
| **Decision** | Do not render the Quick View overlay bar when `product.type.set === true` or `product.type.bundle === true`. These product types are excluded from v1. |
| **Consequences** | (+) Avoids broken UX for complex product types. (+) Simplifies v1 scope. (-) Shoppers cannot Quick View sets/bundles — must navigate to PDP. (-) Future v2 must add set/bundle support separately. |
| **Risk Level** | **Low** — Intentional scope limitation |

### ADR-005: Full-width overlay bar (not small centered button)

| Field | Value |
|---|---|
| **Status** | Accepted |
| **Context** | The reference design mockup specifies a full-width semi-transparent dark bar at the bottom of the product image, not a small centered button. This provides a larger click/tap target (Fitts's Law) and cleaner visual integration. |
| **Decision** | Implement as a full-bleed overlay bar with slide-up animation on desktop, always visible on mobile. |
| **Consequences** | (+) Superior UX: larger target, elegant animation. (+) Accessible: `_focus` pseudo reveals bar for keyboard navigation. (-) Covers bottom ~36px of product image (partially visible through semi-transparent overlay). (-) On mobile, bar is always visible, reducing image visibility. |
| **Risk Level** | **Low** — Pure UI decision, easily adjustable via CSS props |

### ADR-006: Lazy mount QuickViewModal (only when isOpen)

| Field | Value |
|---|---|
| **Status** | Accepted |
| **Context** | If QuickViewModal renders on every tile at page load, `useProductViewModal` could fire unnecessary API calls during SSR or client hydration. Each tile on a PLP grid would mount a modal, creating N modal DOM nodes. |
| **Decision** | Conditionally render `{isOpen && <QuickViewModal ... />}` — modal only mounts when opened. |
| **Consequences** | (+) Zero API calls until shopper explicitly opens Quick View. (+) No SSR mismatch — isOpen is always false on server. (+) Minimal DOM footprint — only one modal in the DOM at a time. (-) Slight mount delay when modal opens (React needs to create the component tree). Mitigated by the loading spinner. |
| **Risk Level** | **Low** |

### ADR-007: QuickViewErrorBoundary for crash isolation

| Field | Value |
|---|---|
| **Status** | Accepted |
| **Context** | ProductView is a complex component with deep dependency chains (useDerivedProduct, variant logic, image gallery). A render error in ProductView inside a modal portal could propagate to the route-level AppErrorBoundary, replacing the entire PLP with a crash screen. |
| **Decision** | Wrap ProductView in a lightweight class-based ErrorBoundary that shows a user-friendly error state within the modal. |
| **Consequences** | (+) ProductView crashes are contained to the modal. PLP remains functional. (+) User sees a clear error message, not a blank screen. (-) Error boundary does not recover — user must close and reopen the modal. (-) Class component in an otherwise functional codebase (React constraint — no hook-based error boundaries yet). |
| **Risk Level** | **Low** — Defensive measure, small code footprint |

---

## 2. Blast Radius Analysis

### 2.1 Direct Impact

| Changed File | Blast Radius | Affected Pages |
|---|---|---|
| `overrides/app/components/product-tile/index.jsx` | **High** — This override shadows the base ProductTile globally. Every page rendering ProductTile is affected. | Product Listing Pages (PLPs), Category pages, Search results, Wishlist, Recently Viewed, any custom page using ProductTile |
| `overrides/app/components/quick-view-modal/index.jsx` | **Low** — New component, only imported by the ProductTile override | Only active when Quick View is triggered |

### 2.2 Indirect Impact (Dependency Chain)

```
ProductTile (Override)
├── @salesforce/retail-react-app/app/components/product-tile (base) — no change
├── QuickViewModal
│   ├── useProductViewModal (base hook) — no change
│   │   └── useProduct (commerce-sdk-react) — no change
│   ├── ProductView (base component) — no change
│   │   ├── useDerivedProduct — no change
│   │   ├── useShopperBasketsMutation — no change
│   │   └── useToast — no change
│   └── QuickViewErrorBoundary — new, isolated
├── @chakra-ui/icons (ViewIcon) — existing dependency
└── useDisclosure (Chakra UI) — existing dependency
```

**Key insight:** The feature modifies ZERO base template files. All changes are in the `overrides/` directory. The blast radius is limited to:
1. **Visual:** ProductTile gains an overlay bar on all pages that render it
2. **Behavioral:** Clicking the bar opens a modal (new interaction path)
3. **Network:** One additional API call per Quick View open (GET /products/{id})

### 2.3 Pages Affected by ProductTile Override

| Page | Route | Impact |
|---|---|---|
| Category / PLP | `/category/:categoryId` | Quick View bar appears on every product tile |
| Search Results | `/search?q=...` | Quick View bar appears on search result tiles |
| Home Page (if ProductTile used) | `/` | Conditional — only if home page renders product tiles |
| Wishlist | `/account/wishlist` | Quick View bar appears on wishlisted product tiles |
| Recently Viewed | (various) | Quick View bar appears if tiles are rendered |

### 2.4 Bundle Size Impact

| Addition | Estimated Size | Notes |
|---|---|---|
| ProductTile override | ~2 KB (gzipped) | Mostly JSX + CSS-in-JS props |
| QuickViewModal | ~1.5 KB (gzipped) | Small wrapper; heavy components (ProductView, Modal) already in bundle |
| @chakra-ui/icons (ViewIcon) | ~0.5 KB (gzipped) | Tree-shakeable; only ViewIcon + WarningIcon imported |
| **Total incremental** | **~4 KB gzipped** | Minimal — no new heavy dependencies |

ProductView and Modal are already in the main bundle (used by Cart/Wishlist edit flows), so the Quick View feature adds negligible JS to the critical path.

---

## 3. Risk Matrix

### 3.1 Short-Term Risks (Pre-Launch)

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | **ProductTile override breaks existing tile styling** | Low | High | Override wraps (not replaces) base component. All props forwarded via spread. Visual regression testing via E2E screenshots. |
| R2 | **useProductViewModal hook returns unexpected data shape** | Low | Medium | Hook is battle-tested in Cart/Wishlist modals. QuickViewModal has null-check + error state. ErrorBoundary catches render crashes. |
| R3 | **Quick View bar intercepts tile click navigation** | Low | High | `e.preventDefault()` + `e.stopPropagation()` on bar click. Bar is absolutely positioned with pointer-events isolation — tile Link remains clickable outside bar area. Unit tests verify event handling. |
| R4 | **SSR hydration mismatch** | Very Low | High | Modal is conditionally rendered (`isOpen && ...`). Bar renders identically on server and client (opacity:0 on desktop). useDisclosure initializes consistently. |
| R5 | **Modal focus trap conflicts with global keyboard shortcuts** | Low | Low | Chakra Modal's built-in focus trap is well-tested. Escape key closes modal. No custom keyboard handling needed. |

### 3.2 Long-Term Risks (Post-Launch)

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R6 | **Base template upgrade breaks ProductTile override** | Medium | High | The override imports the base component by explicit path. If `retail-react-app` changes ProductTile's internal structure, props, or DOM hierarchy, the override may render incorrectly. **Mitigation:** Pin `@salesforce/retail-react-app` version. Review override compatibility before upgrading. Maintain comprehensive unit tests that catch prop contract violations. |
| R7 | **useProductViewModal hook API change** | Low | Medium | Hook is a simple wrapper. If useProduct changes its return shape, the modal's null-check and error state provide graceful degradation. |
| R8 | **Performance degradation on large PLPs** | Low | Medium | Quick View is lazy-mounted (only on open). No API calls until interaction. Each tile adds one event listener and minimal DOM (a hidden bar). For PLPs with 50+ tiles, the additional DOM is ~50 lightweight elements. TanStack Query caches product data — reopening the same product is instant. |
| R9 | **Product sets/bundles support gap** | Medium | Low | v1 intentionally excludes sets/bundles. Users must navigate to PDP for these. Future v2 should add specialized modal handling. Track as known limitation. |
| R10 | **Accessibility regression** | Low | High | Bar uses semantic `<button>` element. `_focus` pseudo reveals bar for keyboard users. Modal has aria-label with product name. Focus trap built into Chakra Modal. Screen reader support via aria attributes. **Mitigation:** Include accessibility checks in E2E tests. |

### 3.3 Risk Heat Map

```
         Low Impact    Medium Impact    High Impact
        ┌─────────────┬────────────────┬──────────────┐
High    │             │                │              │
Likely  │             │                │              │
        ├─────────────┼────────────────┼──────────────┤
Medium  │             │  R9            │  R6          │
Likely  │             │                │              │
        ├─────────────┼────────────────┼──────────────┤
Low     │  R5         │  R2, R7, R8    │  R1, R3, R10 │
Likely  │             │                │              │
        ├─────────────┼────────────────┼──────────────┤
Very    │             │                │  R4          │
Low     │             │                │              │
        └─────────────┴────────────────┴──────────────┘
```

### 3.4 Overall Risk Score

| Dimension | Score (1-5) | Notes |
|---|---|---|
| **Complexity** | 2/5 | Two small components (153 + 137 lines). Reuses existing patterns. |
| **Blast Radius** | 3/5 | ProductTile override affects all pages rendering product tiles. |
| **Dependency Risk** | 2/5 | No new external dependencies. Relies on stable base template hooks. |
| **Upgrade Risk** | 3/5 | Override pattern creates coupling to base template version. |
| **Performance Risk** | 1/5 | Lazy mounting, zero API calls until interaction, cached responses. |
| **Accessibility Risk** | 1/5 | Semantic HTML, aria attributes, focus management via Chakra. |
| **Overall** | **2.0/5 (Low-Medium)** | Well-scoped feature leveraging proven patterns. Primary risk is base template upgrade compatibility. |

---

## 4. Recommendations

### 4.1 Pre-Launch

1. **Visual Regression Tests:** Add Playwright screenshot comparisons for PLP tiles with and without hover to catch styling regressions.
2. **Performance Audit:** Run Lighthouse on PLP with 24+ tiles to verify no CLS or LCP regression from the overlay bar.
3. **A11y Audit:** Run axe-core in E2E tests on the Quick View modal to catch WCAG violations.

### 4.2 Post-Launch

1. **Monitor API Latency:** Track `useProductViewModal` fetch times. If P95 exceeds 2s, consider prefetching on hover (before click).
2. **Conversion Tracking:** Measure Add-to-Cart rate from Quick View vs. PDP to validate feature value.
3. **Template Upgrade Playbook:** Before upgrading `@salesforce/retail-react-app`, diff the base `ProductTile` and `useProductViewModal` for breaking changes.
4. **v2 Roadmap:** Plan set/bundle support with specialized modal variants.

---

*This document was auto-generated by the Executive Architect agent as part of the autonomous pipeline.*
