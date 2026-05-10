---
schemaVersion: 1
producedBy: storefront-debug
producedAt: 2026-05-10T22:14:07.748Z
---

# Debug Notes — PLP Quick View Modal

## Code Defects Fixed

### 1. Missing `quick-view-add-to-cart-btn` testid (E2E-003, E2E-006)
- **Root cause**: The `ProductView` base component renders its Add to Cart button internally without a `data-testid`. The dev node did not add the contract-required `quick-view-add-to-cart-btn` testid.
- **Fix**: Added `useTagAddToCartButton` hook in `modal-body.jsx` that uses a `MutationObserver` to tag the first Add to Cart button rendered by ProductView with `data-testid="quick-view-add-to-cart-btn"`. Tags only the first instance (ProductView renders the button twice — desktop + mobile sticky bar) to avoid Playwright strict-mode violations.
- **File**: `overrides/app/components/quick-view-modal/modal-body.jsx`

### 2. Close button missing accessible name (E2E-004b)
- **Root cause**: `ModalCloseButton` had `aria-label={undefined}`, which removed Chakra's default "Close" aria-label. The E2E test looks for `button { name: /close/i }`.
- **Fix**: Removed `aria-label={undefined}` from `ModalCloseButton` so the default "Close" label is preserved.
- **File**: `overrides/app/components/quick-view-modal/modal-shell.jsx`

## Remaining Failures (Test-Code Issues)

### E2E-002: switch color swatch in Quick View
- **Diagnosis**: The test uses `modal.getByRole('radio')` to get ALL radio buttons (both color and size swatches). It clicks the second radio (index 1), expecting the gallery image to change. However, if the first product has only one color variant, the second radio is a SIZE swatch — and size changes do not affect the product image.
- **Fix needed in test**: Scope the radio selector to the COLOR radiogroup specifically: `modal.getByRole('radiogroup', { name: /color/i }).getByRole('radio')`.

### E2E-003: add to bag from Quick View
- **Diagnosis**: The test's variation selection logic is broken. It uses `modal.getByRole('radio')` to get ALL radios (color + size), then clicks the first non-disabled one and breaks. For the "Floral Shirt Dress" product, the first non-disabled radio is the already-selected color swatch "Ivory Multi". Size remains unselected. When ATC is clicked, ProductView's `validateAndShowError()` prevents the add-to-cart call because variation is incomplete ("Please select all your options above" message is visible). The `handleAddToCart` is never invoked, so `closeQuickView()` never runs.
- **Fix needed in test**: Select a complete variation — iterate through EACH radiogroup (color, then size) and select options in each. Example:
  ```typescript
  // Select first available option in each radiogroup
  const radiogroups = await modal.getByRole('radiogroup').all();
  for (const group of radiogroups) {
    const options = group.getByRole('radio');
    const count = await options.count();
    for (let i = 0; i < count; i++) {
      const opt = options.nth(i);
      if (!(await opt.isDisabled().catch(() => true))) {
        await opt.click();
        break;
      }
    }
  }
  ```

### E2E-006: add to bag disabled when variation unavailable
- **Diagnosis**: The test expects `quick-view-add-to-cart-btn` to have a `disabled` attribute before variation selection. However, the base `ProductView` component does NOT disable the button when variation is incomplete — it validates on click and shows "Please select all your options above". The button's `isDisabled` prop is driven by `showInventoryMessage` (OOS detection), not variation completeness.
- **Fix needed in test**: Instead of asserting `toBeDisabled()`, assert that clicking the button when variation is incomplete does NOT close the modal (the current behavior). Or, the test could assert that the "Please select all your options above" message appears after clicking ATC without complete selection.
