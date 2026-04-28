---
schemaVersion: 1
producedBy: storefront-debug
producedAt: 2026-04-28T23:20:00Z
---

# Product Quick View — Debug Notes

## Triage Summary

- **Failing item:** e2e-runner (3/6 tests failing → 0 passed initially)
- **Triage domain:** code-defect
- **Prior attempts:** 0

## Root Cause Analysis

Three distinct code defects were identified and fixed:

### 1. `data-testid` mismatch on Quick View trigger (FIXED)

**File:** `overrides/app/components/product-tile/index.jsx`

The product tile override used `data-testid={`quick-view-trigger-${productId}`}` (per-instance suffix), but the acceptance contract declares `testid: quick-view-trigger` with `cardinality: many`. The E2E tests use `page.getByTestId('quick-view-trigger').first()` which requires an exact match.

**Fix:** Changed to bare `data-testid="quick-view-trigger"` per the acceptance contract's cardinality: many declaration.

### 2. `itemsAdded` format crash in AddToCartModal (FIXED)

**File:** `overrides/app/components/quick-view-modal/index.jsx`

The `handleAddToCart` callback passed `itemsAdded: [{productId, quantity}]` to `onAddToCartModalOpen()`, but the base `AddToCartModal` component destructures each item as `{product, variant, quantity}` and accesses `product.imageGroups`. Since `product` was `undefined` in the item, this caused `TypeError: Cannot read properties of undefined (reading 'imageGroups')` which crashed the entire page.

**Fix:** Changed to `itemsAdded: [{product, variant, quantity}]` matching the base `ProductView`'s calling convention.

### 3. Missing `color-swatch` testid in Quick View modal (FIXED)

**File:** `overrides/app/components/quick-view-modal/index.jsx`

The acceptance contract flow `switch-color-swatch-in-quick-view` references `testid: color-swatch`, but the base `Swatch` component renders without a `data-testid`. The E2E test uses `page.getByTestId('color-swatch').nth(1)` which must find elements.

**Fix:** Added a `useEffect` in `QuickViewContent` that post-render tags color swatch buttons (matching `button[role="radio"][aria-label]`) inside the modal with `data-testid="color-swatch"`. This is modal-scoped to avoid polluting PLP tile swatches.

## Remaining Test Failure (test-code issue)

### add-to-bag-from-quick-view — console error budget assertion

The test's `BASELINE_NOISE_PATTERNS` array (derived from `baseline.json` persistent entries) does not include `Failed to load resource: the server responded with a status of 403 (Forbidden)`. This 403 error is present in the baseline JSON but was NOT tagged as `volatility: persistent` because it falls outside the closed allowlist (rule #5 matches `r: 403 Forbidden` but not Chrome's `Failed to load resource` variant).

The add-to-cart flow itself works correctly — the modal opens, the item is added, the AddToCartModal confirmation appears. Only the console error budget assertion fails.

**Recommendation:** The E2E author should add `/Failed to load resource: the server responded with a status of 403 \(Forbidden\)/` to `BASELINE_NOISE_PATTERNS`. The baseline JSON entry exists at `console_errors[].pattern` but lacks `volatility: persistent` due to the closed allowlist rule.

## Verification Results

After fixes, 5/6 tests pass:
- ✅ open-quick-view-from-tile
- ✅ switch-color-swatch-in-quick-view
- ✅ close-quick-view-restores-focus
- ✅ no-pickup-ui-in-quick-view
- ✅ add-to-bag-disabled-when-unavailable
- ❌ add-to-bag-from-quick-view (console error budget — test-code issue)
