---
schemaVersion: 1
producedBy: storefront-debug
producedAt: 2026-05-11T01:10:00.000Z
---

# Debug Notes — PLP Quick View Modal

## Root Cause (code-defect, FIXED)

The `QuickViewModalBody` component was missing controlled variation state management.
It called `useProductViewModal(openProduct)` without passing `controlledVariationValues`,
and rendered `<ProductView>` without `controlledVariationValues` or `onVariationChange` props.

In a modal context (not on PDP), `ProductView` cannot read variation state from URL
search params. Without controlled variation values:
- Swatch clicks were no-ops (`SwatchGroup.handleChange` defaulted to `noop`)
- Variation selection never updated, so gallery images never changed
- Add-to-cart attempts on master products with unselected variants failed validation

### Fix Applied

Added `useControlledVariations` hook (from `@salesforce/retail-react-app/app/hooks/use-controlled-variations`)
to `modal-body.jsx`, following the same pattern as `BonusProductSelectionModal` in the base PWA Kit.
Passed `controlledVariationValues` to both `useProductViewModal` and `<ProductView>`, and
`handleVariationChange` as `onVariationChange` to `<ProductView>`.

## Remaining Test-Code Issues (2 tests)

### E2E-002: swatch selector too broad

The test uses `modal.locator('[role="radio"]')` which matches ALL radio buttons — both
color AND size swatches. The first PLP product (Floral Shirt Dress, 25688608M) has
**1 color swatch** and **5 size swatches**. `swatches.nth(1)` clicks a size swatch,
which doesn't change the gallery image. Fix: scope selector to `radiogroup "Color"`
children, e.g., `modal.locator('radiogroup:has-text("Color") >> [role="radio"]')`.

### E2E-003: console-error budget incomplete

The test's `BASELINE_NOISE_PATTERNS` includes `/r: 403 Forbidden/` but not
`/Failed to load resource: the server responded with a status of 403 \(Forbidden\)/`.
The latter is baseline noise (count: 4 in baseline.json) triggered by Einstein
recommendation 403s. Fix: add the missing pattern to `BASELINE_NOISE_PATTERNS`.
