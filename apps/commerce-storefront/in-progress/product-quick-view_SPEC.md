# Plan: Product Quick View on PLP (with Ship-to-Store)

## TL;DR

Add a Quick View overlay bar to every PLP product tile that opens a lazy-loaded Chakra `Modal` rendering the base template's `<ProductView>` (native swatches + strikethrough) plus a new Pickup-Store picker powered by `useSearchStores` from `@salesforce/commerce-sdk-react`. All code lives in `apps/commerce-storefront/overrides/app/` following the PWA Kit override pattern and the APM `storefront-dev` rules (wrapper-level data-testid, lazy modal, local ErrorBoundary, per-instance testid on repeating buttons).

## Key Design Decisions

- **Reuse first.** `<ProductView>` + `useProductViewModal` from `@salesforce/retail-react-app` handle product fetch, variation attributes, swatch strikethrough for unorderable variants, quantity, and Add-to-Cart. We do NOT re-implement swatches.
- **Thin modal wrapper.** Our own `QuickViewModal` gives us room for (a) local `ErrorBoundary` (required by rule in e2e-guidelines), (b) the new `PickupStorePicker`, and (c) a clean close affordance.
- **BOPIS scope (user answer: B).** Postal-code search via `useSearchStores`; user selects a store; Add-to-Cart mutates the basket with `shippingMethodId: "001"` (in-store pickup) and `c_storeId` custom attribute on the product item. Per-store inventory is NOT checked — out of scope for this feature.
- **Overlay behavior (user answer).** Hover-reveal on desktop (`lg`), always-visible on `base`/`md` (touch).
- **SSR safety.** Modal is `React.lazy()` + only mounted when `isOpen === true`. No commerce hooks fire during SSR of the PLP.
- **Prop-spread footgun.** Tile override wraps the base `ProductTile` in a `<Box data-testid="product-tile-wrapper-{productId}">` because the PLP page spreads `data-testid={`sf-product-tile-${id}`}` into the base, overwriting any `data-testid` we put on the base root.

## Phases

### Phase 1 — Spec & Acceptance (automated by pipeline)
1. `in-progress/quick-view-plp_SPEC.md` — human-readable description copied from user's request (UI mock + swatch + BOPIS requirement).
2. Spec-compiler agent produces `_ACCEPTANCE.yml` with:
   - `required_dom`: `quick-view-btn` (cardinality: many), `quick-view-modal`, `product-view` (inherited), `pickup-store-picker`, `pickup-store-search-input`, `pickup-store-option` (cardinality: many), `pickup-add-to-cart-btn`, `quick-view-error`.
   - `required_flows`:
     - `open-quick-view-modal` — goto PLP → click first `quick-view-btn` → assert `quick-view-modal` visible.
     - `select-variant-in-quick-view` — open modal → click a swatch → assert selected state.
     - `pickup-add-to-cart` — open modal → fill postal code → click a store → click `pickup-add-to-cart-btn` → assert mini-cart shows line item with store name.
   - `base_template_reuse`: `ProductView`, `useProductViewModal`, `useShopperBasketsMutation`, `useSearchStores`.
   - `forbidden_network_failures`: `GET /mobify/proxy/api/.*/products/.*`, `GET /mobify/proxy/api/.*/store_search`.

### Phase 2 — Product Tile Override (parallel with 3)

**File:** `apps/commerce-storefront/overrides/app/components/product-tile/index.jsx` (replaces the current 5-line re-export)

- Import base `ProductTile`, `useDisclosure`, Chakra primitives from `@salesforce/retail-react-app/app/components/shared/ui`.
- Lazy-load `QuickViewModal` via `React.lazy()`.
- Guard: don't render overlay for `product.type.set === true` or `product.type.bundle === true` or missing `productId`.
- Structure:
  - `<Box data-testid="product-tile-wrapper" position="relative" role="group">`
  - base `<ProductTile {...props} />`
  - Absolutely positioned overlay matched to the image area (`paddingBottom="100%"`, `overflow="hidden"`), containing a `<Box as="button" data-testid={`quick-view-btn-${product.productId}`}>` — per-instance testid suffix per `data-testid-contract` rule 7.
  - Responsive `opacity`/`transform` for hover-slide on `lg`, always-on on `base`/`md`.
  - Button `onClick` calls `e.preventDefault()` + `e.stopPropagation()` + `onOpen()` to avoid navigating to PDP.
  - Renders `{isOpen && <Suspense><QuickViewModal product={product} isOpen onClose={onClose} /></Suspense>}`.
- Export original `Skeleton` unchanged.

### Phase 3 — Quick View Modal (parallel with 2)

**File:** `apps/commerce-storefront/overrides/app/components/quick-view-modal/index.jsx` (new)

- Client-only component. Uses `useProductViewModal(productHit)` to fetch full product with variants.
- Chakra `<Modal size="4xl" isOpen onClose>` with `<ModalOverlay>`, `<ModalContent data-testid="quick-view-modal" aria-label={…}>`, `<ModalCloseButton>`, `<ModalBody>`.
- States:
  1. `isFetching` → centered `<Spinner data-testid="quick-view-spinner" />`.
  2. `!isFetching && !product` → `data-testid="quick-view-error"` "Product no longer available" with close button.
  3. Loaded → `<QuickViewErrorBoundary>` wrapping:
     - `<ProductView product={fetched} isProductLoading={false} showFullLink imageSize="sm" />` (native swatches with strikethrough on unorderable).
     - `<PickupStorePicker product={fetched} onAdded={onClose} />` below `ProductView`.
- `QuickViewErrorBoundary` — local class component; fallback renders `data-testid="quick-view-error"` (required by e2e rule 12 three-outcome pattern). Prevents a ProductView throw from reaching the route-level `AppErrorBoundary`.

### Phase 4 — Pickup Store Picker (new)

**File:** `apps/commerce-storefront/overrides/app/components/pickup-store-picker/index.jsx` (new)

- Component contract: `({ product, onAdded }) => JSX`.
- State: `postalCode` (controlled input), `selectedStoreId`.
- Data fetch: `useSearchStores({ parameters: { countryCode, postalCode, maxDistance, distanceUnit: 'mi' } }, { enabled: postalCode.length >= 3 })` from `@salesforce/commerce-sdk-react`.
- UI:
  - Heading "Ship to store".
  - `<Input data-testid="pickup-store-search-input" value={postalCode} onChange={…} placeholder="Postal code">`.
  - Loading spinner while fetching.
  - `<RadioGroup>` of stores, each `<Radio data-testid={`pickup-store-option-${store.id}`} value={store.id}>` rendering `store.name`, address, distance.
  - Empty state if no stores.
- Add-to-Cart button: `<Button data-testid="pickup-add-to-cart-btn" isDisabled={!selectedStoreId || !selectedVariant}>`.
- On click: `useShopperBasketsMutation('addItemToBasket')` with payload:
  ```
  { productId: selectedVariant.productId,
    quantity: 1,
    shipmentId: 'me',
    c_storeId: selectedStoreId }
  ```
  On success: show a Chakra `useToast` confirmation, call `onAdded()` to close modal.
- Read the selected variant from `ProductView` via shared state. **Implementation detail:** `useProductViewModal` exposes `variant`; we'll re-derive by calling `useProductViewModal(product)` inside `PickupStorePicker` OR accept `selectedVariant` via prop from the modal (simpler — pass down from `QuickViewModal`).
- Note: per-store inventory is NOT checked. "Ship to store" is informational — backend rules still apply when basket is submitted.

### Phase 5 — i18n & Translations

- Every user-facing string wrapped in `useIntl().formatMessage({defaultMessage, id})` (rule: all storefront strings i18n'd).
- New translation keys: `quick_view.overlay_label`, `quick_view.close`, `quick_view.error.unavailable`, `pickup.heading`, `pickup.postal_placeholder`, `pickup.no_stores`, `pickup.select_store`, `pickup.add_to_cart`, `pickup.toast_added`.
- Run `npm run extract-default-translations` to regenerate `translations/en-US.json`.

### Phase 6 — Unit Tests

**Jest + RTL, always mocking `commerce-sdk-react`:**

- `overrides/app/components/product-tile/__tests__/index.test.jsx`
  - Renders base tile + `quick-view-btn-<id>`.
  - Clicking overlay opens modal (via `useDisclosure` state).
  - Hides overlay when `product.type.set === true`.
- `overrides/app/components/quick-view-modal/__tests__/index.test.jsx`
  - Renders spinner while `isFetching`.
  - Renders `quick-view-error` when product is null.
  - Renders `ProductView` once loaded.
  - ErrorBoundary: forcibly throw → fallback testid appears.
- `overrides/app/components/pickup-store-picker/__tests__/index.test.jsx`
  - Typing postal code triggers `useSearchStores`.
  - Selecting a store enables the CTA.
  - Clicking CTA calls mutation with `c_storeId`.

### Phase 7 — E2E Test (by `e2e-author` agent)

**File:** `apps/commerce-storefront/e2e/quick-view.spec.ts`

- Three positive tests matching `required_flows`. Each: explicit `domcontentloaded` wait, crash-page detection, `consoleErrors` assertion at end.
- Use `.first()` / `.nth()` against `quick-view-btn` (cardinality: many) OR target the per-instance testid if a specific product is known.
- Three-outcome race pattern around the modal open.

### Phase 8 — Hook Validation

Append to `apps/commerce-storefront/.apm/hooks/validate-app.sh`:
```bash
PLP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/category/newarrivals")
if [ "$PLP_STATUS" != "200" ]; then
  echo "ERROR: PLP returned $PLP_STATUS — Quick View SSR broke the page"
  exit 1
fi
```

### Phase 9 — Dev-Server Validation (required before commit)

Per `dev-server-validation.md`: start `npm start` → verify `/` and `/category/newarrivals` both return 200. If not, check server logs for `ModuleNotFoundError` or SSR crash (commerce hooks during SSR are the usual cause).

## Steps (Executable Ordering)

1. **Step 1** — Write `_SPEC.md` capturing the user's request.
2. **Step 2** — (pipeline: spec-compiler) produce `_ACCEPTANCE.yml`.
3. **Step 3** — (pipeline: baseline-analyzer) capture `_BASELINE.json` for `/category/newarrivals` + modal trigger.
4. **Step 4** — (parallel with 5) Product Tile override with overlay bar + lazy modal import.
5. **Step 5** — (parallel with 4) QuickViewModal component + QuickViewErrorBoundary.
6. **Step 6** — (depends on 5) PickupStorePicker using `useSearchStores` + `useShopperBasketsMutation`.
7. **Step 7** — (depends on 6) i18n strings + translation extraction.
8. **Step 8** — (parallel with 4-7, depends on 4) Unit tests — three spec files.
9. **Step 9** — (depends on 2) E2E spec authored by e2e-author agent.
10. **Step 10** — Append validate-app.sh hook check.
11. **Step 11** — Dev-server validation gate (`/` and `/category/newarrivals` both 200).
12. **Step 12** — `agent-commit.sh all "feat(storefront): product quick view on PLP with ship-to-store"`.

## Relevant Files

- `apps/commerce-storefront/overrides/app/components/product-tile/index.jsx` — replace current re-export with wrapper Box + overlay bar + lazy modal. Use `useDisclosure`, `React.lazy`. Per-instance testid: `quick-view-btn-${product.productId}`.
- `apps/commerce-storefront/overrides/app/components/quick-view-modal/index.jsx` (new) — Chakra Modal + `useProductViewModal` + `ProductView` + `QuickViewErrorBoundary` + `PickupStorePicker`.
- `apps/commerce-storefront/overrides/app/components/pickup-store-picker/index.jsx` (new) — postal-code input + `useSearchStores` + store radio list + `useShopperBasketsMutation('addItemToBasket')` with `c_storeId`.
- `apps/commerce-storefront/overrides/app/components/*/__tests__/index.test.jsx` — three unit tests.
- `apps/commerce-storefront/e2e/quick-view.spec.ts` (authored in Phase 7) — three E2E flows.
- `apps/commerce-storefront/translations/en-US.json` — regenerated by `extract-default-translations`.
- `apps/commerce-storefront/.apm/hooks/validate-app.sh` — append PLP 200 check.
- `apps/commerce-storefront/in-progress/quick-view-plp_SPEC.md` — spec for pipeline.

## Verification

1. **Unit tests:** `cd apps/commerce-storefront && npx jest overrides/app/components/product-tile overrides/app/components/quick-view-modal overrides/app/components/pickup-store-picker --workers=1` — all green.
2. **Dev server smoke:** `npm start &` in `apps/commerce-storefront`; `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/` returns `200`; same for `/category/newarrivals`. Kill server.
3. **E2E:** `npx playwright test quick-view.spec.ts --workers=1` — three tests, no `networkidle`, each asserts a feature-specific testid and `consoleErrors.toEqual([])`.
4. **Self-review gates:**
   - `grep -rn 'networkidle' e2e/` returns empty.
   - `grep -nE "^\s*test\(([\"']).*\bor\b.*(error|crash|fail)" e2e/` returns empty.
   - `grep -nL "consoleErrors" e2e/quick-view.spec.ts` returns empty.
5. **Manual UI check in browser:** navigate to `/category/newarrivals`, hover a product tile — overlay bar slides up; click — modal opens; swatches show with strikethrough on unavailable; postal-code + store pick + add-to-cart → mini-cart shows the item with the selected store reference.

## Scope Boundaries

**Included:**
- Quick View overlay bar on every product tile (except sets/bundles).
- Modal with full product details, variation swatches (strikethrough native to `ProductView`), Add-to-Cart.
- Store locator by postal code + store selection + basket add with `c_storeId`.
- Unit + E2E tests, i18n, hook validation, SSR safety.

**Excluded:**
- Per-store real-time inventory check (would require OCI integration).
- Geolocation auto-detect (postal code input only).
- Store details page / map view.
- Persisting the user's preferred store across sessions.
- Changes to the PDP route itself (`/product/:id` is unaffected).
- Any change to the base template packages — only overrides.
