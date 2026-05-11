---
schemaVersion: 1
producedBy: storefront-debug
producedAt: 2026-05-11T21:03:48.121Z
---

# Debug Notes: PLP Quick View Modal — E2E Runner Failure

## Root Cause

Two issues caused all E2E tests to fail:

### Issue 1: Server OOM crash (all tests 500)
The dev server's SSR child process crashed with `FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory`, causing all requests to `/category/womens-clothing-dresses` to return 500 errors with `ENOENT: no such file or directory, open 'build/loadable-stats.json'`. The webpack build artifacts were incomplete.

**Fix**: Restarted the dev server with `NODE_OPTIONS="--max-old-space-size=4096"` and rebuilt.

### Issue 2: Add-to-Cart flow race condition (E2E-003)
After fixing the server, E2E-003 (`add to bag from quick view`) still failed. Two code defects in `modal-body.jsx`:

#### 2a. `closeQuickView()` called before `onAddToCartModalOpen`
The `handleAddToCart` callback called `closeQuickView()` after the basket mutation succeeded but BEFORE returning to `ProductView`. `ProductView`'s internal handler needs the return value to call `onAddToCartModalOpen()`, but `closeQuickView()` unmounts the entire modal (including `ProductView`) via `QuickViewModalShell` returning null when `isOpen === false`. This race prevented the add-to-cart confirmation modal from ever opening.

**Fix**: Removed `closeQuickView()` from `handleAddToCart`. Added a `useEffect` that watches `useAddToCartModalContext().isOpen` — when the confirmation modal opens, the effect closes the Quick View modal.

#### 2b. Missing `controlledVariationValues` for modal context
`ProductView` uses `useDerivedProduct` which reads variation selections from URL params by default. In a modal (not on the PDP), there are no variation URL params, so `variant` was always null. This meant:
- `validateOrderability()` rejected clicks (no variant selected) → no basket request was made
- Variation swatches didn't properly track selection state

**Fix**: Added local `variationValues` state managed via `useState({})` and `handleVariationChange` callback. Passed `controlledVariationValues={variationValues}` and `onVariationChange={handleVariationChange}` to `ProductView`, enabling proper modal-context variant management.

## Files Changed

- `overrides/app/components/quick-view-modal/modal-body.jsx` — both fixes applied

## Verification

All 10 E2E tests: 8 passed, 2 skipped (conditional runtime skips for E2E-002 color swatch and E2E-006 OOS variant — expected per test contract).
