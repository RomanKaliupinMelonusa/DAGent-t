---
description: "E2E test tasks for PLP Product Quick View Modal (Playwright via Playwright MCP)"
---

# Tasks: PLP Product Quick View Modal — E2E Tests

**Input**: [contracts/e2e-tests.md](contracts/e2e-tests.md) (binding contract), [contracts/quick-view-trigger.md](contracts/quick-view-trigger.md), [contracts/quick-view-modal.md](contracts/quick-view-modal.md), [quickstart.md](quickstart.md)
**Owner session**: **E2E agent (Playwright via Playwright MCP)** — separate from the development session.
**Prerequisite**: The development session has completed [tasks.md](tasks.md) Phase 7 (manual smoke GREEN). The dev server is running locally; the agent has been given the resolved port via `STOREFRONT_URL` env var.

> **Strict scope.** This session ONLY authors and runs the Playwright spec. It MUST NOT modify production code. If a needed testid is missing, escalate to the development session — do NOT add an alternate selector. Selectors are restricted to the contract enumerated in [contracts/e2e-tests.md](contracts/e2e-tests.md) §2.

## Format: `[ID] [P?] [Story?] Description`

- All tasks land in `apps/commerce-storefront/e2e/product-quick-view.spec.ts` (single file).
- `[P]` is rare here because most tasks edit the same file. Where two tasks edit truly disjoint helper files, `[P]` is allowed.
- `[Story]` maps to the user stories from `spec.md` (US1–US4).

User-story coverage map:
- US1 → flows E2E-001, E2E-002, E2E-008.
- US2 → flow E2E-003.
- US3 → flow E2E-006.
- US4 → flow E2E-007.
- Negative / cross-cutting → flows E2E-004 (focus restoration), E2E-005 (no-pickup).

---

## Phase 1: Setup

- [ ] T001 Confirm `STOREFRONT_URL` resolves to a running PWA Kit storefront. If not set, fall back to whatever `apps/commerce-storefront/playwright.config.ts` resolves via its `webServer` block. The default category path is `/category/womens-clothing-dresses`. NEVER hard-code the example port `49968`.
- [ ] T002 Verify the development session has shipped the testid contract by manually loading the PLP and checking the DOM contains at least one `[data-testid^="quick-view-trigger-"]` button. If absent, halt and notify the development session.
- [ ] T003 Create `apps/commerce-storefront/e2e/product-quick-view.spec.ts` and import `test`/`expect` from `./fixtures` (existing shared fixture file). DO NOT import directly from `@playwright/test`.

---

## Phase 2: Foundational

**Purpose**: Shared helpers used by every flow. All later flow tasks depend on these.

- [ ] T004 In `apps/commerce-storefront/e2e/product-quick-view.spec.ts`, define a `gotoPlp(page)` helper that resolves `STOREFRONT_URL` (or Playwright `baseURL`), `await page.goto(url + '/category/womens-clothing-dresses')`, then `await awaitHydrated(page)`, then inline `dismissOverlays(page)` per [contracts/e2e-tests.md](contracts/e2e-tests.md) §1.
- [ ] T005 Define a console-error-budget helper that attaches a listener at the start of each test and asserts a finite zero-error budget at the end (allow-list any known framework warnings only with explicit comments). Apply via a `test.beforeEach` and `test.afterEach`.
- [ ] T006 Define a `firstQuickViewTrigger(page)` helper that returns the first `[data-testid^="quick-view-trigger-"]` locator on the rendered PLP, plus its captured product id (parsed from the `data-testid`).
- [ ] T007 Define an `openQuickView(page)` helper that calls `firstQuickViewTrigger`, clicks it, and waits for `[data-testid="quick-view-modal"]` to be visible. Returns the trigger locator (so caller can assert focus restoration later) and the product id.

**Checkpoint**: All flow tasks below can use these helpers. No flow may bypass them.

---

## Phase 3: US1 flows — Open + variation switching + tile-click regression

- [ ] T008 [US1] **Flow E2E-001 `open-quick-view-from-tile`**: `gotoPlp` → `openQuickView` → assert `[data-testid="quick-view-modal"]` visible AND `[data-testid="product-view"]` visible inside the modal AND `[data-testid="quick-view-modal-error"]` NOT visible AND `page.url()` unchanged. Console-error budget honored.
- [ ] T009 [US1] **Flow E2E-002 `switch-color-swatch-in-quick-view`**: `gotoPlp` → `openQuickView` → look for any color swatch group inside the modal (skip the entire test via `test.skip()` if no color swatches are visible on the opened tile — do NOT assume every product has color options). When ≥1 color swatch is present AND a second color swatch exists, click it → assert the active-swatch indicator updates AND the gallery's primary `<img>` `src` differs from its pre-click value AND `[data-testid="quick-view-modal"]` remains visible. If only 1 color swatch exists, skip the test. Distinguish color swatches from size swatches by inspecting the swatch group's fieldset/label/name attributes — do not use positional `nth()` across mixed swatch types. Console-error budget honored.
- [ ] T010 [US1] **Flow E2E-008 `tile-click-still-navigates-to-pdp`**: `gotoPlp` → click the tile's image (NOT the trigger) → assert `page.url()` matches the PDP URL pattern → assert `[data-testid="quick-view-modal"]` is NOT visible. Console-error budget honored.

**Checkpoint**: US1 flows authored and passing.

---

## Phase 4: US2 flow — Add to bag

- [ ] T011 [US2] **Flow E2E-003 `add-to-bag-from-quick-view`**: `gotoPlp` → `openQuickView` → ensure a complete in-stock variation is selected (use the first valid color, then first valid size; defer to runtime probing if the data shape varies) → `await Promise.all([page.waitForResponse(r => /baskets/.test(r.url()) && r.ok()), page.locator('[data-testid="quick-view-add-to-cart-btn"]').click()])` → assert `[data-testid="quick-view-modal"]` becomes hidden AND `[data-testid="add-to-cart-modal"]` is visible AND `>= 1` `[data-testid="product-added"]` row inside it. Assert no basket-related response was 4xx/5xx. Console-error budget honored.

**Checkpoint**: US2 flow authored and passing.

---

## Phase 5: US3 flow — Disabled state probe

- [ ] T012 [US3] **Flow E2E-006 `add-to-bag-disabled-when-unavailable`**: `gotoPlp` → `openQuickView` on a master product → before any variation is selected, assert `[data-testid="quick-view-add-to-cart-btn"]` has the `disabled` attribute. Then attempt to discover an out-of-stock variation by scanning swatches and any client-rendered inventory hints; if discovered, click it and assert the button remains `disabled` AND `[data-testid="inventory-message"]` is visible. If no OOS variation is discoverable at runtime, call `test.skip(true, 'No OOS variant discoverable; covered deterministically by unit tests')`. Console-error budget honored.

**Checkpoint**: US3 flow authored. Skipping is acceptable when the live storefront cannot exercise it; the deterministic equivalent lives in unit tests.

---

## Phase 6: US4 flow — View Full Details

- [ ] T013 [US4] **Flow E2E-007 `view-full-details-link`**: `gotoPlp` → `openQuickView` → click `[data-testid="quick-view-view-full-details-link"]` → assert `page.url()` matches a PDP URL pattern AND `[data-testid="quick-view-modal"]` is no longer attached / visible. Console-error budget honored.

**Checkpoint**: US4 flow authored and passing.

---

## Phase 7: Cross-cutting flows — focus restoration + no-pickup negative

- [ ] T014 **Flow E2E-004 `close-quick-view-restores-focus`**: For each of three dismiss paths — `Escape` keypress, close-button click, overlay click — open Quick View, dismiss, then assert `[data-testid="quick-view-modal"]` is hidden AND `document.activeElement` is the originating `[data-testid^="quick-view-trigger-"]` element. Console-error budget honored.
- [ ] T015 **Flow E2E-005 `no-pickup-ui-in-quick-view` (negative)**: `gotoPlp` → `openQuickView` → assert NONE of the following are visible inside `[data-testid="quick-view-modal"]`:
  - `[data-testid="pickup-select-store-msg"]`,
  - `[data-testid="store-stock-status-msg"]`,
  - any element with `data-testid` matching `*=pickup`,
  - any element whose text matches `/pickup|ship to store|pick up/i`.
  Console-error budget honored.

**Checkpoint**: Cross-cutting flows authored and passing.

---

## Phase 8: Polish

- [ ] T016 Run the full suite locally with `STOREFRONT_URL` set (e.g., `STOREFRONT_URL=http://localhost:<port> npx playwright test apps/commerce-storefront/e2e/product-quick-view.spec.ts`). All flows MUST pass green or be `test.skip()`-ed with an inline comment explaining why.
- [ ] T017 [P] Verify the spec uses ONLY the testids from [contracts/e2e-tests.md](contracts/e2e-tests.md) §2. No CSS class selectors, no text-content selectors for Quick-View-owned UI. Resolve violations by escalating to the development session for new testids — do NOT improvise.
- [ ] T018 Hand-off: report the suite run result back to the orchestrator (PASS / list of skipped flows with reasons / any contract-drift escalations).

---

## Dependencies

```
Phase 1 (Setup) → Phase 2 (Foundational helpers) → Phases 3..7 (flows, mostly disjoint within the same file) → Phase 8 (Polish)
```

Within Phases 3–7, flows do not depend on each other at runtime, but they edit the same spec file, so most are sequential by file-locking. T017 is `[P]` because it is a static review.

## Out of scope for this file

- Production code changes (development session — see [tasks.md](tasks.md)).
- Unit tests (unit-test session — see [unit-tasks.md](unit-tasks.md)).
- Adding new testids or selectors beyond the contract.
