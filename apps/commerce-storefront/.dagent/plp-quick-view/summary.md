---
schemaVersion: 1
producedBy: storefront-dev
producedAt: "2026-05-08T19:05:00.000Z"
---

# PLP Quick View Modal — Implementation Summary

## What was built

A Quick View modal triggered from product tiles on the PLP. The modal renders the base PWA Kit `ProductView` component with `showDeliveryOptions={false}` (no Ship-to-Store/Pickup UI), supports variation switching, quantity selection, and Add-to-Bag with the standard confirmation modal.

## Files created/modified

### New files
- `overrides/app/components/quick-view-modal/context.jsx` — QuickViewProvider + useQuickView hook
- `overrides/app/components/quick-view-modal/trigger.jsx` — Quick View button overlay on tiles (isMounted pattern for SSR safety)
- `overrides/app/components/quick-view-modal/modal-shell.jsx` — Chakra Modal with ErrorBoundary
- `overrides/app/components/quick-view-modal/modal-body.jsx` — ProductView + add-to-cart handler + View Full Details link
- `overrides/app/components/quick-view-modal/messages.js` — i18n message descriptors
- `overrides/app/components/quick-view-modal/index.jsx` — barrel exports

### Modified files
- `overrides/app/components/_app/index.jsx` — mounts QuickViewProvider + injects modal shell as BaseApp child
- `overrides/app/components/product-tile/index.jsx` — wraps base tile with QuickViewTrigger overlay

## Testid contract

| Testid | Element | Location |
|--------|---------|----------|
| `quick-view-trigger-{productId}` | IconButton | trigger.jsx (one per eligible tile) |
| `quick-view-modal` | ModalContent | modal-shell.jsx (singleton when open) |
| `quick-view-modal-error` | ErrorBoundary fallback | modal-shell.jsx |
| `quick-view-add-to-cart-btn` | Box wrapping ProductView | modal-body.jsx |
| `quick-view-view-full-details-link` | Link | modal-body.jsx |

## Architecture decisions

1. **Reuse over reimplementation** — ProductView handles variation state, inventory messaging, button disabled state, and the add-to-cart confirmation modal internally.
2. **SSR safety** — Trigger uses isMounted pattern; modal body only mounts on client interaction.
3. **No second AddToCartModal** — consumes the existing global instance via ProductView's internal `useAddToCartModalContext`.
4. **Set/bundle exclusion** — trigger returns null when `product.type.set || product.type.bundle`.
5. **useShopperBasketsV2MutationHelper** — handles basket creation + item addition in one call (same pattern as PDP).
