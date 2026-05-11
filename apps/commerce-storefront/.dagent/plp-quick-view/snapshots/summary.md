---
schemaVersion: 1
producedBy: storefront-dev
producedAt: "2026-05-11T03:58:00.000Z"
---

# PLP Quick View Modal — Development Summary

## Changes

### New Files
- `overrides/app/components/quick-view-modal/context.jsx` — QuickViewContext, QuickViewProvider, useQuickView hook
- `overrides/app/components/quick-view-modal/trigger.jsx` — QuickViewTrigger button (isMounted-gated, set/bundle excluded)
- `overrides/app/components/quick-view-modal/modal-shell.jsx` — Gated Chakra Modal with ErrorBoundary
- `overrides/app/components/quick-view-modal/modal-body.jsx` — ProductView with showDeliveryOptions={false}, Add-to-Cart handler, View Full Details link
- `overrides/app/components/quick-view-modal/messages.js` — react-intl defineMessages catalog
- `overrides/app/components/quick-view-modal/index.jsx` — Barrel re-exports

### Modified Files
- `overrides/app/components/_app/index.jsx` — Wraps route children in QuickViewProvider inside BaseApp's provider tree
- `overrides/app/components/product-tile/index.jsx` — Wraps base ProductTile with QuickViewTrigger overlay

## Testid Contract

| testid | Location |
|--------|----------|
| `quick-view-trigger-{productId}` | Trigger button on each eligible tile |
| `quick-view-modal` | ModalContent element |
| `quick-view-modal-error` | ErrorBoundary fallback |
| `quick-view-add-to-cart-btn` | Add-to-Cart button inside ProductView (annotated via useEffect) |
| `quick-view-view-full-details-link` | View Full Details link |
| `quick-view-modal-title` | Product name heading (also has id for aria-labelledby) |

## Architecture Notes

- **Reuse-first**: Uses base `ProductView` with `showDeliveryOptions={false}` — no cloned components
- **SSR-safe**: Trigger uses isMounted pattern; modal body only mounts when `isOpen` is true
- **Single modal instance**: QuickViewModalShell is a singleton mounted inside QuickViewProvider
- **No second AddToCartModal**: Consumes existing `useAddToCartModalContext` via ProductView's internal handler
- **Set/Bundle exclusion**: Trigger returns null for product.type.set or product.type.bundle
- **Pickup UI suppressed**: `showDeliveryOptions={false}` on ProductView
