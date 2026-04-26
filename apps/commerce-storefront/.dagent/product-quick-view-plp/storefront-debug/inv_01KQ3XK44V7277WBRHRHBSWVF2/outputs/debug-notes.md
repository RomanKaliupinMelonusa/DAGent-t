---
schemaVersion: 1
producedBy: storefront-debug
producedAt: 2026-04-26T03:34:50.000Z
---

# Debug Notes: product-quick-view-plp — AddToCartModal crash

## Failure Summary

- **Failing test**: `add-to-cart-from-quick-view` (test 4/5)
- **Error**: `TypeError: Cannot read properties of undefined (reading 'imageGroups')` in `AddToCartModal`
- **Fault domain**: `code-defect`

## Root Cause

The `handleAddToCart` callback in `overrides/app/components/quick-view-modal/index.jsx` called `onAddToCartModalOpen` with an incorrectly shaped `itemsAdded` array.

**Before (broken):**
```js
onAddToCartModalOpen({
    product,
    itemsAdded: [{productId: pid, quantity}],
    selectedQuantity: quantity
})
```

**After (fixed):**
```js
onAddToCartModalOpen({
    product,
    itemsAdded: [{product, variant, quantity}],
    selectedQuantity: quantity
})
```

The base template's `AddToCartModal` (in `@salesforce/retail-react-app/app/hooks/use-add-to-cart-modal.js`, line ~279) destructures each item in `itemsAdded` as `{product, variant, quantity}` and then accesses `product.imageGroups`. When the quick-view-modal only passed `{productId, quantity}`, the destructured `product` was `undefined`, causing the TypeError.

## Reproduction Steps

1. Navigate to PLP at `/category/newarrivals`
2. Hover a product tile to reveal "Quick View" button
3. Click the Quick View button to open the modal
4. Click "Add to Cart" inside the modal
5. **Crash**: The page replaced with PWA Kit error page ("this page isn't working")

## Fix Applied

Single-line change in `overrides/app/components/quick-view-modal/index.jsx` (line 172): pass `{product, variant, quantity}` instead of `{productId: pid, quantity}` in the `itemsAdded` array to match the shape expected by the base template's `AddToCartModal` component.

## Verification

All 5 E2E tests pass after the fix:
- ✓ open-quick-view-modal
- ✓ quick-view-shows-all-controls
- ✓ swatch-selection-updates-image
- ✓ add-to-cart-from-quick-view (previously failing)
- ✓ close-modal-stays-on-plp
