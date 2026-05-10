---
schemaVersion: 1
producedBy: storefront-dev
producedAt: "2026-05-10T20:27:02.900Z"
---

# PLP Quick View Modal — Implementation Summary

## What was implemented

A Quick View modal triggered from product tiles on the Product List Page (PLP). When a shopper clicks the Quick View trigger on any eligible tile, a modal opens with the product's gallery, name, price, variation swatches, quantity picker, and Add-to-Cart button — all without navigating away from the PLP.

## Architecture

- **QuickViewProvider** (`context.jsx`) — React context + singleton modal shell. Manages `isOpen` / `openProduct` state.
- **QuickViewTrigger** (`trigger.jsx`) — isMounted-gated icon button on each tile; hidden for sets/bundles.
- **QuickViewModalShell** (`modal-shell.jsx`) — Chakra Modal, gated on `isOpen`; wraps body in `react-error-boundary`.
- **QuickViewModalBody** (`modal-body.jsx`) — Renders base `ProductView` with `showDeliveryOptions={false}`; slim `addToCart` handler using `useShopperBasketsV2MutationHelper`.
- **ProductTile override** (`product-tile/index.jsx`) — Wraps base tile with QuickViewTrigger sibling.
- **App override** (`_app/index.jsx`) — Mounts QuickViewProvider inside BaseApp's provider chain.

## Key decisions

1. **Reuse, not re-implement**: Uses base `ProductView` directly with `showDeliveryOptions={false}` for FR-004 compliance.
2. **SSR safety**: Trigger uses isMounted pattern; modal body only mounts when `isOpen=true` (never during SSR).
3. **No second AddToCartModal**: ProductView internally calls `useAddToCartModalContext().onOpen()` after successful add-to-cart.
4. **Slim add-to-cart handler**: Uses `useShopperBasketsV2MutationHelper.addItemToNewOrExistingBasket` which handles basket creation/item-add in one call.
5. **Button testid via DOM annotation**: ProductView's internal Add-to-Cart button is annotated with `data-testid="quick-view-add-to-cart-btn"` via a useEffect DOM query (ProductView doesn't expose a prop for this).

## Testid contract

| testid | Element |
|---|---|
| `quick-view-trigger-{productId}` | Trigger button on each eligible tile |
| `quick-view-modal` | ModalContent when open |
| `quick-view-modal-error` | ErrorBoundary fallback |
| `quick-view-add-to-cart-btn` | Add-to-Cart button inside modal |
| `quick-view-view-full-details-link` | "View Full Details" link |

## Files modified/created

- `overrides/app/components/quick-view-modal/context.jsx` — NEW
- `overrides/app/components/quick-view-modal/trigger.jsx` — EXISTING (no changes)
- `overrides/app/components/quick-view-modal/modal-shell.jsx` — NEW
- `overrides/app/components/quick-view-modal/modal-body.jsx` — NEW
- `overrides/app/components/quick-view-modal/messages.js` — NEW
- `overrides/app/components/quick-view-modal/index.jsx` — NEW
- `overrides/app/components/product-tile/index.jsx` — MODIFIED (was transparent re-export)
- `overrides/app/components/_app/index.jsx` — MODIFIED (added QuickViewProvider)
- `package.json` — MODIFIED (added react-error-boundary dependency)
