---
schemaVersion: 1
producedBy: storefront-dev
producedAt: "2026-05-11T00:55:00.000Z"
---

# PLP Quick View Modal — Implementation Summary

## Overview

Implemented the PLP Product Quick View modal feature for the commerce storefront. The feature adds a Quick View trigger button to product tiles on the PLP that opens a modal displaying product details (gallery, price, variation swatches, quantity picker) with Add-to-Cart capability.

## Files Created

| File | Purpose |
|---|---|
| `overrides/app/components/quick-view-modal/context.jsx` | QuickViewContext, QuickViewProvider, useQuickView hook |
| `overrides/app/components/quick-view-modal/trigger.jsx` | QuickViewTrigger button (isMounted-gated, set/bundle excluded) |
| `overrides/app/components/quick-view-modal/modal-shell.jsx` | Chakra Modal wrapper with ErrorBoundary |
| `overrides/app/components/quick-view-modal/modal-body.jsx` | ProductView with addToCart handler, View Full Details link |
| `overrides/app/components/quick-view-modal/messages.js` | react-intl defineMessages catalog |
| `overrides/app/components/quick-view-modal/index.jsx` | Barrel re-exports |

## Files Modified

| File | Change |
|---|---|
| `overrides/app/components/_app/index.jsx` | Wraps route children in QuickViewProvider, mounts QuickViewModalShell |
| `overrides/app/components/product-tile/index.jsx` | Wraps base ProductTile with QuickViewTrigger overlay |

## Test IDs Exposed

| testid | Element | Location |
|---|---|---|
| `quick-view-trigger-{productId}` | IconButton | trigger.jsx |
| `quick-view-modal` | ModalContent | modal-shell.jsx |
| `quick-view-modal-error` | ErrorBoundary fallback | modal-shell.jsx |
| `quick-view-add-to-cart-btn` | Add to Cart button (tagged via DOM ref) | modal-body.jsx |
| `quick-view-view-full-details-link` | Link to PDP | modal-body.jsx |
| `quick-view-modal-title` (DOM id) | Heading element (aria-labelledby anchor) | modal-body.jsx |

## Architecture Decisions

1. **Reused base ProductView** with `showDeliveryOptions={false}` — no pickup/ship-to-store UI (FR-004).
2. **useProductViewModal** delegates all variation state management to the base hook.
3. **useShopperBasketsV2MutationHelper.addItemToNewOrExistingBasket** handles basket create-or-add atomically.
4. **ProductView's internal onAddToCartModalOpen** handles the global confirmation modal — no second AddToCartModal mounted.
5. **isMounted pattern** on trigger prevents pre-hydration interaction races.
6. **QuickViewModalShell** gates body mount on `isOpen` — no SSR product detail fetches.
7. **ErrorBoundary** wraps modal body to isolate fetch failures from the PLP route.

## SSR Safety

- [x] No `window`/`document` access outside `useEffect`
- [x] `useEffect` is client-only (no SSR execution)
- [x] No `Date.now()` or `Math.random()` in render output
- [x] All components use Chakra UI (no raw HTML elements)
- [x] Modal body only mounts when `isOpen === true` (never during SSR)
- [x] Trigger renders deterministic SSR markup with inert `onClick` until mounted
