# Product Quick View — Change Summary

**Feature:** `product-quick-view`
**Generated:** 2026-04-19T20:27:58Z
**Pipeline status:** storefront-dev ✅ → unit-test ✅ → e2e-author ✅ → e2e-runner ✅ → create-draft-pr ✅ → docs-archived (current)

---

## Overview

This feature allows shoppers to view product details, select variations (size/color), and add items to their cart directly from the Product Listing Page (PLP) via a Quick View modal — without navigating to the Product Detail Page (PDP).

The implementation uses the PWA Kit extensibility override pattern and reuses existing Salesforce Commerce SDK hooks and base template components.

---

## Architecture

### Override Strategy

The feature overrides two components via the PWA Kit `overrides/` mechanism:

1. **ProductTile** (`overrides/app/components/product-tile/index.jsx`) — wraps the base `ProductTile` in a group-hover container and adds an absolutely-positioned overlay bar at the bottom of the product image area.
2. **QuickViewModal** (`overrides/app/components/quick-view-modal/index.jsx`) — a modal component that renders the base `ProductView` with full product data fetched via the `useProductViewModal` hook.

### Reused Base Components

| Component / Hook | Source | Purpose |
|---|---|---|
| `ProductView` | `@salesforce/retail-react-app/app/components/product-view` | Full product detail UI (images, price, variant selectors, Add to Cart) |
| `useProductViewModal` | `@salesforce/retail-react-app/app/hooks/use-product-view-modal` | Fetches full product data from a `ProductSearchHit` |
| `ProductTile` (base) | `@salesforce/retail-react-app/app/components/product-tile` | Original tile component, wrapped by the override |

### Key Design Decisions

- **No new API calls:** Reuses existing `useProductViewModal` hook which calls `useProduct` from `commerce-sdk-react`
- **ErrorBoundary isolation:** A lightweight `QuickViewErrorBoundary` class component wraps `ProductView` inside the modal portal, preventing render crashes from triggering the route-level `AppErrorBoundary`
- **SSR-safe:** Modal mounting is SSR-safe since Chakra UI's `Modal` uses portals that only mount client-side
- **Product exclusions:** Quick View is hidden for product sets, bundles, and items missing a `productId`

---

## Files Changed (5 files, +430 / −11 lines)

### Storefront Components

| File | Type | Description |
|---|---|---|
| `overrides/app/components/product-tile/index.jsx` | Modified | Wraps base ProductTile with Quick View overlay bar — slides up on hover (desktop), always visible (mobile) |
| `overrides/app/components/quick-view-modal/index.jsx` | Modified | Modal component with loading spinner, error boundary, and ProductView rendering |

### Unit Tests

| File | Type | Description |
|---|---|---|
| `overrides/app/components/product-tile/index.test.js` | Modified | Tests for overlay bar rendering, click handler, a11y attributes, set/bundle exclusion |
| `overrides/app/components/quick-view-modal/index.test.js` | Modified | Tests for loading state, product view rendering, error boundary fallback, close behavior |

### E2E Tests

| File | Type | Description |
|---|---|---|
| `e2e/product-quick-view.spec.ts` | Added | Playwright E2E tests covering trigger visibility, modal lifecycle, product content loading, keyboard accessibility |

---

## Commit History

| Hash | Message |
|---|---|
| `7885133` | feat(storefront): product quick view - SSR-safe modal mounting and ErrorBoundary |
| `12e15eb` | test(storefront): add unit tests for product quick view modal and tile overlay |
| `48e5e9c` | test(e2e): add product quick view E2E tests |
| `d45d6dd` | chore(cleanup): remove dead code from product-quick-view feature |

---

## Data-TestID Contract

| TestID | Element | Purpose |
|---|---|---|
| `quick-view-btn` | Overlay bar on product tile | Trigger to open Quick View modal |
| `quick-view-modal` | Modal content container | Main modal wrapper |
| `quick-view-spinner` | Loading spinner | Shown while product data is fetching |
| `quick-view-error` | Error/unavailable state | Shown when product fetch fails or ErrorBoundary catches |
