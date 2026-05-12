---
schemaVersion: 1
producedBy: storefront-dev
producedAt: "2026-05-12T00:15:00.000Z"
---

# PLP Quick View Modal — Implementation Summary

## What was built

A Quick View modal feature for the PLP (Product List Page) that allows shoppers to preview product details and add items to their bag without navigating away from the listing.

## Files created

| File | Purpose |
|---|---|
| `overrides/app/components/quick-view-modal/context.jsx` | `QuickViewProvider` + `useQuickView` hook — manages open/close state and the active product |
| `overrides/app/components/quick-view-modal/trigger.jsx` | `QuickViewTrigger` — button overlay on each product tile, uses `isMounted` pattern for SSR safety |
| `overrides/app/components/quick-view-modal/modal-shell.jsx` | `QuickViewModalShell` — Chakra Modal wrapper with `ErrorBoundary`, gated on `isOpen` |
| `overrides/app/components/quick-view-modal/modal-body.jsx` | `QuickViewModalBody` — renders base `ProductView` with `showDeliveryOptions={false}`, slim add-to-cart handler, "View Full Details" link |
| `overrides/app/components/quick-view-modal/messages.js` | `react-intl` message descriptors for all user-visible strings |
| `overrides/app/components/quick-view-modal/index.jsx` | Barrel re-exports |

## Files modified

| File | Change |
|---|---|
| `overrides/app/components/_app/index.jsx` | Wraps children in `<QuickViewProvider>` and mounts `<QuickViewModalShell />` as a singleton |
| `overrides/app/components/product-tile/index.jsx` | Wraps base `ProductTile` in a `<Box role="group">` and renders `<QuickViewTrigger>` as a sibling overlay |

## Testids exposed

| testid | Element |
|---|---|
| `quick-view-trigger-{productId}` | Trigger button on each eligible tile (per-instance suffix) |
| `quick-view-modal` | `ModalContent` when modal is open |
| `quick-view-modal-error` | Error fallback inside modal |
| `quick-view-add-to-cart-btn` | Add-to-Cart button inside modal (tagged via `useEffect` ref on ProductView's internal button) |
| `quick-view-view-full-details-link` | "View Full Details" `<Link>` inside modal |

## Key design decisions

1. **Reuse over re-implementation**: Base `ProductView` is used directly with `showDeliveryOptions={false}` — no cloned/forked product detail UI.
2. **Add-to-cart via `useShopperBasketsV2MutationHelper`**: Uses the same `addItemToNewOrExistingBasket` helper the PDP uses. Returns items to ProductView so its internal `onAddToCartModalOpen` fires the global confirmation modal.
3. **SSR safety**: Trigger uses `isMounted` pattern (renders the button on SSR with inert `onClick`). Modal shell returns `null` when `!isOpen` so `useProductViewModal`/`useProduct` never run during SSR.
4. **No pickup/ship-to-store UI**: `showDeliveryOptions={false}` on `ProductView` suppresses the entire delivery RadioGroup (FR-004, SC-006).
5. **Set/Bundle exclusion**: Trigger returns `null` for product sets/bundles (FR-014).
6. **Single modal singleton**: The shell is mounted once inside `QuickViewProvider` at the app level; opening Quick View on different tiles replaces `openProduct` state.
7. **Focus restoration**: Delegated to Chakra `Modal`'s `returnFocusOnClose` default behavior.

## SSR safety checklist

- [x] No `window` or `document` access outside `typeof window !== 'undefined'` guards
- [x] `isMounted` pattern on trigger prevents pre-hydration clicks
- [x] Modal body only mounts when `isOpen === true` (never during SSR)
- [x] No `Date.now()` or `Math.random()` in render output
- [x] All components use Chakra UI primitives from `@salesforce/retail-react-app/app/components/shared/ui`
