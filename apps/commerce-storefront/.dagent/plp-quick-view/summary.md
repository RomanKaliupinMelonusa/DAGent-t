---
schemaVersion: 1
producedBy: storefront-dev
producedAt: "2026-05-12T02:30:00.000Z"
---

# PLP Quick View Modal — Implementation Summary

## What was built

A Product Quick View modal triggered from each product tile on the Product List Page (PLP). The modal renders the base PWA Kit `ProductView` component with `showDeliveryOptions={false}` (Pickup/Ship-to-Store deferred), supports variation switching, Add-to-Bag, and on success closes itself and delegates to the existing global `AddToCartModal`.

## Files created/modified

### New files (under `overrides/app/components/quick-view-modal/`)

| File | Purpose |
|------|---------|
| `context.jsx` | `QuickViewProvider`, `QuickViewContext`, `useQuickView` hook — singleton state management |
| `trigger.jsx` | `QuickViewTrigger` — isMounted-gated button overlay on product tiles |
| `modal-shell.jsx` | `QuickViewModalShell` — Chakra Modal wrapper, gated on `isOpen`, with ErrorBoundary |
| `modal-body.jsx` | `QuickViewModalBody` — ProductView + add-to-cart handler + View Full Details link |
| `messages.js` | react-intl `defineMessages` catalog for Quick View strings |
| `index.jsx` | Barrel re-exports for all public symbols |

### Modified files

| File | Change |
|------|--------|
| `overrides/app/components/_app/index.jsx` | Wrapped `BaseApp` in `QuickViewProvider`; injected `QuickViewModalShell` as child of `BaseApp` (inside its provider tree) |
| `overrides/app/components/product-tile/index.jsx` | Changed from transparent re-export to wrapper that renders base `ProductTile` + `QuickViewTrigger` overlay |

## Testid contract

| testid | Element | Where |
|--------|---------|-------|
| `quick-view-trigger-{productId}` | IconButton (one per eligible tile) | `trigger.jsx` |
| `quick-view-modal` | ModalContent (when open) | `modal-shell.jsx` |
| `quick-view-modal-error` | Error fallback Box (on error) | `modal-shell.jsx` |
| `quick-view-add-to-cart-btn` | Add-to-Cart button (imperatively tagged) | `modal-body.jsx` via `useTagCartButton` |
| `quick-view-view-full-details-link` | Link to PDP | `modal-body.jsx` |

## SSR safety

- Trigger uses `isMounted` pattern: button renders SSR-safe, onClick is noop until client mount
- Modal shell gates on `isOpen` (initially `false`): body never mounts during SSR
- No `window`/`document` access in render scope
- `MutationObserver` only used inside `useEffect` (client-only)

## Key architectural decisions

1. **Reuse, don't clone**: ProductView is imported directly from `@salesforce/retail-react-app/app/components/product-view` with `showDeliveryOptions={false}`
2. **`useShopperBasketsMutationHelper`**: Uses the SDK's built-in `addItemToNewOrExistingBasket` helper for create-or-add basket logic
3. **Single AddToCartModal**: Reuses the global confirmation modal via ProductView's internal `useAddToCartModalContext().onOpen()` — no second modal mounted
4. **`useProductViewModal`**: Delegates variation state management to the existing hook
5. **Provider placement**: `QuickViewProvider` wraps `BaseApp`, modal shell rendered inside `BaseApp`'s children (inside `AddToCartModalProvider`, `IntlProvider`, `CommerceApiProvider` etc.)
6. **Set/Bundle exclusion**: Trigger returns `null` when `product.type?.set || product.type?.bundle`
