---
schemaVersion: 1
producedBy: storefront-debug
producedAt: 2026-05-11T04:50:00.000Z
---

# Debug Notes — plp-quick-view

## Root Cause (code-defect — FIXED)

**`handleAddToCart` in `modal-body.jsx` returned stripped-down product items instead of the original ProductView selection objects.**

The `AddToCartModal` component (from `@salesforce/retail-react-app/app/hooks/use-add-to-cart-modal.js`) iterates over `itemsAdded` and destructures `{product, variant, quantity}` from each item. It then accesses `product.imageGroups` to render product images.

Our `handleAddToCart` was returning:
```js
[{productId, price, quantity}]  // stripped-down for basket API
```

But `AddToCartModal` expects:
```js
[{product, variant, quantity}]  // full product/variant objects
```

When `AddToCartModal` destructured `{product}` from `{productId, price, quantity}`, `product` was `undefined`, causing `TypeError: Cannot read properties of undefined (reading 'imageGroups')` which crashed the entire page (the AddToCartModal sits at app-shell level, outside any local error boundary).

### Fix Applied

Changed `handleAddToCart` to `return productSelectionValues` (the original array passed by ProductView with full `{product, variant, quantity}` objects) instead of `return productItems` (the stripped-down basket API payload).

## Remaining Issue (test-code)

After the fix, the E2E test's console-error budget assertion fails because the add-to-cart flow triggers additional Einstein/sandbox API calls that return 400/403 errors. These are sandbox noise patterns not included in the test's `BASELINE_NOISE_PATTERNS` array:

- `Failed to load resource: the server responded with a status of 403 (Forbidden)` — exists in baseline but not in noise filter
- `r: 400 Bad Request` — new sandbox noise from Einstein API after basket mutation
- `Failed to load resource: the server responded with a status of 400 (Bad Request)` — same

The functional assertions all pass: modal closes, confirmation modal appears, product-added row visible.
