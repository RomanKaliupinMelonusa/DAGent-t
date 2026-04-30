---
schemaVersion: 1
producedBy: plan-pwa-kit
producedAt: 2026-04-28T00:00:00Z
feature: product-quick-view
workflow: storefront
---

# Product Quick View

## 1. Title & Summary

Adds a Quick View affordance to PLP product tiles in the commerce-storefront app. Clicking the trigger opens a modal that renders the base PWA Kit `ProductView` (variation swatches, quantity, add-to-bag) for the tile's product without navigating to the PDP. **Ship-to-store / Pickup-in-Store is explicitly out of scope for this feature** — the modal hides delivery options entirely. On successful add-to-bag, the Quick View modal closes and the global PWA Kit `AddToCartModal` (the same confirmation surface PDP uses) takes over. Reuse posture: wraps base `ProductTile` and `ProductView` via overrides; the only new override surface is one tile-level trigger and one shell+body modal pair.

## 2. Functional Requirements

**In scope**

- A "Quick View" trigger overlays each PLP product tile.
  - **Desktop:** revealed on tile hover/focus over the image area.
  - **Mobile / touch:** persistently visible as a compact icon button anchored to the tile image (does not rely on hover).
- Clicking the trigger opens a modal centered on the viewport (desktop) / full-height bottom-aligned drawer-style sheet (mobile, per Chakra responsive `Modal` size).
- Inside the modal: base `ProductView` renders for the clicked product with
  - product name, breadcrumb-suppressed header, image gallery, price, promo callouts;
  - variation swatches (color / size / etc.) — fully interactive, swap image and price;
  - quantity picker;
  - "Add to Bag" primary button.
- "Add to Bag" submits via the same SDK mutation chain PDP uses (`createBasket` if no basket exists, then `addItemToBasket`) and on success:
  1. closes the Quick View modal;
  2. opens the global `AddToCartModal` (existing PDP confirmation modal) with the just-added line item(s).
- Trigger does NOT navigate; PDP link on the tile (clicking the image / title) continues to navigate normally.
- Modal is dismissable via close button, overlay click, and `Escape`.
- Focus trap on open; focus restored to the originating trigger on close.
- Modal is a client-only render (`{isOpen && <Modal>}`) per `ssr-rendering.md`.

**Deferred / out of scope**

- Ship-to-store / Pick-up-in-Store delivery options inside Quick View (`showDeliveryOptions={false}`).
- Wishlist / favourite toggle inside the modal (the tile-level heart icon is unaffected).
- Product Sets / Bundles / Master with child products inside Quick View — for this iteration the modal renders simple-products-and-variants only. Sets/bundles fall back to "View Full Details" link.
- Recommended-products carousel inside Quick View.
- Bonus product selection inside Quick View.
- Einstein "view product" tracking on Quick View open (tile-click Einstein tracking is unchanged on PDP navigation).

**Edge cases**

- **Anonymous and registered shoppers** are both supported (basket creation handles guest SLAS path).
- **Out of stock variant chosen:** Add-to-Bag button disables and the inventory message renders inside the modal (base `ProductView` already does this — preserve).
- **Master product where no variant is yet chosen:** Add-to-Bag button disabled until a complete variation is selected (base `ProductView` behavior preserved).
- **Product Set / Bundle:** trigger renders a "View Full Details" link instead of opening the quick-view body (deferred).
- **Network failure on add-to-bag:** base `ProductView` shows an inline error toast; Quick View modal stays open so the shopper can retry.
- **API failure fetching the product detail (`useProduct` rejects):** modal shows an `*-error` fallback (per `pwa-kit-patterns.md` ErrorBoundary mandate) — does NOT crash the PLP route.
- **SSR:** Trigger button uses the `isMounted` pattern (per `ssr-rendering.md` §5 — this is the documented canonical example for PLP Quick View). Modal contents only mount on `isOpen` so `useProduct` does not fire during SSR for every tile.

## 3. UX Schematic

**Desktop (≥ md):**
```
┌─ tile ────────────────────────┐
│ ┌──────────image──────────┐  │
│ │                         │  │   ← on hover/focus, fade in:
│ │      [ Quick View ]  ●  │  │     centered button on image
│ └─────────────────────────┘  │
│ swatches  ○ ○ ○              │
│ Title                        │
│ $price                       │
└──────────────────────────────┘
```

**Mobile (< md):**
```
┌─ tile ────────────────────────┐
│ ┌──────────image──────────┐  │
│ │                       ⊕ │  │   ← persistent compact icon
│ │                         │  │     in top-right of image
│ └─────────────────────────┘  │
│ swatches  ○ ○ ○              │
│ Title                        │
│ $price                       │
└──────────────────────────────┘
```

**Quick View modal — desktop (centered, ~5xl):**
```
┌──────────────────────────────────────────────────┐
│ ╳                                                │
│ ┌────image gallery────┐  Heading                 │
│ │                     │  $price                  │
│ │                     │  Color  ○ ● ○            │
│ │                     │  Size   [S][M][L]        │
│ │                     │  Qty    [- 1 +]          │
│ └─────────────────────┘  ┌──────────────────┐   │
│                          │   Add to Bag     │   │
│                          └──────────────────┘   │
│                          View Full Details →    │
└──────────────────────────────────────────────────┘
```

**Quick View modal — mobile (full-screen sheet):**
gallery on top, controls scroll below, sticky "Add to Bag" footer.

## 4. Architectural Direction

**Reuse posture.** Wrap, do not re-implement. Headline reuse symbols the dev agent must reach for:

- `ProductView` — `@salesforce/retail-react-app/app/components/product-view`. Accepts `addToCart`, `showDeliveryOptions`, `showImageGallery`, `imageSize`, `category`, `customButtons`. Setting `showDeliveryOptions={false}` cleanly excludes the entire pickup/delivery RadioGroup, matching the "no ship-to-store" requirement without forking the component.
- `ProductTile` — `@salesforce/retail-react-app/app/components/product-tile`. The existing override at apps/commerce-storefront/overrides/app/components/product-tile/index.jsx is a transparent re-export today — extend it into a wrapper that renders the trigger overlay alongside the base tile.
- `useProduct` — `@salesforce/commerce-sdk-react`. On-demand product detail fetch when the modal opens.
- `useShopperBasketsV2Mutation as useShopperBasketsMutation` — `@salesforce/commerce-sdk-react`. Mutations: `createBasket`, `addItemToBasket`.
- `useCurrentBasket` — `@salesforce/retail-react-app/app/hooks/use-current-basket`. Source of the active basket id.
- `useAddToCartModalContext` + `<AddToCartModal>` — `@salesforce/retail-react-app/app/hooks/use-add-to-cart-modal`. Already mounted at app shell level by base PWA Kit; we *consume* its `onOpen({product, itemsAdded, selectedQuantity})` API after a successful basket mutation. Do **not** mount a second `AddToCartModal`.
- `useProductViewModal` — `@salesforce/retail-react-app/app/hooks/use-product-view-modal`. Existing helper that manages `useProduct` with controlled variation values and merges initial-tile data with detail response. Use this rather than re-orchestrating `useProduct` + `useVariant` by hand.

**Override surface (shape, not manifest).**

- One **tile-level trigger overlay** added to the existing `overrides/app/components/product-tile` override. The override stops being a transparent re-export and becomes a thin wrapper: render the base `ProductTile` via prop spread, plus a sibling overlay `<button>` positioned over the image, gated on `isMounted` and on `product.type` not being a set/bundle. Trigger calls a `onQuickView(product)` handler exposed via React context.
- One **Quick-View context provider** mounted near the app shell (alongside the existing `AddToCartModalProvider`) so any tile can call `onQuickView(product)`. Single source of `{ isOpen, openProduct, openQuickView, closeQuickView }`.
- One **Quick-View modal pair** under `overrides/app/components/quick-view-modal/` (shape: shell + body):
  - **Shell** — mounts `<Modal>` only when `isOpen` (no SSR-time render of children); responsive `size` (`full` on base, `5xl` on `lg`), close button, focus trap, ErrorBoundary wrapping the body with an `*-error` testid fallback.
  - **Body** — calls `useProductViewModal(initialProduct, controlledVariationValues)`, then renders `<ProductView>` with `showDeliveryOptions={false}`, `showImageGallery`, `addToCart={handler}`, `imageSize="md"`. Handler implements the slim PDP recipe: build `productItems`, call `createBasket` if needed otherwise `addItemToBasket`, on success call `closeQuickView()` then `addToCartModalContext.onOpen({product, itemsAdded, selectedQuantity})`. Errors surface via `useToast` (already wired by base `ProductView`).

**Data & state ownership.**

- **Server data** — `useProduct` (via `useProductViewModal`) owns the detail fetch; `useShopperBasketsMutation` owns basket writes. No bespoke `fetch` calls.
- **UI state** — `isOpen` and the active product live in the Quick-View context. Variation selections live inside `useDerivedProduct` / `useVariant` (already used by `ProductView`); we feed them through `controlledVariationValues` per the existing `useProductViewModal` contract.
- **Cache invalidation** — none new. `addItemToBasket` already invalidates basket queries; the global `AddToCartModal` reads from `useCurrentBasket` and reflects the new line item without further work.
- **Tile-click navigation** — UNCHANGED. The base tile's `<Link>` still navigates to PDP on image/title click; the Quick-View trigger sits as a sibling overlay and stops event propagation so it does not also trigger navigation.

**Framework nuances the dev agent must respect.**

- **SSR / hydration.** The trigger button is interactive and cannot collapse to `<a href>`, so it MUST follow the `isMounted` pattern in `ssr-rendering.md` §5 — `ssr-rendering.md` already names PLP Quick View as the canonical example. The modal contents MUST be gated on `{isOpen && <ModalShell />}` so `useProduct` never fires during SSR for the 25 tiles on the page. Top-level `Modal` open state lives in client React state seeded `false` so SSR HTML is identical pre- and post-hydration.
- **Portals.** Chakra `Modal` mounts into a `chakra-portal`. The dev agent must ensure pointer events on the trigger are not pre-empted by stacked overlays — but the existing `dismissOverlays` helper in specs already handles cookie/locale dialogs. No new portal management is required, just compliance with existing rules.
- **ErrorBoundary.** Wrap the modal body (containing `<ProductView>`) in `react-error-boundary`'s `ErrorBoundary`. Fallback testid MUST end in `-error` (per `pwa-kit-patterns.md` and `e2e-guidelines.md` §12).
- **i18n.** All user-visible strings (trigger label, modal title, "View Full Details" link, error fallback copy) go through `react-intl` `defineMessage` / `formatMessage`. Do not enumerate IDs here — dev agent owns the catalog. Trigger has both visible label (desktop) and `aria-label` (mobile/icon).
- **Accessibility.** Modal: `aria-labelledby` pointing at the product heading; focus trap default-on (Chakra); restore focus to trigger on close; close on `Escape`. Trigger: `aria-haspopup="dialog"`, `aria-controls={modalId}`. Swatches inherit base `ProductView` keyboard contract.
- **Prop-spread testid footgun.** The base `ProductTile` already accepts `data-testid` via the PLP page (`sf-product-tile-${productId}`), and our wrapper now adds new testids. Per `data-testid-contract.md` Override Prop-Spread Footgun, every new testid added by the override MUST live on a wrapper element that the override owns — never on the base component's root.
- **Set/Bundle exclusion.** Architectural decision in §7: trigger is hidden when `product.type?.set || product.type?.bundle`. Avoids dragging set/bundle handlers into a v1 Quick View.

**Reuse-vs-clone decision (per `reuse-audit.md`).**

| Surface | Decision | Rejected alternative |
|---|---|---|
| Product detail body | **Reuse** base `ProductView` with `showDeliveryOptions={false}` | Cloning a slim Quick-View body — rejected because it duplicates ~1000 lines including swatch/quantity/inventory logic. |
| Add-to-cart confirmation | **Reuse** existing global `<AddToCartModal>` via `useAddToCartModalContext` | Authoring a Quick-View-specific success state — rejected because shoppers expect the same confirmation surface PDP gives them. |
| Product detail fetch | **Reuse** `useProductViewModal` hook | Re-orchestrating `useProduct` + `useVariant` ourselves — rejected because the base hook already merges initial tile data with detail response and handles error toasts. |
| Add-to-cart side-effects | **Reuse** `useShopperBasketsMutation('createBasket' \| 'addItemToBasket')` directly with a slim handler | Calling base PDP's `handleAddToCart` — rejected because PDP's handler entangles pickup-in-store, multiship, Einstein, and product-set logic that are out of scope. We borrow the SDK calls and the modal-context hand-off, not the surrounding orchestration. |
| Modal shell | **Compose** Chakra `Modal` directly inside our override (responsive `size`) | Reusing `BonusProductSelectionModal` shell — rejected because it bakes in bonus-product layout. Quick-View needs a generic detail layout. |

## 5. Test Strategy

**Suite split.** Mock-backed only for v1, against the local dev server started by `playwright.config.ts` (`webServer: npm start`, port resolved via `STOREFRONT_URL` env override → defaults to `http://localhost:3000`). No `e2e/live/` suite this iteration — the live suite is reserved for cases where the mock-backed dev server cannot exercise the path. Spec file: apps/commerce-storefront/e2e/product-quick-view.spec.ts. Imports `test`/`expect` from `./fixtures` per `e2e-guidelines.md` §9. `awaitHydrated(page)` is called between `page.goto` and the first interaction. `dismissOverlays(page)` helper inlined per `e2e-guidelines.md` §19.

**Required testids.**

| testid | cardinality | location |
|---|---|---|
| `quick-view-trigger-{productId}` | many | tile-level overlay button (one per tile) |
| `quick-view-modal` | one | modal `ModalContent` `containerProps` (mirroring `add-to-cart-modal` pattern) |
| `quick-view-modal-error` | one | ErrorBoundary fallback inside modal body |
| `quick-view-add-to-cart-btn` | one | wrapper around base `ProductView` Add-to-Bag button |
| `quick-view-view-full-details-link` | one | "View Full Details" link inside modal |
| `add-to-cart-modal` | one | already shipped by base `AddToCartModal` — assert it appears post-add |

Existing testids reused by the spec: `sf-product-tile-{productId}`, `product-view`, `product-added`.

**Required flows.**

1. **`open-quick-view-from-tile`** — fixture: `plp-multi-color`. Steps: goto fixture URL → `awaitHydrated` → `dismissOverlays` → click `quick-view-trigger-{firstProductId}` → assert `quick-view-modal` visible → assert `product-view` visible inside modal (race against `quick-view-modal-error` and crash heading per three-outcome pattern, then assert `winner === 'content'`) → assert mechanically-derived console-error budget.

2. **`switch-color-swatch-in-quick-view`** — fixture: `plp-multi-color`. Open quick view as in flow 1, then click 2nd color swatch inside the modal, assert the active swatch testid updates and the gallery image changes (per existing `ProductView` swatch behavior). Console-error budget asserted.

3. **`add-to-bag-from-quick-view`** — fixture: `plp-add-to-bag`. Open quick view → ensure a complete variation is selected (first valid color + size) → click `quick-view-add-to-cart-btn` → assert `quick-view-modal` becomes hidden → assert `add-to-cart-modal` visible → assert at least one `product-added` row inside it. Console-error budget asserted. SCAPI basket endpoints MUST not return 4xx/5xx.

4. **`close-quick-view-restores-focus`** — fixture: `plp-multi-color`. Open quick view, press `Escape`, assert `quick-view-modal` hidden, assert `document.activeElement` is the originating `quick-view-trigger-{productId}`. Console-error budget asserted.

5. **`no-pickup-ui-in-quick-view`** *(negative)* — fixture: `plp-multi-color`. Open quick view, assert `pickup-select-store-msg`, `store-stock-status-msg`, and any `data-testid*=pickup` element are NOT visible. (These testids exist in the base `ProductView` and confirm `showDeliveryOptions={false}` is wired.)

6. **`add-to-bag-disabled-when-unavailable`** — fixture: `plp-add-to-bag`. Open quick view on a product that has at least one out-of-stock variant (e2e-runner discovers it by scanning tile inventory; if no OOS variant is found at runtime the E2E case is skipped with `test.skip()` and coverage degrades gracefully to the unit-test layer below). Steps: open quick view → select a color/size combination flagged unavailable in `useProduct` response (`orderable === false` or `inventory.stockLevel === 0`) → assert `quick-view-add-to-cart-btn` has `disabled` attribute set → assert the base `ProductView` inventory message (`data-testid="inventory-message"`) is visible inside the modal. Also covers the master-product-no-variant path: on initial open of a master product, before any variation is selected, `quick-view-add-to-cart-btn` MUST be `disabled`. The deterministic half of this assertion lives at the unit-test layer (see Test Strategy § *Unit coverage* below) so coverage is guaranteed even when the live storefront has no OOS variant available.

**Unit coverage (deterministic complement to flow 6).** Render-time tests against the Quick-View body component MUST cover: (a) `quick-view-add-to-cart-btn` disabled when the active variant has `orderable: false` or zero inventory; (b) `quick-view-add-to-cart-btn` disabled on a master product with no variation selected; (c) `quick-view-add-to-cart-btn` enabled once a complete, in-stock variation is selected. These tests stub `useProduct` / `useProductViewModal` and do not depend on the running storefront. They are the source of truth for the OOS-disabled requirement; flow 6 is a best-effort live-storefront probe.

Set/Bundle exclusion is enforced at the unit-test layer (provider/trigger render tests assert no trigger renders when `product.type.set || product.type.bundle`); not promoted to E2E because there is no guarantee a stable set/bundle category exists on the running storefront for v1.

**Test fixtures.**

```yaml
test_fixtures:
  - id: plp-multi-color
    url: /category/mens-accessories
    asserts:
      - { kind: http_status, value: 200, comparator: eq }
      - { kind: tile_count_min, value: 4, comparator: gte }
      - { kind: first_tile_swatch_count, value: 2, comparator: gte }
    rationale: |
      Verified against the running storefront on 2026-04-28: 13 tiles render
      on the PLP, the first tile renders 3 color swatches, and 5/13 tiles
      render >=2 color swatches overall. Stable multi-variant selection for
      both the open-quick-view and switch-swatch flows. config/default.js
      sets url.locale = 'none' and url.site = 'none' so no locale/site
      prefix is required. Earlier candidates (womens-jewelry-earrings,
      womens-clothing-tops/dresses/bottoms/jackets) were rejected because
      their first tile renders only one color swatch, which would fail the
      first_tile_swatch_count assertion and leave the deterministic
      switch-swatch flow with no multi-color tile to land on.

  - id: plp-add-to-bag
    url: /category/womens-clothing-dresses
    asserts:
      - { kind: http_status, value: 200, comparator: eq }
      - { kind: tile_count_min, value: 4, comparator: gte }
      - { kind: in_stock, value: true, comparator: eq }
    rationale: |
      User-confirmed running-storefront category with reliably in-stock
      dress products on 2026-04-28: 25 tiles render on the PLP. Most tiles
      expose a single color swatch on the tile but a full color+size
      variation matrix on the modal body, which is sufficient for the
      add-to-bag happy path (the flow only needs *a* complete variation,
      not >=2 colors). `mens-accessories` is intentionally NOT reused for
      this fixture because its accessory inventory has historically been
      thinner; dresses are the most reliably in-stock surface on this
      storefront. If e2e-runner finds the first tile out of stock, the
      fixture is rejected and spec-compiler picks a sibling category with
      stock.
```

**Negative assertions** (one per deferred item in §2):

- Pickup / Ship-to-Store UI must NOT render inside `quick-view-modal` (testid contains `pickup` or matches `store-stock-status-msg`).
- Wishlist / favourite toggle must NOT render inside `quick-view-modal`.
- Recommended-products carousel must NOT render inside `quick-view-modal`.
- Bonus product selection must NOT render inside `quick-view-modal`.
- Modal must NOT render product-set / product-bundle child layout (no `data-testid="product-bundle-children"` etc.).

**Forbidden network failures** during all flows:

- `scapi/products` (`useProduct` calls)
- `scapi/baskets` (`createBasket`, `addItemToBasket`)
- `scapi/inventory` (variant orderability checks)

These MUST not return 4xx (excluding 401 SLAS guest-auth noise per `e2e-guidelines.md` §5) or 5xx during the recorded flows. The auto-fixture `failed-requests` attachment plus the mechanical baseline-derived console-error allowlist enforces this.

## 6. Phased Delivery Plan

1. **Phase 1 — Quick-View context + modal scaffold (no real body).** Add a `QuickViewModalProvider` mounted near the app shell, expose `useQuickView()`, render an empty modal shell with `quick-view-modal` and `quick-view-modal-error` testids, focus trap, responsive size. Goal: open/close round-trip works, ErrorBoundary fallback renders if forced. Independently demoable via a temporary debug trigger.

2. **Phase 2 — Tile-level trigger (depends on 1).** Extend `overrides/app/components/product-tile/index.jsx` from a transparent re-export to a wrapper that renders the base tile plus a hover/focus-revealed (desktop) / persistent-icon (mobile) trigger gated on `isMounted` and on `product.type` not being set/bundle. Trigger calls `useQuickView().openQuickView(product)`. Visual polish: opacity transitions, focus ring, aria attributes. Independently demoable: tile click opens the empty modal scaffold from Phase 1.

3. **Phase 3 — Modal body with real `ProductView` (depends on 2).** Inside the modal body, call `useProductViewModal(openProduct)`, render `<ProductView>` with `showDeliveryOptions={false}`, `showImageGallery`, `imageSize="md"`. Add the "View Full Details" link to the PDP route. No add-to-bag wiring yet — pass an `addToCart` no-op so swatches / gallery are exercisable. Independently demoable: full quick-view UX minus add-to-bag.

4. **Phase 4 — Add-to-bag wiring (depends on 3).** Implement the slim handler: `useShopperBasketsMutation('createBasket' | 'addItemToBasket')`, `useCurrentBasket` for active basket id, on success call `closeQuickView()` then `useAddToCartModalContext().onOpen({product, itemsAdded, selectedQuantity})`. Independently demoable: full happy path; flow 3 of §5 passes.

5. **Phase 5 — Test surface + i18n + a11y polish (depends on 4).** Author `e2e/product-quick-view.spec.ts` covering all required flows (including the best-effort `add-to-bag-disabled-when-unavailable` flow), add unit tests for the provider and trigger (set/bundle no-trigger assertion) plus the deterministic OOS-disabled / master-no-selection / enabled-when-ready assertions on `quick-view-add-to-cart-btn`, finalize `defineMessage` catalog entries, audit aria attributes and focus restoration, run the `e2e-guidelines.md` self-review greps. Independently demoable: green CI.

## 7. Decisions

- **Reuse `<ProductView>` with `showDeliveryOptions={false}` instead of cloning a slim body** — rejected cloning because the prop already exists on the base component and cleanly excludes the entire pickup RadioGroup. Cited: `reuse-audit.md`.
- **Reuse the global `<AddToCartModal>` for confirmation instead of authoring a Quick-View-specific success surface** — rejected the bespoke surface because it would diverge from PDP UX and duplicate the basket-line preview already rendered by `AddToCartModal`. Cited: user request "copy pdp behavior", `reuse-audit.md`.
- **Use `useProductViewModal` rather than orchestrating `useProduct` + `useVariant` by hand** — rejected the bespoke orchestration because the base hook already merges initial tile data with the fetched detail and handles error toasts. Cited: `reuse-audit.md` ("Hooks first").
- **Trigger uses the `isMounted` pattern, not `<a href>`** — the trigger is structurally interactive (opens a portal that fetches data); cannot be expressed as a navigation. `ssr-rendering.md` §5 already names PLP Quick View as the canonical isMounted example.
- **Modal contents gated on `{isOpen && <Body />}`** — rejected an always-mounted body because `useProduct` would fire on every SSR request for every tile. Cited: `ssr-rendering.md`.
- **Set / Bundle products show no trigger in v1** — rejected supporting them because the bundle/set add-to-bag handler in base PDP is materially more complex (`handleChildProductValidation`, `childProductRefs`, etc.). v2 can lift the trigger guard. Cited: scope.
- **Mock-backed E2E only for v1** — rejected adding an `e2e/live/` suite because the running dev server already exercises the SCAPI proxy; live coverage is reserved for paths the local server cannot represent.
- **Set/Bundle exclusion verified at unit-test layer, not E2E** — rejected an E2E negative flow because no stable set/bundle category is guaranteed to exist on the running storefront. A unit test against the trigger component asserting `null` render for `product.type.set || product.type.bundle` is deterministic and cheap.
- **Add-to-bag fixture URL `/category/womens-clothing-dresses`** — user-confirmed as the most reliably in-stock category on this storefront on 2026-04-28. The add-to-bag flow does not require multi-color tiles (only a complete variation), so we accept the fixture's single-swatch first tile in exchange for stock reliability. The two-fixture split (`plp-multi-color` vs. `plp-add-to-bag`) keeps each fixture's runtime assertions minimal and orthogonal: swatch coverage on one, stock reliability on the other.
- **OOS-disabled requirement is unit-tested as the source of truth, with a best-effort E2E probe** — rejected making the E2E flow load-bearing because guaranteeing an OOS variant on a live storefront is fragile. Unit tests against `quick-view-add-to-cart-btn` cover the disabled state deterministically (orderable=false, master-no-selection, enabled-when-ready); flow 6 (`add-to-bag-disabled-when-unavailable`) opportunistically validates the same behavior end-to-end and skips when no OOS variant is discoverable. Cited: `e2e-guidelines.md` (three-outcome contract; degrade gracefully when the storefront cannot deterministically surface a precondition).
- **Fixture URL `/category/mens-accessories`** — chosen over `/category/womens-jewelry-earrings` after validating the running storefront on 2026-04-28: every tile in `womens-jewelry-earrings` renders only one color swatch, so both the `first_tile_swatch_count >= 2` runtime assertion and the deterministic switch-swatch E2E flow would fail. `mens-accessories` is the only probed category whose first tile renders ≥2 swatches. Cited: `spec-compilation.md` (fixture URL must be verifiable against the running storefront).
- **Fixture URL kept locale- and site-prefix-free** — confirmed against `config/default.js` (`url.locale: 'none'`, `url.site: 'none'`). Cited: `spec-compilation.md`.
