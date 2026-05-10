---
schemaVersion: 1
producedBy: storefront-dev
producedAt: "2026-05-10T17:52:00.000Z"
---

# PLP Quick View Modal — Implementation Summary

## Files Created

| File | Purpose |
|---|---|
| `overrides/app/components/quick-view-modal/context.jsx` | QuickViewProvider + useQuickView hook (open/close state) |
| `overrides/app/components/quick-view-modal/trigger.jsx` | QuickViewTrigger button (isMounted pattern, SSR-safe) |
| `overrides/app/components/quick-view-modal/modal-shell.jsx` | Chakra Modal wrapper with ErrorBoundary |
| `overrides/app/components/quick-view-modal/modal-body.jsx` | ProductView with add-to-cart handler and View Full Details |
| `overrides/app/components/quick-view-modal/messages.js` | react-intl i18n message catalog |
| `overrides/app/components/quick-view-modal/index.jsx` | Barrel re-exports |

## Files Modified

| File | Change |
|---|---|
| `overrides/app/components/_app/index.jsx` | Wrapped BaseApp in QuickViewProvider; inject QuickViewModalShell as child of BaseApp |
| `overrides/app/components/product-tile/index.jsx` | Wrapped base ProductTile with QuickViewTrigger overlay |

## Testid Contract

| testid | Element | Notes |
|---|---|---|
| `quick-view-trigger-{productId}` | IconButton on each eligible tile | isMounted-gated; hidden for set/bundle |
| `quick-view-modal` | ModalContent | Mounted only when isOpen |
| `quick-view-modal-error` | ErrorBoundary fallback | Shown when ProductView throws |
| `quick-view-add-to-cart-btn` | ProductView's internal cart button | Tagged via DOM post-render (prop-spread footgun avoidance) |
| `quick-view-view-full-details-link` | Link to PDP | Closes modal on click |

## Architecture Decisions

1. **Reuse ProductView** with `showDeliveryOptions={false}` — no clone/fork
2. **Slim add-to-cart handler** — uses `useShopperBasketsV2Mutation` for createBasket/addItemToBasket; returns undefined so ProductView doesn't double-open the add-to-cart confirmation modal
3. **Global AddToCartModal reused** — consumed via `useAddToCartModalContext().onOpen()` at the _app context level
4. **SSR-safe**: trigger uses isMounted pattern; modal body gated on `{isOpen && <Shell>}`; no window/document access in render
5. **Set/bundle excluded** — trigger returns null for `product.type.set || product.type.bundle`
6. **QuickViewModalShell rendered as BaseApp child** — ensures it inherits AddToCartModalProvider context from the base app's provider chain
