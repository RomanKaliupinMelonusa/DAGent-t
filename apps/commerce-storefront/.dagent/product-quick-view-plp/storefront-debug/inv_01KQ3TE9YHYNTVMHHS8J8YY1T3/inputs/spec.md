# Plan: Product Quick View on PLP (commerce-storefront)

A quick-view modal launched from each product tile on the PLP. Shows the product like the PDP — images, swatches with PDP-identical OOS treatment, quantity stepper, **Add to Cart**, wishlist, price/promos — **but no ship-to-store / pickup-in-store / delivery options** (a separate ticket adds those).

## Approach (TL;DR)

- The base retail-react-app already ships a `ProductViewModal` (`@salesforce/retail-react-app/app/components/product-view-modal`) that renders `<ProductView>` inside a Chakra `Modal`. `ProductView` already supports a `showDeliveryOptions` prop and reuses the exact `ImageGallery` + `SwatchGroup`/`Swatch` (with `disabled={!orderable}`) the PDP uses.
- Wrap the base `ProductViewModal` in a thin `QuickViewModal` that:
  1. Wires `addToCart` via `useShopperBasketsMutation('addItemToBasket')` + the existing `useAddToCartModal` toast/modal flow.
  2. Wires `addToWishlist` via the same `useWishList` + `createCustomerProductListItem` flow already used by `pages/product-list/index.jsx`.
  3. Forces `showDeliveryOptions={false}` (kills the ship-to-store / pickup section).
  4. Lets us still pass `showFullLink` so users can jump to the PDP for details.
- Add the launch trigger as an overlay button inside the existing overridden `ProductTile`.

This keeps blast radius minimal (one wrapper component + one tile override change) while getting the full add-to-cart UX for free.

## Phase 1 — Trigger on `ProductTile`

**Steps**

1. Convert [apps/commerce-storefront/overrides/app/components/product-tile/index.jsx](apps/commerce-storefront/overrides/app/components/product-tile/index.jsx) from passthrough re-export into a thin wrapper:
   - Render the base `ProductTile` inside `Box position="relative" role="group"`.
   - Add absolutely-positioned **Quick View trigger** button.
   - Manage modal `useDisclosure()` locally; lazy-import `QuickViewModal` (`React.lazy` + `Suspense`) to keep the PLP bundle light.
   - On trigger click: `e.preventDefault(); e.stopPropagation()` so the underlying tile `<Link>` doesn't navigate.
   - Re-export `Skeleton` unchanged.
2. Trigger UX:
   - **Desktop (≥ md)**: hidden by default, revealed via Chakra `_groupHover`. Centered button on the image: `<Button leftIcon={<SearchIcon />}>Quick View</Button>`.
   - **Mobile (< md)**: always-visible compact circular `IconButton` (44×44 tap target) anchored top-right of the image.
   - Both have `aria-label`, focusable via keyboard, `data-testid="quick-view-trigger"`.
3. Skip the trigger when the hit is a product set or bundle (`hit.hitType === 'set'` / `'bundle'` or `product.type.set` / `product.type.bundle`). Sets/bundles need multi-product UIs that don't fit a quick view — those tiles continue to navigate to the PDP on click. Also skip when the hit has no `variationAttributes` and no `imageGroups`.
4. New i18n key: `product_tile.button.quick_view` ("Quick View"), picked up by `npm run extract-default-translations`.

## Phase 2 — `QuickViewModal` wrapper

**Steps**

5. Create [apps/commerce-storefront/overrides/app/components/quick-view-modal/index.jsx](apps/commerce-storefront/overrides/app/components/quick-view-modal/index.jsx) exporting `QuickViewModal`.
   - Props: `{ productId, productHit, isOpen, onClose }`.
   - Internally:
     - `useProduct({parameters: {id: productId, allImages: true}}, {enabled: isOpen})` — lazy fetch on open; react-query caches reopen.
     - `useShopperBasketsMutation('addItemToBasket')` + (if no basket) `useShopperBasketsMutation('createBasket')`, mirroring the pattern in base `pages/product-detail/index.jsx`.
     - `useAddToCartModal()` so the standard "Added to bag" confirmation modal pops over the quick view (consistent with PDP UX).
     - `useWishList()` + `useShopperCustomersMutation('createCustomerProductListItem')` / `deleteCustomerProductListItem` for wishlist toggle, copying the helpers already in [apps/commerce-storefront/.apm/reference/retail-react-app/api-surface.json](apps/commerce-storefront/.apm/reference/retail-react-app/api-surface.json) → `app/pages/product-list/index.jsx`.
     - Build `addToCart`, `addToWishlist`, `updateWishlist` callbacks with the same signatures `ProductView` expects.
   - Render the **base** `ProductViewModal`:
     ```
     <ProductViewModal
       isOpen={isOpen}
       onOpen={...}        // required by base propTypes; pass a noop or the disclosure onOpen
       onClose={onClose}
       product={product || productHit}   // hit is fine until full product loads
       isLoading={isFetching && !product}
       addToCart={addToCart}
       addToWishlist={addToWishlist}
       updateWishlist={updateWishlist}
       showDeliveryOptions={false}       // ← kills ship-to-store / pickup-in-store
       showFullLink={true}               // ← keeps the "See full details" PDP link
     />
     ```
   - Add `data-testid="quick-view-modal"` (base modal already exposes `product-view-modal` testid; we add a wrapping marker so the e2e can disambiguate from a PDP-context modal).
6. Verify `showDeliveryOptions={false}` flows through. Inspecting `ProductView` (retail-react-app v9.1.1) confirms the prop is destructured and gates the entire pickup/delivery JSX block; `pickupInStore`, `setPickupInStore`, `onOpenStoreLocator` are not required when `showDeliveryOptions` is false. If a future patch reintroduces a hard-coded path, the dependency-pinning advisory diff will flag it.

## Phase 3 — Tests + i18n

**Steps**

7. Unit test [apps/commerce-storefront/overrides/app/components/quick-view-modal/index.test.jsx](apps/commerce-storefront/overrides/app/components/quick-view-modal/index.test.jsx) using `renderWithProviders` from `@salesforce/retail-react-app/app/utils/test-utils` and MSW handlers for `*/products/:productId` (returning `mockProductDetail`) and `*/baskets`. Assert:
   - Modal opens, `[data-testid="quick-view-modal"]` & `[data-testid="product-view-modal"]` visible.
   - Swatches render; an OOS swatch carries `aria-disabled="true"` (PDP parity).
   - Selecting a different swatch swaps the gallery's main image `src`.
   - Quantity stepper present and usable.
   - Clicking "Add to Cart" triggers the basket mutation with `{productId: variantId, quantity}`.
   - **No** elements with `data-testid` containing `pickup`, `store-locator`, or `delivery` are rendered (regression guard for the no-ship-to-store requirement).
   - "See full details" link href ends with `/product/<masterId>` and includes the chosen color in the query.
8. Unit test for the tile override: trigger appears, click stops propagation (history unchanged), modal opens.
9. Playwright e2e [apps/commerce-storefront/e2e/plp-quick-view.spec.ts](apps/commerce-storefront/e2e/plp-quick-view.spec.ts):
   - Visit `/uk/en-GB/category/mens-clothing-jackets`.
   - Open quick view on first tile (hover desktop project, tap on Mobile Safari project).
   - Assert modal visible, no `pickup-in-store` / `store-locator` testids visible.
   - Switch swatch → main image src changes.
   - Click "Add to Cart" → expect cart count badge in nav increments.
   - Close modal → URL is unchanged from the PLP route.
10. Run `cd apps/commerce-storefront && npm run build-translations` so `translations/en-US.json` (+ pseudo) get the new `product_tile.button.quick_view` id.

## Schematic — Desktop (≥ md, modal `size="4xl"`, ~896px wide)

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                  ✕   │
│  ┌───────────────────────────────┐  ┌────────────────────────────┐   │
│  │      ┌─────────────────┐      │  │  Long Sleeve Crew Neck     │   │
│  │      │   MAIN IMAGE    │      │  │  £29.99   ̶£̶3̶9̶.̶9̶9̶            │   │
│  │      └─────────────────┘      │  │  ★★★★☆ (24)                 │   │
│  │   ▣ ▣ ▣ ▣ ▣  ← thumbnails    │  │                            │   │
│  │                               │  │  Color: Ivory              │   │
│  │   See full details →          │  │  ⬤ ⬤ ⬤ ⊘ ⬤    ← OOS = ⊘  │   │
│  │                               │  │                            │   │
│  │                               │  │  Size                      │   │
│  │                               │  │  [XS][S][M][L̶][XL]  ← OOS │   │
│  │                               │  │                            │   │
│  │                               │  │  Quantity:  [ – ] [1] [+]  │   │
│  │                               │  │                            │   │
│  │                               │  │  ┌──────────────────────┐  │   │
│  │                               │  │  │   Add to Cart        │  │   │  ← primary CTA
│  │                               │  │  └──────────────────────┘  │   │
│  │                               │  │  ♡  Add to Wishlist        │   │
│  │                               │  │                            │   │
│  │                               │  │  ── (no Ship-to-Store) ──  │   │  ← intentionally absent
│  └───────────────────────────────┘  └────────────────────────────┘   │
│        Left: ImageGallery (50%)         Right: ProductView (50%)     │
└──────────────────────────────────────────────────────────────────────┘
```

## Schematic — Mobile (< md, `size="full"`, slide-in-bottom)

```
┌─────────────────────────────────┐
│                             ✕   │ ← sticky close
├─────────────────────────────────┤
│      ┌─────────────────┐        │
│      │   MAIN IMAGE    │        │ ← swipeable carousel (ImageGallery)
│      │   (carousel)    │        │
│      └─────────────────┘        │
│           ● ○ ○ ○ ○             │
├─────────────────────────────────┤
│  Long Sleeve Crew Neck          │
│  £29.99   ̶£̶3̶9̶.̶9̶9̶                 │
│  ★★★★☆ (24)                      │
│                                 │
│  Color: Ivory                   │
│  ⬤ ⬤ ⬤ ⊘ ⬤                      │
│                                 │
│  Size                           │
│  [XS] [S] [M] [L̶] [XL]          │
│                                 │
│  Quantity:  [ – ] [1] [+]       │
│                                 │
│  ┌──────────────────────────┐   │
│  │      Add to Cart         │   │ ← full-width sticky on small screens
│  └──────────────────────────┘   │
│  ♡  Add to Wishlist             │
│                                 │
│  See full details →             │
│                                 │
│  (no Ship-to-Store, no pickup)  │
└─────────────────────────────────┘
```

## Trigger placement on the tile

```
Desktop (revealed on hover):     Mobile (always visible):
┌──────────────────┐             ┌──────────────────┐
│                  │             │              ⊕   │ ← top-right icon
│   PRODUCT IMAGE  │             │   PRODUCT IMAGE  │
│  ┌────────────┐  │             │                  │
│  │ Quick View │  │             │                  │
│  └────────────┘  │             │                  │
└──────────────────┘             └──────────────────┘
   Name  £29.99                     Name  £29.99
```

## Relevant files

- [apps/commerce-storefront/overrides/app/components/product-tile/index.jsx](apps/commerce-storefront/overrides/app/components/product-tile/index.jsx) — convert from re-export to wrapper; add trigger button + lazy-mounted modal.
- [apps/commerce-storefront/overrides/app/components/quick-view-modal/index.jsx](apps/commerce-storefront/overrides/app/components/quick-view-modal/index.jsx) — **new**, thin wrapper around base `ProductViewModal` that injects `addToCart`/`addToWishlist`/`updateWishlist` and `showDeliveryOptions={false}`.
- [apps/commerce-storefront/overrides/app/components/quick-view-modal/index.test.jsx](apps/commerce-storefront/overrides/app/components/quick-view-modal/index.test.jsx) — **new**, unit tests including the no-ship-to-store regression assertion.
- [apps/commerce-storefront/overrides/app/components/product-tile/index.test.jsx](apps/commerce-storefront/overrides/app/components/product-tile/index.test.jsx) — **new**, trigger + open-modal test.
- [apps/commerce-storefront/e2e/plp-quick-view.spec.ts](apps/commerce-storefront/e2e/plp-quick-view.spec.ts) — **new**, Playwright e2e (Chromium + Mobile Safari).
- Reused from base unchanged: `app/components/product-view-modal`, `app/components/product-view`, `app/components/image-gallery`, `app/components/swatch-group` + `swatch-group/swatch`, `app/components/display-price`, `app/hooks/use-add-to-cart-modal`, `app/hooks/use-derived-product`, `useProduct`/`useShopperBasketsMutation`/`useShopperCustomersMutation` from `@salesforce/commerce-sdk-react`, `app/utils/url.productUrlBuilder`.

## Verification

1. `cd apps/commerce-storefront && npm run lint && npm test -- quick-view-modal product-tile` — all unit suites green.
2. `npm start` then open `/uk/en-GB/category/mens-clothing-jackets`:
   - **Desktop**: hover any tile → "Quick View" button appears → click → modal opens, swatches render with at least one OOS (`aria-disabled="true"`), quantity stepper works, **Add to Cart** triggers the standard added-to-cart confirmation modal and increments the nav cart badge, wishlist heart toggles. **No "Ship to Store", "Pick up in store", or "Delivery options" UI is anywhere in the modal.**
   - **Mobile (375×812 devtools)**: top-right icon visible without hover; modal slides in full-screen; same behaviour as desktop; CTA reachable without scrolling past the swatches.
3. `npx playwright test e2e/plp-quick-view.spec.ts` green on Chromium + Mobile Safari projects.
4. `npm run build-translations` produces a non-zero diff containing `product_tile.button.quick_view`; pseudo-locale build doesn't error.
5. `npm run analyze-build` — `main.js` stays under the 44 kB `bundlesize` gate (modal is `React.lazy`, basket/wishlist hooks are already in the existing PLP bundle).
6. Grep guard: `rg -n "pickup|store-locator|delivery" apps/commerce-storefront/overrides/app/components/quick-view-modal` returns zero hits.

## Decisions

- **Reuse base `ProductViewModal`, don't fork.** Now that add-to-cart / quantity / wishlist are required, the base modal already gives us all of it. The only flip we need is `showDeliveryOptions={false}`, which is a first-class `ProductView` prop in v9.1.1.
- **Wrapper, not a fork.** `QuickViewModal` only injects handlers + the no-delivery flag; if the base modal evolves, we inherit the changes. The `dependency-pinning.ts` preflight will warn us if a base API changes.
- **Lazy fetch on open.** Avoids N extra `getProduct` calls per category page; react-query caches per `productId`.
- **No PLP page fork.** Trigger lives in the existing `ProductTile` override (already in `overrides/`).
- **Use the existing `useAddToCartModal` toast.** UX consistent with PDP.
- **Excluded (this ticket):** ship-to-store, pickup-in-store, store-locator integration, delivery options — flagged off via `showDeliveryOptions={false}`. The "See full details" link sends the user to the PDP for those for now. Next ticket will introduce a quick-view-aware ship-to-store flow.
- **Sets / bundles get no quick-view trigger.** Their tiles still navigate to the PDP on click; a multi-product quick view is out of scope.
- **Bonus-product ladders pass through.** If add-to-cart triggers `useBonusProductSelectionModal`, that modal opens on top of the quick view as it already does on the PDP. The Playwright e2e adds a smoke check for one such product to lock this behaviour in.
- **No URL deep link.** No `?quickview=<id>` param this ticket — keeps the PLP URL untouched on open/close. Can be added later without breaking changes.

