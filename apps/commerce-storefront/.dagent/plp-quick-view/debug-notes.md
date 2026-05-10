---
schemaVersion: 1
producedBy: storefront-debug
producedAt: 2026-05-10T20:51:05.000Z
---

# Debug Notes: plp-quick-view E2E Runner Failure

## Summary

All 8 test failures are **test-code** defects in `e2e/plp-quick-view.spec.ts`. The feature implementation is correct — manual verification confirms the add-to-cart flow works end-to-end when a variant is properly selected.

## Root Causes

### 1. Console Error Budget Regex Typo (affects tests 1, 4, 5, 6, 7)

The `BASELINE_NOISE_PATTERNS` regex for the `defaultProps` warning has a missing space:

```
// Current (broken):
/Warning: %s: Support for defaultProps will be removed from function components in a future major release\.Use JavaScript default parameters instead\.%s PageDesignerProvider/

// Actual console message has a space between "release." and "Use":
// "...in a future major release. Use JavaScript default parameters instead.%s PageDesignerProvider"

// Fix:
/Warning: %s: Support for defaultProps will be removed from function components in a future major release\.\s*Use JavaScript default parameters instead/
```

### 2. Add-to-Bag Variant Selection Failure (test 3)

The test cannot select a size variation because it uses wrong selectors for swatch elements:

```typescript
// Test uses (line ~213):
modal.locator('button[aria-label*="size" i], [data-testid*="size"] button, select option')

// Actual DOM structure:
// <div role="radiogroup" aria-label="Size">
//   <a aria-label="4">4</a>
//   <a aria-label="6">6</a>
//   ...
// </div>
```

Swatches are `<a>` elements inside `[role="radiogroup"]`, NOT `<button>` elements. The test fails to select a size, then clicking "Add to Cart" triggers ProductView's validation (`validateAndShowError`) which shows "Please select all your options above" and returns early without calling the `addToCart` prop.

**Verified manually**: When a size IS selected (via the correct `<a>` element), the basket API succeeds (200), the Quick View modal closes, and the confirmation modal opens correctly.

### 3. Tile Click Selector Mismatch (test 8)

```typescript
// Test (line ~378-380):
const tile = page.locator(`[data-testid="sf-product-tile-${productId}"]`).first();
const tileLink = tile.locator('a').first();
await tileLink.click();  // TIMEOUT - no <a> inside the element

// Actual DOM: the element with data-testid="sf-product-tile-*" IS the <a> tag itself
// (BaseProductTile spreads {...rest} including data-testid onto its <Link> root element)
```

Fix: `await tile.click()` instead of `tile.locator('a').first().click()`.

## Verification

```bash
# Manual test proving add-to-cart works when variant is properly selected:
# 1. Open PLP, click quick-view trigger
# 2. Click size "4" in [role="radiogroup"][aria-label="Size"] > a:first-child
# 3. Click "Add to Cart"
# Result: POST /basket → 200, POST /addItemToBasket → 200, modal closes, confirmation opens ✓
```
