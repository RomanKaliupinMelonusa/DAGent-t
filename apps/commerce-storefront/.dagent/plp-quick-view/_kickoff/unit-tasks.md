---
description: "Unit test tasks for PLP Product Quick View Modal (Jest + React Testing Library)"
---

# Tasks: PLP Product Quick View Modal — Unit Tests

**Input**: [unit-tests.md](unit-tests.md) (binding contract), [contracts/quick-view-context.md](contracts/quick-view-context.md), [contracts/quick-view-trigger.md](contracts/quick-view-trigger.md), [contracts/quick-view-modal.md](contracts/quick-view-modal.md), [data-model.md](data-model.md)
**Owner session**: **Unit-test agent (Jest + React Testing Library)** — separate from the development session.
**Prerequisite**: The development session has completed [tasks.md](tasks.md) Phases 1–6 (production code shipped with the public surfaces declared in the contracts).

> **Strict rule following.** This session asserts ONLY the cases enumerated in [unit-tests.md](unit-tests.md) §3. NO improvisation, NO additional testids, NO real network calls, NO behaviors that aren't enumerated. If the development session's surface deviates from the contracts, escalate before writing tests around the deviation.

## Format: `[ID] [P?] [Story?] Description`

- File paths are co-located with the units under test, following the project's existing convention.
- `[P]` is allowed when two test files are independent.
- `[Story]` maps loosely to the user stories — but unit cases are organized by module (provider, trigger, shell, body, a11y), not by story, per [unit-tests.md](unit-tests.md) §3.

Test file locations:
- `apps/commerce-storefront/overrides/app/components/quick-view-modal/context.test.jsx`
- `apps/commerce-storefront/overrides/app/components/quick-view-modal/trigger.test.jsx`
- `apps/commerce-storefront/overrides/app/components/quick-view-modal/modal-shell.test.jsx`
- `apps/commerce-storefront/overrides/app/components/quick-view-modal/modal-body.test.jsx`
- `apps/commerce-storefront/overrides/app/components/quick-view-modal/a11y.test.jsx`

---

## Phase 1: Setup

- [ ] T001 Confirm `apps/commerce-storefront/jest.config.js` already covers `overrides/app/**/*.test.{js,jsx}` (it should, via the project's existing PWA Kit `pwa-kit-dev test` config). No config edits should be needed.
- [ ] T002 Establish a small set of canned product fixtures used by multiple test files: a `simpleProduct`, a `masterProductNoSelection`, a `masterProductInStock`, a `masterProductOOS`, a `productSet`, a `productBundle`. Inline these as plain JS objects per test file (do NOT introduce a shared fixture module — strict rule following).
- [ ] T003 Establish a stubbing pattern for SDK hooks via `jest.mock(...)` of:
  - `@salesforce/retail-react-app/app/hooks/use-product-view-modal`,
  - `@salesforce/retail-react-app/app/hooks/use-current-basket`,
  - `@salesforce/retail-react-app/app/hooks/use-add-to-cart-modal`,
  - `@salesforce/commerce-sdk-react` (`useShopperBasketsV2Mutation`).
  Stubs MUST be reset in `beforeEach` so order-independence holds.

---

## Phase 2: Provider tests (`context.test.jsx`)

- [ ] T004 [P] Implement **UT-PROV-001** — provider initial state (`isOpen === false`, `openProduct === null`).
- [ ] T005 [P] Implement **UT-PROV-002** — `openQuickView(product)` flips state.
- [ ] T006 [P] Implement **UT-PROV-003** — `closeQuickView()` resets state.

**Checkpoint**: Three provider cases pass; no extras added.

---

## Phase 3: Trigger tests (`trigger.test.jsx`)

- [ ] T007 [US1] Implement **UT-TRIG-001** — trigger renders for simple product (`data-testid="quick-view-trigger-{id}"` is in DOM).
- [ ] T008 [US1] Implement **UT-TRIG-002** — trigger hidden for product set (`type.set === true` → `null`).
- [ ] T009 [US1] Implement **UT-TRIG-003** — trigger hidden for product bundle (`type.bundle === true` → `null`).
- [ ] T010 [US1] Implement **UT-TRIG-004** — clicking the trigger calls `openQuickView` exactly once with the trigger's product.
- [ ] T011 [US1] Implement **UT-TRIG-005** — click does not propagate to the parent PDP link.
- [ ] T012 [US1] Implement **UT-TRIG-006** — SSR / hydration safety: initial render does not invoke client-only side effects (handler is inert until mounted).

**Checkpoint**: All six trigger cases pass; no extras added.

---

## Phase 4: Modal shell tests (`modal-shell.test.jsx`)

- [ ] T013 [US1] Implement **UT-SHELL-001** — modal NOT rendered when `isOpen === false`.
- [ ] T014 [US1] Implement **UT-SHELL-002** — modal rendered when `isOpen === true`.
- [ ] T015 [US1] Implement **UT-SHELL-003** — close button click invokes `closeQuickView`.
- [ ] T016 [US1] Implement **UT-SHELL-004** — `Escape` keypress invokes `closeQuickView`.
- [ ] T017 [US1] Implement **UT-SHELL-005** — error boundary surfaces `data-testid="quick-view-modal-error"` on body throw; shell remains mounted.

**Checkpoint**: All five shell cases pass; no extras added.

---

## Phase 5: Modal body tests (`modal-body.test.jsx`)

### Rendering & no-ship-to-store

- [ ] T018 [US1] Implement **UT-BODY-001** — renders the product detail component.
- [ ] T019 [US1] Implement **UT-BODY-002** — Pickup-in-Store / Ship-to-Store UI is NOT rendered (`pickup-select-store-msg`, `store-stock-status-msg`, `*=pickup`, regex `/pickup|ship to store|pick up/i`).
- [ ] T020 [US1] Implement **UT-BODY-003** — exposes `data-testid="quick-view-add-to-cart-btn"`.
- [ ] T021 [US4] Implement **UT-BODY-004** — exposes `data-testid="quick-view-view-full-details-link"`.

### Disabled-state rules (deterministic source of truth for FR-009)

- [ ] T022 [US3] Implement **UT-BODY-005** — disabled when no variation selected on a master product.
- [ ] T023 [US3] Implement **UT-BODY-006** — disabled when active variant has `orderable: false`; `inventory-message` visible.
- [ ] T024 [US3] Implement **UT-BODY-007** — disabled when active variant has `inventory.stockLevel === 0`; `inventory-message` visible.
- [ ] T025 [US3] Implement **UT-BODY-008** — enabled when complete in-stock variation is selected.

### Add-to-Bag side effects

- [ ] T026 [US2] Implement **UT-BODY-009** — successful add closes the modal (`closeQuickView` called).
- [ ] T027 [US2] Implement **UT-BODY-010** — successful add invokes `addToCartModalContext.onOpen({ product, itemsAdded, selectedQuantity })`.
- [ ] T028 [US2] Implement **UT-BODY-011** — guest with no basket: `createBasket` called once before `addItemToBasket`; both stubs receive expected args.
- [ ] T029 [US2] Implement **UT-BODY-012** — basket exists: only `addItemToBasket` called once with active variant id and quantity; `createBasket` NOT called.
- [ ] T030 [US2] Implement **UT-BODY-013** — failed add keeps the modal open; `closeQuickView` NOT called; `onOpen` NOT called; inline error visible.
- [ ] T031 [US1] Implement **UT-BODY-014** — detail-fetch failure surfaces `quick-view-modal-error` while keeping the shell mounted.

### Variation interaction

- [ ] T032 [US1] Implement **UT-BODY-015** — switching variation updates the active variant id propagated into the Add-to-Bag handler.

**Checkpoint**: All 15 body cases pass; no extras added.

---

## Phase 6: Accessibility tests (`a11y.test.jsx`)

- [ ] T033 Implement **UT-A11Y-001** — modal element has `aria-labelledby` pointing at the body's heading id (`quick-view-modal-title`).
- [ ] T034 Implement **UT-A11Y-002** — trigger element has `aria-haspopup="dialog"`.
- [ ] T035 Implement **UT-A11Y-003** — focus restored to the originating trigger after the modal closes (use `userEvent` + `document.activeElement`).

**Checkpoint**: All three a11y cases pass.

---

## Phase 7: Polish

- [ ] T036 Run the full suite via `npm test --workspace apps/commerce-storefront -- product-quick-view` (or `pwa-kit-dev test`). All cases MUST pass; the count of `it(...)` blocks MUST equal the count of cases enumerated in [unit-tests.md](unit-tests.md) §3 (no extras, no omissions). Intentional skips MUST be `it.skip(...)` with a comment citing the reason and MUST be flagged back to the development session.
- [ ] T037 [P] Verify no console.error / console.warn leaks beyond the project's existing tolerated baseline.
- [ ] T038 Hand-off: report the suite result back to the orchestrator (PASS / case count / any escalations to the development session).

---

## Dependencies

```
Phase 1 (Setup) → Phase 2 (provider) ┐
                  Phase 3 (trigger)  ├─► all parallelizable across files
                  Phase 4 (shell)    │
                  Phase 5 (body)     │
                  Phase 6 (a11y)     ┘
                  → Phase 7 (Polish)
```

Phases 2–6 each touch a different test file, so once Phase 1 is done they can proceed in parallel (one test file each).

## Out of scope for this file

- Production code changes (development session — see [tasks.md](tasks.md)).
- E2E tests (E2E session — see [e2e-tasks.md](e2e-tasks.md)).
- Adding cases beyond the enumeration in [unit-tests.md](unit-tests.md) §3.
