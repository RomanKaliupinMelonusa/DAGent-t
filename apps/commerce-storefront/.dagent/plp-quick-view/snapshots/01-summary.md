---
schemaVersion: 1
producedBy: storefront-dev
producedAt: 2026-05-11T02:24:26Z
---

# PLP Quick View Modal — Implementation Summary

## Overview

Implemented a Quick View modal triggered from product tiles on the PLP. The modal renders the base PWA Kit `ProductView` with `showDeliveryOptions={false}` (Ship-to-Store deferred), supports variation switching and Add-to-Bag, and on success closes itself and hands off to the existing global `AddToCartModal`.

## Files Modified

| File | Action | Description |
|------|--------|-------------|
| `overrides/app/components/_app/index.jsx` | MODIFIED | Mounted `QuickViewProvider` and `QuickViewModalShell` inside BaseApp's children (inside `AddToCartModalProvider`) |
| `overrides/app/components/product-tile/index.jsx` | MODIFIED | Wrapped base `ProductTile` with `QuickViewTrigger` overlay |

## Files Created

| File | Description |
|------|-------------|
| `overrides/app/components/quick-view-modal/context.jsx` | `QuickViewContext`, `QuickViewProvider`, `useQuickView` hook |
| `overrides/app/components/quick-view-modal/trigger.jsx` | `QuickViewTrigger` button with `isMounted` pattern, set/bundle exclusion |
| `overrides/app/components/quick-view-modal/modal-shell.jsx` | Chakra `Modal` shell with `ErrorBoundary` fallback, gated on `isOpen` |
| `overrides/app/components/quick-view-modal/modal-body.jsx` | `ProductView` rendering, Add-to-Bag handler, View Full Details link |
| `overrides/app/components/quick-view-modal/messages.js` | `react-intl` `defineMessages` catalog for all Quick View strings |
| `overrides/app/components/quick-view-modal/index.jsx` | Barrel re-exports |

## Data-Testid Contract

| testid | Element | Notes |
|--------|---------|-------|
| `quick-view-trigger-{productId}` | `IconButton` on each eligible tile | Hidden for sets/bundles |
| `quick-view-modal` | `ModalContent` | Visible when modal is open |
| `quick-view-modal-error` | Error fallback `Box` | Visible on fetch/render error |
| `quick-view-add-to-cart-btn` | Add-to-Cart `Button` inside modal | Applied via DOM observation; mirrors disabled state from ProductView |
| `quick-view-view-full-details-link` | `Link` below ProductView | Navigates to PDP and closes modal |

## Architecture Decisions

1. **Reuse, not clone**: Uses base `ProductView` directly with `showDeliveryOptions={false}` — no forked product view.
2. **`useShopperBasketsV2MutationHelper`**: Uses the SDK's `addItemToNewOrExistingBasket` helper for basket create-or-add logic, matching the PDP pattern.
3. **SSR-safe**: Trigger uses `isMounted` pattern; modal body gated on `{isOpen && <ModalShell>}`; no browser APIs in render scope.
4. **Provider placement**: `QuickViewProvider` wraps children inside `BaseApp` (not outside it), so the modal body has access to `AddToCartModalProvider` and other SDK providers.
5. **Add-to-Cart button testid**: Applied via `MutationObserver` on the modal body container because the button is rendered internally by `ProductView` and can't receive props directly.
6. **Confirmation modal handoff**: `handleAddToCart` returns `undefined` to prevent `ProductView` from opening the modal, then explicitly calls `addToCartModalContext.onOpen(...)` after closing the Quick View modal.

## SSR Safety Checklist

- [x] No `window` or `document` access outside guards or `useEffect`
- [x] No browser-only APIs in `getProps()` or render scope
- [x] No `Date.now()` or `Math.random()` in render output
- [x] All new components import from `@salesforce/retail-react-app/app/components/shared/ui`
- [x] Modal body only mounts when `isOpen === true` (never during SSR)
- [x] Trigger renders deterministically on server (button with stable text, inert onClick)
