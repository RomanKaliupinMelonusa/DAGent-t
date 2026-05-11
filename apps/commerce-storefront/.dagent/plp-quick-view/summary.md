---
schemaVersion: 1
producedBy: storefront-dev
producedAt: "2026-05-11T20:31:00.000Z"
---

# PLP Quick View Modal — Implementation Summary

## Overview

Implemented the PLP Quick View modal feature for the commerce storefront. The feature allows shoppers to preview product details and add items to their cart from the Product List Page without navigating to the PDP.

## Files Created

| File | Purpose |
|---|---|
| `overrides/app/components/quick-view-modal/context.jsx` | QuickViewContext, QuickViewProvider, useQuickView hook |
| `overrides/app/components/quick-view-modal/messages.js` | react-intl message definitions for i18n |
| `overrides/app/components/quick-view-modal/trigger.jsx` | QuickViewTrigger button with isMounted pattern (pre-existing, verified) |
| `overrides/app/components/quick-view-modal/modal-shell.jsx` | Chakra Modal shell with ErrorBoundary |
| `overrides/app/components/quick-view-modal/modal-body.jsx` | ProductView integration with Add-to-Cart handler |
| `overrides/app/components/quick-view-modal/index.jsx` | Barrel re-exports |

## Files Modified

| File | Change |
|---|---|
| `overrides/app/components/_app/index.jsx` | Mount QuickViewProvider + QuickViewModalShell inside BaseApp's children |
| `overrides/app/components/product-tile/index.jsx` | Wrap BaseProductTile with QuickViewTrigger overlay |

## Testid Contract

| testid | Location |
|---|---|
| `quick-view-trigger-{productId}` | QuickViewTrigger button (one per eligible tile) |
| `quick-view-modal` | ModalContent (visible when modal open) |
| `quick-view-modal-error` | ErrorBoundary fallback inside modal |
| `quick-view-add-to-cart-btn` | Stamped on ProductView's Add-to-Cart button via useEffect |
| `quick-view-view-full-details-link` | Link at bottom of modal body |

## Key Architecture Decisions

1. **Reuse ProductView** with `showDeliveryOptions={false}` — no Pickup/Ship-to-Store UI (FR-004)
2. **useShopperBasketsMutationHelper** — `addItemToNewOrExistingBasket` handles basket creation and item addition, matching PDP behavior
3. **ProductView handles AddToCartModal** — internally calls `useAddToCartModalContext().onOpen()` after `addToCart` returns, so Quick View just does the mutation and closes itself
4. **Provider placement inside BaseApp children** — ensures modal body has access to AddToCartModalProvider and commerce SDK contexts
5. **isMounted pattern on trigger** — prevents pre-hydration interaction races
6. **Modal gated on isOpen** — no SSR product-detail fetches; hooks only run when modal opens

## SSR Safety

- No `window`/`document` access outside `useEffect` guards
- Trigger button renders with stable attrs during SSR; onClick is noop until mounted
- Modal shell returns null when closed — no hooks run during SSR
- No Date.now() or Math.random() in render output
