# E2E Test Specification: PLP Product Quick View Modal

**Feature**: [../spec.md](../spec.md) | **Plan**: [../plan.md](../plan.md)
**Branch**: `001-plp-quick-view`
**Status**: Draft — to be implemented in a **separate agent session**
**Owner of execution**: Downstream E2E-author agent session (do NOT implement these tests as part of the main development session)

> **Why this lives in its own file.** The user has explicitly requested that the E2E test work be done in a separate agentic coding session, isolated from the main development work. This file is the contract that session consumes. The development session that implements `spec.md` MUST NOT also write the Playwright spec — it should only ensure the testids and selectors enumerated below are present in the rendered DOM.

## 1. Environment & URL

- **Default URL used for these tests**:
  `http://localhost:49968/category/womens-clothing-dresses`
- **The port `49968` is not stable.** It is the port the local commerce-storefront dev server happens to be listening on at the time this spec was written. The actual port may differ on another machine, in CI, or after a Webpack/SSR config change. The downstream E2E session MUST NOT hard-code `49968`.

  Resolution rules the E2E session MUST follow, in priority order:
  1. Honor an env var (e.g. `STOREFRONT_URL`) if set, e.g. `STOREFRONT_URL=http://localhost:3000`.
  2. Fall back to whatever `playwright.config.ts` resolves as the storefront base URL (the existing `webServer` block in `apps/commerce-storefront/playwright.config.ts` is the source of truth).
  3. The category path `/category/womens-clothing-dresses` is the canonical PLP fixture for this feature — the E2E session MAY also probe other PLPs (e.g. `mens-accessories`) if the dresses PLP does not yield a tile that satisfies a given test's preconditions (e.g., multi-color, in-stock variant available).
- **Test framework**: Playwright (the project already uses it; see `apps/commerce-storefront/playwright.config.ts` and existing specs in `apps/commerce-storefront/e2e/`).
- **Spec file location**: `apps/commerce-storefront/e2e/product-quick-view.spec.ts`.
- **Fixtures**: `apps/commerce-storefront/e2e/fixtures.ts` (already exists — import `test`/`expect` from it, do not import directly from `@playwright/test`).
- **Pre-flight per test**: `await page.goto(url)` → `awaitHydrated(page)` → `dismissOverlays(page)` (cookie banner / locale prompt / etc.) before any interaction.
- **Mock vs. live**: Mock-backed (run against the local dev server). No `e2e/live/` suite for this feature.
- **Console-error budget**: Each test MUST assert a finite, mechanically-derived console-error budget (zero unless the test explicitly tolerates a known framework warning). Use the existing helper if present.

## 2. Required testids the development work MUST expose

The development session implementing `spec.md` is responsible for adding these `data-testid` attributes. The E2E session relies on them and MUST NOT introduce alternate selectors.

| testid | Cardinality | Where it lives |
| --- | --- | --- |
| `quick-view-trigger-{productId}` | one per eligible tile | The Quick View trigger button on a product tile |
| `quick-view-modal` | one (when open) | The Quick View modal container |
| `quick-view-modal-error` | one (when error) | Error fallback inside the modal body |
| `quick-view-add-to-cart-btn` | one (when modal open) | The Add-to-Bag button inside the modal |
| `quick-view-view-full-details-link` | one (when modal open) | The "View Full Details" link inside the modal |

**Reused testids** (already provided by the storefront / base components — do not redefine):

- `sf-product-tile-{productId}` — PLP product tile
- `product-view` — body of the product detail component rendered inside the modal
- `add-to-cart-modal` — the global add-to-cart confirmation modal that opens after a successful add
- `product-added` — a row inside `add-to-cart-modal` for each added line item
- `inventory-message` — availability / OOS messaging inside `product-view`

## 3. Test flows

Each flow is independent. Each flow MUST: navigate, await hydration, dismiss overlays, then perform its assertions. Each flow MUST assert the console-error budget.

### Flow E2E-001: `open-quick-view-from-tile` (P1)

**Given** the shopper is on `http://localhost:<resolvedPort>/category/womens-clothing-dresses`,
**When** they click `quick-view-trigger-{firstProductId}`,
**Then** `quick-view-modal` becomes visible AND `product-view` is visible inside it AND `quick-view-modal-error` is NOT visible.

Assertions:

- `quick-view-modal` is visible.
- `product-view` is visible inside the modal.
- `quick-view-modal-error` is not visible.
- Console-error budget honored.
- The trigger does NOT cause navigation away from the PLP (URL unchanged).

### Flow E2E-002: `switch-color-swatch-in-quick-view` (P1)

**Given** the Quick View modal is open on a tile with at least 2 color swatches,
**When** the shopper clicks the second color swatch inside the modal,
**Then** the active swatch state updates AND the displayed gallery image changes.

Assertions:

- Active swatch indicator reflects the new selection.
- The gallery's primary image `src` differs from the pre-click value.
- `quick-view-modal` remains visible.
- Console-error budget honored.

### Flow E2E-003: `add-to-bag-from-quick-view` (P1)

**Given** the Quick View modal is open on a product whose first valid color/size combination is in stock,
**When** the shopper selects a complete in-stock variation and clicks `quick-view-add-to-cart-btn`,
**Then** `quick-view-modal` is dismissed AND `add-to-cart-modal` becomes visible AND at least one `product-added` row is present inside it.

Assertions:

- `quick-view-modal` is hidden after the add.
- `add-to-cart-modal` is visible.
- `>= 1` `product-added` row is visible inside `add-to-cart-modal`.
- All basket-related network responses are 2xx (no 4xx/5xx).
- Console-error budget honored.

### Flow E2E-004: `close-quick-view-restores-focus` (P2)

**Given** the Quick View modal is open from a known trigger,
**When** the shopper presses `Escape`,
**Then** `quick-view-modal` is hidden AND `document.activeElement` is the originating `quick-view-trigger-{productId}`.

Repeat the above with two additional dismiss paths and assert focus restoration in each:

- close-button click;
- overlay click.

Console-error budget honored.

### Flow E2E-005: `no-pickup-ui-in-quick-view` (P1, negative)

**Given** the Quick View modal is open on any in-stock product,
**When** the modal renders,
**Then** none of the Pickup-in-Store / Ship-to-Store testids/selectors are visible inside the modal:

- `data-testid="pickup-select-store-msg"` — not visible
- `data-testid="store-stock-status-msg"` — not visible
- any element with `data-testid` matching `pickup` (substring) — not visible

Console-error budget honored. Also assert no element with text matching `/pickup|ship to store|pick up/i` is rendered inside `quick-view-modal`.

### Flow E2E-006: `add-to-bag-disabled-when-unavailable` (P2)

**Given** the Quick View modal is open on a master product, before any variation is selected,
**Then** `quick-view-add-to-cart-btn` is disabled.

**And given** the shopper selects an out-of-stock variation (discovered at runtime by scanning available swatches/inventory; if none exists in the running storefront, the test is skipped via `test.skip()` and the deterministic equivalent is covered by unit tests),
**When** the unavailable variation becomes active,
**Then** `quick-view-add-to-cart-btn` is disabled AND `inventory-message` is visible inside the modal.

Console-error budget honored.

### Flow E2E-007: `view-full-details-link` (P3)

**Given** the Quick View modal is open,
**When** the shopper clicks `quick-view-view-full-details-link`,
**Then** the page navigates to the product's PDP AND `quick-view-modal` is no longer rendered.

Console-error budget honored.

### Flow E2E-008: `tile-click-still-navigates-to-pdp` (P2, regression)

**Given** the shopper is on the PLP,
**When** they click the tile's image (NOT the Quick View trigger),
**Then** they navigate to the corresponding PDP (URL changes), exactly as today.

Console-error budget honored.

## 4. Selectors policy

- Use `data-testid` selectors exclusively for Quick-View-owned UI. Do NOT rely on text content, tag structure, or class names for any new selector.
- Reuse existing testids verbatim where listed above; do not introduce variants.
- For the OOS-variant probe in Flow E2E-006, the E2E session MAY use existing inventory testids (`inventory-message`) plus the `disabled` attribute on `quick-view-add-to-cart-btn`. No new selectors required.

## 5. Out of scope (E2E layer)

- Set / Bundle product handling — covered at the unit-test layer (see [../unit-tests.md](../unit-tests.md)) because there is no guaranteed stable set/bundle PLP fixture.
- Network-failure and detail-fetch-failure paths — owned by unit tests (`spec.md` FR-008, FR-018).
- Server-render parity check (FR-015) — owned by unit/integration tests.
- Localization expansion — only one default locale is exercised here; full i18n coverage is out of scope.

## 6. Acceptance for the E2E session

The E2E session is complete when:

1. `apps/commerce-storefront/e2e/product-quick-view.spec.ts` exists and contains all flows above.
2. Each flow uses a configurable base URL (env var or `playwright.config.ts`), not the hard-coded port `49968`.
3. All flows pass against a running local storefront on the configured port (default category path `/category/womens-clothing-dresses`).
4. Console-error budget is asserted in every flow.
5. No new testids are introduced beyond the contract in §2; if a needed testid is missing, the E2E session escalates back to the development session rather than synthesizing an alternative selector.
