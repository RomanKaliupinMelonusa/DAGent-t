---
schemaVersion: 1
producedBy: storefront-dev
producedAt: "2026-05-10T21:49:03.647Z"
---

# PLP Quick View Modal — Implementation Summary

## Overview

Implemented a Quick View modal triggered from PLP product tiles that allows shoppers to preview product details and add to cart without navigating to the PDP.

## Files Created

| File | Purpose |
|------|---------|
| `overrides/app/components/quick-view-modal/context.jsx` | QuickViewProvider + useQuickView hook |
| `overrides/app/components/quick-view-modal/trigger.jsx` | QuickViewTrigger button (isMounted-gated, set/bundle exclusion) |
| `overrides/app/components/quick-view-modal/modal-shell.jsx` | Chakra Modal with ErrorBoundary |
| `overrides/app/components/quick-view-modal/modal-body.jsx` | ProductView with addToCart handler |
| `overrides/app/components/quick-view-modal/messages.js` | react-intl message catalog |
| `overrides/app/components/quick-view-modal/index.jsx` | Barrel re-exports |

## Files Modified

| File | Change |
|------|--------|
| `overrides/app/components/_app/index.jsx` | Mounts QuickViewProvider + QuickViewModalShell as wrapper around route children |
| `overrides/app/components/product-tile/index.jsx` | Wraps base ProductTile with QuickViewTrigger overlay |

## Data-testid Contract

| testid | Element | Location |
|--------|---------|----------|
| `quick-view-trigger-{productId}` | IconButton | trigger.jsx |
| `quick-view-modal` | ModalContent | modal-shell.jsx |
| `quick-view-modal-error` | ErrorBoundary fallback | modal-shell.jsx |
| `quick-view-view-full-details-link` | Link to PDP | modal-body.jsx |

## Key Design Decisions

1. **Reuse ProductView** with `showDeliveryOptions={false}` — no pickup/ship-to-store UI (FR-004)
2. **useShopperBasketsMutationHelper** for add-to-cart — handles create-or-add basket logic
3. **ProductView opens AddToCartModal internally** — no duplicate modal mounting needed
4. **isMounted pattern** on trigger — prevents pre-hydration click races
5. **Modal gated on `{isOpen && ...}`** — no SSR detail fetches for tiles
6. **QuickViewProvider wraps route children inside BaseApp** — ensures access to AddToCartModalProvider context
