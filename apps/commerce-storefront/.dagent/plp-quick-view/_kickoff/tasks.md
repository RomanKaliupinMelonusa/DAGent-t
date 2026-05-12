---
description: "Development tasks for PLP Product Quick View Modal (Salesforce PWA Kit)"
---

# Tasks: PLP Product Quick View Modal — Development

**Input**: Design documents from `apps/commerce-storefront/specs/001-plp-quick-view/`
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)
**Owner session**: **Main development agent** (Salesforce PWA Kit override implementation)

> **Three sessions, three task files.** This file covers ONLY the production code.
> - E2E tasks → [e2e-tasks.md](e2e-tasks.md)
> - Unit-test tasks → [unit-tasks.md](unit-tasks.md)
>
> The development session **MUST NOT author E2E or unit tests**. Its only obligation toward those sessions is to expose the testids and module shapes enumerated in [contracts/e2e-tests.md](contracts/e2e-tests.md), [contracts/quick-view-trigger.md](contracts/quick-view-trigger.md), [contracts/quick-view-modal.md](contracts/quick-view-modal.md), and [contracts/quick-view-context.md](contracts/quick-view-context.md).

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks).
- **[Story]**: Which user story (US1–US4 from `spec.md`) the task delivers against. Setup / foundational / polish tasks have no story label.
- Each task includes the exact file path the agent must touch.

User stories from `spec.md`:
- **US1** — Preview product without leaving the PLP (P1, MVP).
- **US2** — Add to bag from Quick View (P1).
- **US3** — Avoid invalid add-to-bag attempts (disabled-state UX) (P2).
- **US4** — "View Full Details" navigation to PDP (P3).

Path conventions: All work happens under `apps/commerce-storefront/overrides/app/`. Paths below are workspace-relative.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Scaffold the new override directory and the i18n catalog so subsequent phases can fill in real implementations without filesystem churn.

- [ ] T001 Create directory `apps/commerce-storefront/overrides/app/components/quick-view-modal/` (no files yet).
- [ ] T002 [P] Create empty `apps/commerce-storefront/overrides/app/components/quick-view-modal/index.jsx` as a barrel that will re-export `QuickViewProvider`, `useQuickView`, `QuickViewTrigger` (placeholder exports for now — fill in as later tasks ship the real symbols).
- [ ] T003 [P] Create `apps/commerce-storefront/overrides/app/components/quick-view-modal/messages.js` with a `react-intl` `defineMessages` block for: `triggerLabel`, `triggerAriaLabelMobile`, `closeLabel`, `viewFullDetailsLabel`, `errorFallback`. IDs MUST be stable and namespaced (e.g., `commerce-storefront.quickView.*`).

**Checkpoint**: New override directory exists; i18n catalog is in place so subsequent components can import message descriptors without churn.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build the Quick View context provider and mount it at the app shell. Every user story below depends on this.

⚠️ **CRITICAL**: No user-story work begins until this phase is complete.

- [ ] T004 Implement `apps/commerce-storefront/overrides/app/components/quick-view-modal/context.jsx` exporting `QuickViewContext`, `QuickViewProvider`, `useQuickView` exactly as specified in [contracts/quick-view-context.md](contracts/quick-view-context.md). Provider state is `useState` only; `useQuickView` throws when used outside the provider.
- [ ] T005 Modify `apps/commerce-storefront/overrides/app/components/_app/index.jsx` to wrap `<BaseApp>` (or place inside the existing provider chain) with `<QuickViewProvider>`. The provider MUST sit inside any commerce/SDK provider that the modal body's hooks depend on (`useShopperBasketsMutation`, `useCurrentBasket`, `useAddToCartModalContext`). Preserve the existing `window.__APP_HYDRATED__` effect and the static-surface forwarding (`getProps`, `getTemplateName`, `propTypes`, `displayName`).
- [ ] T006 [P] Update `apps/commerce-storefront/overrides/app/components/quick-view-modal/index.jsx` barrel to re-export `QuickViewProvider`, `useQuickView` from `./context`.

**Checkpoint**: Provider mounted; `useQuickView` is available across the app. The user story phases below can now run in parallel because they touch different files.

---

## Phase 3: User Story 1 — Open Quick View from a tile (Priority: P1) 🎯 MVP

**Goal**: A shopper clicking a tile's Quick View trigger sees a modal containing the product detail (gallery, name, price, swatches, quantity), without navigating away from the PLP.

**Independent Test**: Open `http://localhost:<port>/category/womens-clothing-dresses`, click the trigger on any in-stock tile, and verify the modal opens with `data-testid="quick-view-modal"` containing `data-testid="product-view"`. URL stays on the PLP.

### Implementation

- [ ] T007 [US1] Implement `apps/commerce-storefront/overrides/app/components/quick-view-modal/trigger.jsx` (`QuickViewTrigger`) per [contracts/quick-view-trigger.md](contracts/quick-view-trigger.md):
  - returns `null` when `product?.id` is falsy or when `product.type?.set || product.type?.bundle`;
  - renders a `<button type="button">` with `data-testid={\`quick-view-trigger-\${product.id}\`}`, `aria-haspopup="dialog"`, `aria-controls="quick-view-modal"`;
  - uses the `isMounted` pattern (handler is a no-op until mounted);
  - `onClick` calls `event.stopPropagation()` then `openQuickView(product)`;
  - visible label from `messages.js` (desktop) and `aria-label` from `messages.js` (mobile icon variant);
  - imports `useQuickView` from `./context`.
- [ ] T008 [US1] Modify `apps/commerce-storefront/overrides/app/components/product-tile/index.jsx` to STOP being a transparent re-export. Render a wrapper that:
  - renders the base `ProductTile` (default-imported from `@salesforce/retail-react-app/app/components/product-tile`) with all incoming props spread;
  - renders `<QuickViewTrigger product={product} />` as a sibling overlay positioned over the tile image area;
  - re-exports `Skeleton` from the base module unchanged.
  - DO NOT add any new `data-testid` to the base tile's root element (prop-spread footgun).
- [ ] T009 [P] [US1] Update `apps/commerce-storefront/overrides/app/components/quick-view-modal/index.jsx` barrel to also re-export `QuickViewTrigger` from `./trigger`.
- [ ] T010 [US1] Implement `apps/commerce-storefront/overrides/app/components/quick-view-modal/modal-shell.jsx` (`QuickViewModalShell`) per §A of [contracts/quick-view-modal.md](contracts/quick-view-modal.md):
  - returns `null` when `!isOpen || !openProduct`;
  - composes Chakra `Modal` / `ModalOverlay` / `ModalContent` / `ModalCloseButton`;
  - responsive `size`: `full` on base, `5xl` on `lg`; `isCentered` on desktop sizes; `closeOnEsc` and `closeOnOverlayClick` true; `returnFocusOnClose` left at Chakra default (true);
  - `aria-labelledby="quick-view-modal-title"`;
  - `ModalContent` exposes `data-testid="quick-view-modal"`;
  - wraps children in `react-error-boundary`'s `<ErrorBoundary>` whose fallback element exposes `data-testid="quick-view-modal-error"` with localized copy from `messages.js`;
  - imports `useQuickView` from `./context`.
- [ ] T011 [US1] Implement the read-only / variation-switching parts of `apps/commerce-storefront/overrides/app/components/quick-view-modal/modal-body.jsx` (`QuickViewModalBody`) per §B of [contracts/quick-view-modal.md](contracts/quick-view-modal.md):
  - reads `{ openProduct, closeQuickView }` from `useQuickView`;
  - calls `useProductViewModal(openProduct)`;
  - renders an element with `id="quick-view-modal-title"` containing the product name;
  - renders `<ProductView product={productViewModal.product} showDeliveryOptions={false} showImageGallery imageSize="md" category={undefined} addToCart={noop} />` (real `addToCart` lands in US2);
  - DOES NOT render any element with `data-testid` containing `pickup` and DOES NOT render strings matching `/pickup|ship to store|pick up/i`;
  - imports come from `@salesforce/retail-react-app/app/components/product-view` and `@salesforce/retail-react-app/app/hooks/use-product-view-modal`.
- [ ] T012 [US1] Wire the body into the shell: `modal-shell.jsx` renders `<QuickViewModalBody />` inside the `ErrorBoundary`. Mount the shell inside `QuickViewProvider` so it is a singleton.
- [ ] T013 [US1] Mark the Add-to-Bag button DOM contract in `modal-body.jsx`: add a wrapper element around the base `ProductView`'s Add-to-Bag button (using `customButtons` or a sibling-overlay technique that does NOT add testids to the base button root). The wrapper exposes `data-testid="quick-view-add-to-cart-btn"` and forwards the underlying button's `disabled` attribute. Behavior remains a no-op until US2.

**Checkpoint**: US1 acceptance scenarios 1, 2, 3 pass manually per `quickstart.md` steps 1–5.

---

## Phase 4: User Story 2 — Add to bag from Quick View (Priority: P1)

**Goal**: Clicking Add-to-Bag inside Quick View adds the selected variant to the basket; on success, the Quick View modal closes and the global add-to-cart confirmation modal appears.

**Independent Test**: Open Quick View on a product whose first valid color/size combination is in stock, click Add-to-Bag, verify the modal closes and `data-testid="add-to-cart-modal"` opens with at least one `data-testid="product-added"` row.

### Implementation

- [ ] T014 [US2] In `apps/commerce-storefront/overrides/app/components/quick-view-modal/modal-body.jsx`, wire the slim Add-to-Bag handler per the recipe in §B of [contracts/quick-view-modal.md](contracts/quick-view-modal.md):
  - import `useShopperBasketsV2Mutation as useShopperBasketsMutation` from `@salesforce/commerce-sdk-react`;
  - import `useCurrentBasket` from `@salesforce/retail-react-app/app/hooks/use-current-basket`;
  - import `useAddToCartModalContext` from `@salesforce/retail-react-app/app/hooks/use-add-to-cart-modal`;
  - implement `handleAddToCart(productItems, selectedQuantity)`:
    - if `!basket?.basketId` → `await createBasket.mutateAsync({ body: { productItems } })`,
    - else → `await addItemToBasket.mutateAsync({ parameters: { basketId }, body: productItems })`,
    - on success → `closeQuickView()` then `addToCartModalContext.onOpen({ product: productViewModal.product, itemsAdded: productItems, selectedQuantity })`,
    - on failure → rethrow so base `ProductView`'s existing toast pipeline surfaces the error and the modal stays open;
  - pass the handler as `addToCart={handleAddToCart}` to `<ProductView>`.
- [ ] T015 [US2] Verify NO second `<AddToCartModal>` is mounted by this feature (search `overrides/` for `AddToCartModal` references; the only consumer should be `useAddToCartModalContext().onOpen`). Update commit message to call this out so reviewers can verify.

**Checkpoint**: US2 acceptance scenarios 1, 2, 3 pass manually per `quickstart.md` step 7.

---

## Phase 5: User Story 3 — Disabled-state UX (Priority: P2)

**Goal**: Add-to-Bag is disabled when the active selection is incomplete or unavailable (master with no variation, OOS variant), with the existing `inventory-message` visible inside the modal.

**Independent Test**: Open Quick View on a master product without selecting a variation: `quick-view-add-to-cart-btn` is `disabled`. Pick an out-of-stock variation: still disabled, `inventory-message` visible.

### Implementation

- [ ] T016 [US3] In `apps/commerce-storefront/overrides/app/components/quick-view-modal/modal-body.jsx`, confirm the wrapper around the base Add-to-Bag button forwards `disabled` correctly. The base `ProductView` already disables its button when the active variant is non-orderable / not selected; the wrapper introduced in T013 must reflect that same `disabled` boolean on the testid'd element. If the wrapper currently uses `customButtons`, ensure the disabled state propagates from the base button props; otherwise position the wrapper as an overlay that mirrors the base button's `aria-disabled` and `disabled` attributes via React state read from `useProductViewModal`.
- [ ] T017 [P] [US3] Confirm `data-testid="inventory-message"` is rendered by base `ProductView` inside the modal in OOS scenarios (no override needed; just verify it isn't suppressed by any custom prop combination).

**Checkpoint**: US3 acceptance scenarios 1, 2, 3 pass manually per `quickstart.md` step 6.

---

## Phase 6: User Story 4 — View Full Details link (Priority: P3)

**Goal**: A "View Full Details" link inside the modal navigates to the corresponding PDP and dismisses the modal.

**Independent Test**: Open Quick View, click `data-testid="quick-view-view-full-details-link"`, verify navigation to the PDP.

### Implementation

- [ ] T018 [US4] In `apps/commerce-storefront/overrides/app/components/quick-view-modal/modal-body.jsx`, render a PWA Kit `<Link>` (or React Router `<Link>` per existing PWA Kit conventions) below the `<ProductView>`:
  - `data-testid="quick-view-view-full-details-link"`;
  - `to={pdpUrlFor(openProduct)}` — derive the PDP URL using the existing PWA Kit URL builder utilities (the same one used by the base `ProductTile`);
  - `onClick={() => closeQuickView()}` so the modal is dismissed during navigation;
  - localized label from `messages.js`.

**Checkpoint**: US4 acceptance scenario 1 passes manually per `quickstart.md` step 9.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Finalize i18n catalog, run the existing translation extraction, and execute the manual smoke checklist.

- [ ] T019 Run `npm run build-translations` from `apps/commerce-storefront/` to extract the new messages and refresh per-locale JSON files under `apps/commerce-storefront/translations/`. Commit the regenerated catalogs alongside the source changes.
- [ ] T020 [P] Run `npm run lint` and `npm run format` from `apps/commerce-storefront/` and resolve any new violations introduced by this feature.
- [ ] T021 Execute the full 11-step manual smoke checklist in [quickstart.md](quickstart.md) §3 against a locally running storefront. Record PASS/FAIL inline in a working note (do NOT commit the working note). Re-run the checklist after each fix until all 11 steps PASS.
- [ ] T022 Hand-off note: post the resolved local storefront port and category URL into the working chat for the E2E session, e.g. `STOREFRONT_URL=http://localhost:<port>` so the Playwright MCP agent can pick it up. Do NOT commit this URL.

**Checkpoint**: Manual smoke is fully GREEN. The development session is done. The E2E and unit-test sessions can now run in parallel against the implementation.

---

## Dependencies (high-level)

```
Phase 1 (Setup) ─────► Phase 2 (Foundational) ──┬─► Phase 3 (US1)
                                                 │       │
                                                 │       ▼
                                                 │   Phase 4 (US2)
                                                 │       │
                                                 │       ▼
                                                 │   Phase 5 (US3)
                                                 │       │
                                                 │       ▼
                                                 │   Phase 6 (US4)
                                                 │       │
                                                 ▼       ▼
                                              Phase 7 (Polish)
```

US1 must complete before US2 (the modal body must render before the Add-to-Bag handler can be wired). US3 sits on top of US2's button surface. US4 is independent of US2/US3 once US1's modal body exists; the only ordering dependency is "US1 first".

## Parallel-execution opportunities

- T002 / T003 (Phase 1) are file-disjoint and can run in parallel.
- T006 (barrel update) is `[P]` against any task that does not also edit `index.jsx`.
- T009 is `[P]` and edits a different file from T007 / T008.
- T017 is `[P]` (verification only, no code edit).
- T020 is `[P]` (lint pass).

## Out of scope for this file

- Authoring `apps/commerce-storefront/e2e/product-quick-view.spec.ts` (E2E session — see [e2e-tasks.md](e2e-tasks.md)).
- Authoring Jest + RTL unit tests (unit-test session — see [unit-tasks.md](unit-tasks.md)).
- Implementing Pickup-in-Store / Ship-to-Store inside Quick View (deferred per spec).
