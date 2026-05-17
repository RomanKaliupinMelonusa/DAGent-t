# Phase 1 — Data Model: PLP Product Quick View Modal

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)
**Branch**: `001-plp-quick-view` | **Date**: 2026-05-06

The feature is client-side UI on top of a PWA Kit storefront. There is no new persistent data model and no new SCAPI surface. The "model" here is the **runtime UI state and the public shapes** the development session must produce so the unit-test session can target them deterministically.

---

## 1. `QuickViewContextValue` (UI state)

The Quick View provider exposes a single React context whose value is:

| Field | Type | Description |
| --- | --- | --- |
| `isOpen` | `boolean` | `true` when the modal is currently open. Seeded `false` on every render path (including SSR) to keep server-rendered HTML stable. |
| `openProduct` | `ProductSummary \| null` | The product handed to `openQuickView`. `null` when the modal is closed. |
| `openQuickView` | `(product: ProductSummary) => void` | Opens the modal for the given product. Idempotent if called while already open with the same product; replaces `openProduct` if a different product is passed. |
| `closeQuickView` | `() => void` | Closes the modal and clears `openProduct`. Safe to call when already closed. |

### State transitions

```
       openQuickView(product)
closed ─────────────────────────► open(product)
   ▲                                    │
   │                                    │ openQuickView(product')   (replace product)
   │                                    │
   │                                    ▼
   │                              open(product')
   │                                    │
   │  closeQuickView() / Escape /       │
   │  overlay click / close button      │
   └────────────────────────────────────┘
```

### Lifecycle invariants

- `isOpen === false` ⇔ `openProduct === null`.
- The provider does **not** persist state across navigations. Closing the modal returns the context to its initial state.
- The provider does **not** fire any data fetch by itself. Detail fetches are owned by the modal body via `useProductViewModal`.

## 2. `ProductSummary` (input shape consumed by the trigger)

The narrow shape passed from a tile into `openQuickView`. This is a strict subset of the PLP search hit returned by SCAPI / shipped through the base `ProductTile` props. Only fields the trigger and modal seed need to read are listed; consumers MUST treat unknown fields as forward-compatible.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | `string` | yes | Used to compose the testid `quick-view-trigger-{id}` and as the `useProduct` cache key. |
| `name` | `string` | yes | Initial heading, replaced when SCAPI detail resolves inside the modal. |
| `type` | `{ set?: boolean; bundle?: boolean; master?: boolean; variant?: boolean }` | no | Drives the set/bundle exclusion rule (R-007). |
| `imageGroups` / `image` | (passthrough) | no | Forwarded to `useProductViewModal` as the initial product so first paint shows the tile's hero image without waiting for detail. |
| `price` / `priceRanges` / `currency` | (passthrough) | no | Same — initial paint price. |
| `variants` / `variationAttributes` | (passthrough) | no | Used by `useProductViewModal` to merge with detail response. |

### Validation rules

- `id` MUST be a non-empty string. The trigger MUST NOT render if `id` is missing.
- If `type.set === true` OR `type.bundle === true`, the trigger MUST NOT render at all. (Hard exclusion.)

## 3. Active variation state (delegated)

Inside the modal body, the active variation (selected color/size, derived variant id, image gallery for that variant, inventory state, orderable flag) is owned by the existing `useProductViewModal` + `useDerivedProduct` + `useVariant` chain provided by `@salesforce/retail-react-app`. **This feature does not redefine these shapes.** The unit-test contract treats `useProductViewModal` as a stubbable boundary; the test session feeds canned return values rather than asserting against the real shape.

Consumers in this feature read only:

- `productViewModal.product` — passed through to `<ProductView>`.
- `productViewModal.variant` — used inside the slim Add-to-Bag handler to compute `productItems`.
- `productViewModal.quantity` — used inside the slim Add-to-Bag handler to populate the basket payload.
- `productViewModal.error` — surfaces to the ErrorBoundary fallback.

## 4. Add-to-Bag side-effect payload

When the user clicks `quick-view-add-to-cart-btn`, the slim handler builds:

```ts
type ProductItem = {
  productId: string;       // selected variant id
  quantity: number;        // selectedQuantity
  // (no inventoryId / shipmentId — pickup is out of scope)
};
```

- If `useCurrentBasket().basket?.basketId` is `undefined`, the handler calls `createBasket({ body: { productItems: [productItem] } })`.
- Otherwise it calls `addItemToBasket({ parameters: { basketId }, body: [productItem] })`.
- On success, the resolved `productItem` plus a refreshed `basket.productItems` view is fed into `addToCartModalContext.onOpen({ product, itemsAdded: [productItem], selectedQuantity })`.

The exact serialization mirrors what PDP's `handleAddToCart` does for the simple-product / master-variant path; **no pickup or shipment fields are included** — that is the explicit FR-004 contract.

## 5. Error surfaces

| Error origin | UI surface |
| --- | --- |
| `useProductViewModal` rejects (detail fetch failure) | `quick-view-modal-error` ErrorBoundary fallback inside the modal body |
| `createBasket` / `addItemToBasket` rejects | Inline error toast / message via base `ProductView`'s existing error path; modal stays open |
| Set/bundle product reaches the modal (should be impossible due to trigger gating) | Defensive: render the error fallback rather than crash |

## 6. Out-of-model items

- Persistent storage — none. No localStorage, sessionStorage, cookies, or query-params are touched by this feature.
- Analytics — none in v1 (Einstein "view product" tracking is out of scope per spec).
- Server-side state — none. The provider's state lives entirely in client memory.
