# Unit Test Specification: PLP Product Quick View Modal

**Feature**: [spec.md](spec.md)
**Branch**: `001-plp-quick-view`
**Status**: Draft — to be implemented in a **separate agent session**
**Owner of execution**: Downstream unit-test agent session (do NOT implement these tests as part of the main development session)

> **Why this lives in its own file.** The user has explicitly requested the unit test work be done by a separate agentic coding session to avoid hallucination and to enforce strict rule following. This document is the contract that session consumes. The development session that implements `spec.md` MUST NOT also author the unit tests — it should only ensure the components, hooks, and context surfaces enumerated below exist with the documented public shapes so unit tests can target them deterministically.

## 1. Tooling & conventions

- **Framework**: Jest + React Testing Library (already configured for this app — see `apps/commerce-storefront/jest.config.js` and `babel.config.js`).
- **File location**: co-located `*.test.jsx` / `*.test.tsx` next to the unit under test, following the existing convention in `apps/commerce-storefront/overrides/app/` and `apps/commerce-storefront/build/` (whichever the project applies for the production source). New test files for this feature SHOULD live alongside the new override files for the Quick View provider, trigger, and modal body.
- **Mocking posture**: The unit-test session MUST stub all SDK-backed hooks and context (e.g., the product detail hook, basket mutation hooks, and the global add-to-cart modal context). Tests MUST NOT make real network calls and MUST NOT depend on the running dev server.
- **Strict rule following** (per user request): Tests MUST assert ONLY behaviors enumerated in §3 below. The agent session implementing these tests MUST NOT invent additional assertions, additional testids, or behaviors not specified in `spec.md` / this file. If a test cannot be authored without inferring undocumented behavior, escalate back instead of guessing.

## 2. Public surfaces the development work MUST expose

The development session implementing `spec.md` MUST expose the following surfaces with stable identifiers so unit tests can render and assert against them deterministically. Each is named conceptually; the development session owns the exact module paths and exports as long as they remain importable and stable for tests.

- A **Quick View provider** that owns `{ isOpen, openProduct, openQuickView, closeQuickView }`.
- A **Quick View trigger** component used by product tiles, which receives a product summary and renders a button with `data-testid="quick-view-trigger-{productId}"`. The trigger MUST NOT render for products whose `type.set` or `type.bundle` is truthy.
- A **Quick View modal shell** that mounts the modal container only when `isOpen === true`, exposes `data-testid="quick-view-modal"`, and wraps its body in an error boundary whose fallback element exposes `data-testid="quick-view-modal-error"`.
- A **Quick View modal body** that:
  - reads the active product from the provider,
  - renders the existing product-detail component WITHOUT the Pickup-in-Store / Ship-to-Store UI (i.e., the equivalent of `showDeliveryOptions={false}`),
  - exposes the Add-to-Bag button under `data-testid="quick-view-add-to-cart-btn"`,
  - exposes the "View Full Details" link under `data-testid="quick-view-view-full-details-link"`,
  - on a successful add, calls the closure operation on the provider AND invokes the global add-to-cart confirmation modal's `onOpen({product, itemsAdded, selectedQuantity})`.

These shapes are the test contract. If the development session needs to deviate, the unit-test session MUST be re-spec'd before the deviation lands.

## 3. Required unit test cases

Each case below is independently testable. Each case lists `Given / When / Then` for clarity and the assertion(s) it MUST make. Numbering is stable.

### Provider & state

**UT-PROV-001 — provider initial state**
Given the Quick View provider is rendered with no children action, Then `isOpen` is `false` and `openProduct` is `null`.

**UT-PROV-002 — `openQuickView(product)` opens with that product**
Given an unopened provider, When `openQuickView(product)` is called with a sample product, Then `isOpen === true` AND `openProduct === product`.

**UT-PROV-003 — `closeQuickView()` resets state**
Given the provider has been opened, When `closeQuickView()` is called, Then `isOpen === false` AND `openProduct === null`.

### Trigger

**UT-TRIG-001 — trigger renders for simple product**
Given a simple product summary, When the trigger renders, Then a button with `data-testid="quick-view-trigger-{productId}"` is in the DOM.

**UT-TRIG-002 — trigger hidden for product set**
Given a product whose `type.set === true`, When the trigger renders, Then no element with `data-testid` matching `quick-view-trigger-` is rendered.

**UT-TRIG-003 — trigger hidden for product bundle**
Given a product whose `type.bundle === true`, When the trigger renders, Then no element with `data-testid` matching `quick-view-trigger-` is rendered.

**UT-TRIG-004 — trigger calls `openQuickView` with the product**
Given a trigger wired through the provider, When the user clicks it, Then the provider's `openQuickView` is called once with the trigger's product as the argument.

**UT-TRIG-005 — trigger does not navigate**
Given a trigger sibling to the tile's PDP link, When the user clicks the trigger, Then the click does not propagate to the navigation link (no router push, no `<a>` activation).

**UT-TRIG-006 — trigger SSR / hydration safety**
Given the trigger is rendered in a non-mounted (server-like) environment, When initial render occurs, Then it does not throw and does not invoke any client-only side effect (the test should reproduce the `isMounted` pattern: button content/handlers are inert until mounted).

### Modal shell

**UT-SHELL-001 — modal not rendered when closed**
Given `isOpen === false`, Then no element with `data-testid="quick-view-modal"` is in the DOM.

**UT-SHELL-002 — modal rendered when open**
Given `isOpen === true`, Then exactly one element with `data-testid="quick-view-modal"` is in the DOM.

**UT-SHELL-003 — close button calls `closeQuickView`**
Given the modal is open, When the user clicks the modal's close control, Then `closeQuickView` is called.

**UT-SHELL-004 — `Escape` key calls `closeQuickView`**
Given the modal is open, When `keydown` Escape fires, Then `closeQuickView` is called.

**UT-SHELL-005 — error boundary surfaces `quick-view-modal-error`**
Given the modal body throws on render, When the shell renders, Then an element with `data-testid="quick-view-modal-error"` is shown AND the modal does not crash the parent tree.

### Modal body — rendering & no ship-to-store

**UT-BODY-001 — renders the product detail component**
Given a valid product is open, When the body renders, Then the product-detail component is in the DOM.

**UT-BODY-002 — Pickup-in-Store / Ship-to-Store UI is not rendered**
Given the modal body renders, Then no element matching any of these is present:
- `data-testid="pickup-select-store-msg"`
- `data-testid="store-stock-status-msg"`
- any `data-testid` containing the substring `pickup`
- any element whose text content matches the regex `/pickup|ship to store|pick up/i`.

**UT-BODY-003 — exposes Add-to-Bag testid**
Given the modal body renders, Then exactly one element with `data-testid="quick-view-add-to-cart-btn"` is in the DOM.

**UT-BODY-004 — exposes View Full Details testid**
Given the modal body renders, Then exactly one element with `data-testid="quick-view-view-full-details-link"` is in the DOM.

### Modal body — Add-to-Bag enable/disable rules (deterministic source of truth for `spec.md` FR-009)

**UT-BODY-005 — disabled when no variation selected on a master product**
Given a master product with unselected variation, Then `quick-view-add-to-cart-btn` has the `disabled` attribute set.

**UT-BODY-006 — disabled when active variant has `orderable: false`**
Given a complete variation selection where the active variant returns `orderable: false`, Then `quick-view-add-to-cart-btn` is disabled AND an `inventory-message` testid is visible.

**UT-BODY-007 — disabled when active variant has zero inventory**
Given a complete variation selection where `inventory.stockLevel === 0`, Then `quick-view-add-to-cart-btn` is disabled AND `inventory-message` is visible.

**UT-BODY-008 — enabled when complete in-stock variation is selected**
Given a complete variation selection where the active variant is `orderable: true` AND `inventory.stockLevel > 0`, Then `quick-view-add-to-cart-btn` is NOT disabled.

### Modal body — Add-to-Bag side effects

**UT-BODY-009 — successful add closes the modal**
Given a valid in-stock variation and a stubbed successful add, When the user clicks `quick-view-add-to-cart-btn`, Then `closeQuickView` is called.

**UT-BODY-010 — successful add invokes global add-to-cart confirmation**
Given the same as UT-BODY-009, Then the stubbed global add-to-cart modal's `onOpen` is called once with `{ product, itemsAdded, selectedQuantity }` reflecting the user's selection.

**UT-BODY-011 — guest with no basket: createBasket then addItemToBasket**
Given a guest shopper and no current basket, When the user clicks Add-to-Bag, Then the create-basket mutation is invoked exactly once before the add-item mutation, AND both stubs receive the expected args.

**UT-BODY-012 — basket exists: only addItemToBasket**
Given a current basket exists, When the user clicks Add-to-Bag, Then the create-basket mutation is NOT called AND the add-item mutation is called exactly once with the active variant id and quantity.

**UT-BODY-013 — failed add keeps the modal open**
Given the add-item mutation rejects, When the user clicks Add-to-Bag, Then `closeQuickView` is NOT called AND the global add-to-cart modal's `onOpen` is NOT called AND an inline error message is visible inside `quick-view-modal`.

**UT-BODY-014 — detail fetch failure surfaces error fallback**
Given the product-detail hook is stubbed to reject, When the modal body renders, Then `quick-view-modal-error` is visible AND the modal as a whole remains rendered (i.e., does not unmount the shell).

### Modal body — variation interaction

**UT-BODY-015 — switching variation updates active variant**
Given the modal body is rendered with multiple color swatches, When the user clicks a different swatch, Then the active variant id reflected to the Add-to-Bag handler updates accordingly. (No assertion on image url because that is the responsibility of the existing product-view component being reused — only assert the variant identity propagation.)

### Accessibility

**UT-A11Y-001 — modal has `aria-labelledby`**
Given the modal is open with a known product heading, Then the modal element has an `aria-labelledby` attribute pointing at the product heading element's `id`.

**UT-A11Y-002 — trigger has `aria-haspopup="dialog"`**
Given the trigger is rendered, Then it has `aria-haspopup="dialog"`.

**UT-A11Y-003 — focus restored to trigger on close**
Given the modal opened from a focused trigger, When the modal closes, Then the originating trigger receives focus back. (Implementation note: this can be asserted via React Testing Library's `userEvent` and `document.activeElement`.)

## 4. Negative-space rules (strict rule following)

The unit-test session MUST NOT:

- Add tests for behaviors that are not in §3.
- Introduce new testids beyond those in `spec.md` / `contracts/e2e-tests.md` / this file.
- Test the existing reused product-detail component's internal behavior — the contract is "we render it with delivery options off"; deeper coverage belongs to the upstream package.
- Invoke any real network call, even via fetch polyfill — all hooks MUST be stubbed at module boundary.
- Skip cases marked above as "MUST". If a case cannot be implemented because the development session's surface diverged from §2, escalate before improvising.

## 5. Acceptance for the unit-test session

The session is complete when:

1. Each case in §3 has a corresponding `it(...)` (or `test(...)`) block whose body asserts only what that case prescribes.
2. All stubs and mocks are scoped per-test (`beforeEach` reset) so tests are deterministic and order-independent.
3. The whole suite passes locally via the project's standard Jest invocation (e.g., `npm test --workspace apps/commerce-storefront -- product-quick-view`).
4. There are no console.error / console.warn leaks beyond what the project's existing test config tolerates.
5. The number of test cases matches the number of items in §3 (no extras, no omissions). If an item is intentionally skipped, it MUST be `it.skip(...)` with a comment citing the reason; intentional skips MUST be flagged back to the development session.
