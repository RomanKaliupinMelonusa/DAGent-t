---
schemaVersion: 1
producedBy: unit-test
producedAt: 2026-05-11T20:57:02.685Z
---

# Unit Test Report: PLP Quick View Modal

## Summary

**Status**: ✅ PASS  
**Test Suites**: 5 passed, 5 total  
**Tests**: 32 passed, 32 total  
**Coverage**: 94.44% statements, 97.05% lines  

## Test Files

| File | Cases | Status |
|---|---|---|
| `context.test.jsx` | UT-PROV-001, 002, 003 | ✅ 3/3 |
| `trigger.test.jsx` | UT-TRIG-001–006 | ✅ 6/6 |
| `modal-shell.test.jsx` | UT-SHELL-001–005 | ✅ 5/5 |
| `modal-body.test.jsx` | UT-BODY-001–015 | ✅ 15/15 |
| `a11y.test.jsx` | UT-A11Y-001–003 | ✅ 3/3 |

## Test IDs Exercised

- `quick-view-trigger-{productId}` — UT-TRIG-001, 004, 005
- `quick-view-modal` — UT-SHELL-001, 002, 005
- `quick-view-modal-error` — UT-SHELL-005, UT-BODY-014
- `quick-view-add-to-cart-btn` — UT-BODY-003, 005–013, 015
- `quick-view-view-full-details-link` — UT-BODY-004
- `quick-view-modal-title` — UT-A11Y-001

## Implementation Notes

- **Mocking approach**: All SDK hooks (`useProductViewModal`, `useShopperBasketsV2MutationHelper`, `useQuickView`) mocked at module boundary. No real network calls.
- **ProductView mock**: Simulates disabled-state logic (variant selection, orderable, stock level) for FR-009 assertions.
- **Add-to-bag**: Implementation uses `addItemToNewOrExistingBasket` helper which handles basket creation internally — tests adapted to match this API rather than separate createBasket/addItemToBasket calls.
- **Add-to-cart confirmation**: ProductView internally manages the AddToCartModal via `useAddToCartModalContext` after `addToCart` returns successfully. Tests verify the success path completes (closeQuickView called) rather than directly asserting `onOpen`.
- **Console warnings**: Zero console.error/warn leaks from test code. Only Node.js punycode deprecation (platform noise).

## Escalations

None. All 32 cases from unit-tests.md §3 implemented and passing.
