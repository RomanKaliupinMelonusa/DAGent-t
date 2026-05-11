---
schemaVersion: 1
producedBy: storefront-debug
producedAt: 2026-05-11T03:20:00.000Z
---

# Debug Notes — plp-quick-view E2E Failures (Attempt 2)

## Root Cause Analysis

Two code-defect bugs in `modal-body.jsx` caused E2E-003 (add-to-bag-from-quick-view) to fail:

### Bug 1: Missing controlled variation management

**File**: `overrides/app/components/quick-view-modal/modal-body.jsx`

The Quick View modal body was passing `product` to `<ProductView>` without
`controlledVariationValues` or `onVariationChange` props. This caused two issues:

1. **Variation state was URL-bound**: `useDerivedProduct` inside `ProductView` used
   `useVariationParams` which reads from URL search params. On the PLP page, there
   are no color/size params in the URL, so no variant was ever resolved.

2. **Swatch clicks would navigate away**: Without `onVariationChange`, clicking a
   color/size swatch in the modal would trigger URL-based navigation (via the
   swatch's `href` prop), navigating away from the PLP.

3. **Add to Cart silently failed**: `validateAndShowError()` inside `ProductView`
   checks `product?.variationAttributes?.length > 0 && !variant` — with no variant
   resolved, it returned `false`, preventing the `addToCart` callback from ever
   being called.

**Fix**: Import and use `useControlledVariations` hook (same pattern used by
`BonusProductViewModal`) to manage variation state via React state. Pass
`controlledVariationValues` to both `useProductViewModal` and `<ProductView>`,
and pass `handleVariationChange` as `onVariationChange`.

### Bug 2: Incomplete `itemsAdded` structure for AddToCartModal

**File**: `overrides/app/components/quick-view-modal/modal-body.jsx`

The `handleAddToCart` callback was building `itemsAdded` as flat
`{productId, quantity}` objects for the basket API. But
`addToCartModalContext.onOpen({itemsAdded})` passes these to the
`AddToCartModal` component, which iterates `itemsAdded` and accesses
`item.product.imageGroups` and `item.variant.variationValues`.

With `itemsAdded = [{productId, quantity}]`, `item.product` was `undefined`,
causing: `TypeError: Cannot read properties of undefined (reading 'imageGroups')`

**Fix**: Build separate `productItems` (flat, for basket API) and `itemsAdded`
(with full product/variant objects, for AddToCartModal). Ensure `imageGroups`
is always present by merging from `openProduct` (PLP search result, which
always includes `imageGroups` via `expand=images`).

## Verification

All 10 E2E tests pass after the fix:
- E2E-001: opens Quick View modal ✓
- E2E-002: switches color swatch ✓
- E2E-003: adds item to bag ✓
- E2E-004a/b/c: close & focus restoration ✓
- E2E-005: no pickup UI ✓
- E2E-006: disabled when no variation ✓
- E2E-007: view full details ✓
- E2E-008: tile click regression ✓
