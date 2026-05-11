---
schemaVersion: 1
producedBy: storefront-debug
producedAt: 2026-05-11T17:35:00.000Z
---

# Debug Notes: PLP Quick View E2E Failures

## Fixed: E2E-003 (add-to-bag-from-quick-view)

**Root cause**: `handleAddToCart` in `modal-body.jsx` was passing `productItems` 
(format: `{productId, price, quantity}`) as `itemsAdded` to the `AddToCartModal`.
The `AddToCartModal` component iterates `itemsAdded` and destructures each entry 
as `{product, variant, quantity}`, then accesses `product.imageGroups`, 
`product.variationAttributes`, and `variant.variationValues`.

With the wrong format, `product` was `undefined`, causing:
`TypeError: Cannot read properties of undefined (reading 'imageGroups')`

This crashed the AddToCartModal, preventing it from rendering after a 
successful basket add.

**Fix**: Changed `itemsAdded` to `[{product: productSnapshot, variant: currentVariant, quantity: currentQuantity}]` — matching the format ProductView's internal `handleAddToCart` uses.

## Remaining: E2E-002 (switch-color-swatch-in-quick-view)

**Root cause**: Test-code issue. The test calls `swatches.nth(1)` expecting to 
click a different COLOR swatch. However, the first product tile on the 
dresses PLP (product 25688608M, "Ivory Multi" dress) has only ONE color 
option. The 6 radio buttons in the modal are:
- radio 0: "Ivory Multi" (color, pre-selected)
- radio 1: "4" (size, pre-selected)  
- radio 2-5: sizes "6", "8", "10", "16"

Clicking `nth(1)` clicks size "4", which is already selected and doesn't 
change the product image. The test expects the image to change, which only 
happens when switching COLORS, not sizes.

**Recommended fix for E2E author**: The test should specifically identify 
color swatches (vs size swatches) and skip if <2 colors are available. 
One approach: locate the swatch group that contains color-named labels 
(not numeric size labels), or use the `name` attribute / parent `fieldset`
to distinguish color from size radio groups.
