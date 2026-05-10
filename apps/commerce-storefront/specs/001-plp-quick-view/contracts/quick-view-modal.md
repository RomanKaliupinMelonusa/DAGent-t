# Contract: Quick View Modal (Shell + Body)

**Feature**: [../spec.md](../spec.md) | **Plan**: [../plan.md](../plan.md)
**Modules**:
- Shell — `apps/commerce-storefront/overrides/app/components/quick-view-modal/modal-shell.jsx`
- Body — `apps/commerce-storefront/overrides/app/components/quick-view-modal/modal-body.jsx`

The shell and body are split so the shell can be mounted unconditionally inside the provider while the body is gated on `isOpen` (so its hooks — most notably `useProductViewModal` — never run during SSR or while the modal is closed).

---

## A. `QuickViewModalShell`

### Props

None (shell consumes context internally via `useQuickView`).

### Render rules

1. Read `{ isOpen, openProduct, closeQuickView } = useQuickView()`.
2. If `!isOpen || !openProduct` → render `null`. (Body never mounts; `useProductViewModal` never runs.)
3. Otherwise render Chakra `<Modal isOpen onClose={closeQuickView} ...>`:
   - `size`: responsive — `full` on base, `5xl` on `lg`.
   - `isCentered` on desktop sizes.
   - `returnFocusOnClose` defaults to `true` (Chakra default).
   - `closeOnOverlayClick` `true`.
   - `closeOnEsc` `true`.
   - `aria-labelledby` set to the same id used by the body's heading element (`"quick-view-modal-title"` is a stable example; the body MUST render an element with that id).

### DOM contract

- The `ModalContent` element MUST expose `data-testid="quick-view-modal"`.
- A close affordance (Chakra's `<ModalCloseButton />` is acceptable) MUST be present and call `closeQuickView` on activation. Pressing `Escape` and clicking the overlay MUST also call `closeQuickView` (Chakra's defaults satisfy this).
- The body is wrapped in `react-error-boundary`'s `<ErrorBoundary>` whose fallback element MUST expose `data-testid="quick-view-modal-error"`. The fallback copy is localized.

### Behavior

- The shell does NOT mount until `isOpen` is true. This means children's `useEffect`s and hooks (notably `useProductViewModal`) run only after the user explicitly opens the modal.
- The shell does NOT call any data fetches itself.

---

## B. `QuickViewModalBody`

### Props

None (consumes context).

### Render rules

1. Read `{ openProduct, closeQuickView } = useQuickView()`.
2. Read `addToCartModalContext = useAddToCartModalContext()`.
3. Call `productViewModal = useProductViewModal(openProduct)` (controlled variation values stay default — base hook contract).
4. Render an element with `id="quick-view-modal-title"` containing the product name (anchor for the shell's `aria-labelledby`).
5. Render `<ProductView>` with these props:
   - `product={productViewModal.product}`
   - `showDeliveryOptions={false}`           ← FR-004 enforcement
   - `showImageGallery`
   - `imageSize="md"`
   - `category={undefined}`
   - `addToCart={handleAddToCart}`           ← slim handler defined below
6. Below the `ProductView`, render a "View Full Details" `<Link>` with:
   - `data-testid="quick-view-view-full-details-link"`
   - `to={pdpUrlFor(openProduct)}` (use the existing PWA Kit URL builder)
   - `onClick` calls `closeQuickView()` so the modal is dismissed during navigation.
7. Wrap the `ProductView`'s Add-to-Bag button via `customButtons` (or a wrapper div, per the prop-spread footgun) so the button exposes `data-testid="quick-view-add-to-cart-btn"`. The wrapper element — NOT the base button itself — owns the testid. The wrapper element MUST forward the base button's `disabled` attribute so unit tests asserting on `disabled` see it on the testid'd element.

### `handleAddToCart` (slim handler)

Defined in the body, closed over `productViewModal`, `useCurrentBasket`, the basket mutations, and `addToCartModalContext`:

```jsx
const { data: basket } = useCurrentBasket();
const createBasket = useShopperBasketsMutation('createBasket');
const addItemToBasket = useShopperBasketsMutation('addItemToBasket');

const handleAddToCart = async (productItems, selectedQuantity) => {
  try {
    if (!basket?.basketId) {
      await createBasket.mutateAsync({ body: { productItems } });
    } else {
      await addItemToBasket.mutateAsync({
        parameters: { basketId: basket.basketId },
        body: productItems
      });
    }
    closeQuickView();
    addToCartModalContext.onOpen({
      product: productViewModal.product,
      itemsAdded: productItems,
      selectedQuantity
    });
  } catch (err) {
    // Base ProductView surfaces the inline error via its existing toast pipeline.
    // We rethrow so it stays inside the ProductView contract.
    throw err;
  }
};
```

The handler signature must match what `<ProductView>`'s `addToCart` prop expects (per the upstream PWA Kit contract — `(productItems, selectedQuantity) => Promise<void>`).

### Error boundary contract

When `useProductViewModal` returns an error (or any descendant throws during render), the shell's `ErrorBoundary` catches it and renders the localized fallback under `data-testid="quick-view-modal-error"`. The shell itself MUST remain mounted (so the close button still works).

### Pickup/Ship-to-Store negative contract (FR-004)

- The body MUST NOT render any element with `data-testid` containing the substring `pickup`.
- The body MUST NOT render `pickup-select-store-msg` or `store-stock-status-msg`.
- The body MUST NOT render any string matching `/pickup|ship to store|pick up/i`.
- The mechanism for enforcement is `showDeliveryOptions={false}` on `<ProductView>` — the development session MUST NOT add any other UI that surfaces these strings.

### Test contract surface

Per `unit-tests.md`:
- UT-SHELL-001..005 — gated mount, close paths, error boundary fallback.
- UT-BODY-001..015 — rendering, no-pickup, testids, enable/disable rules, success/failure paths.
- UT-A11Y-001..003 — `aria-labelledby`, `aria-haspopup` on trigger, focus restoration.

Per `e2e-tests.md`:
- Flows E2E-001 (open), E2E-002 (swatch), E2E-003 (add-to-bag), E2E-004 (close & focus), E2E-005 (no pickup), E2E-006 (disabled), E2E-007 (view full details), E2E-008 (tile-click regression) all bind to the testids defined above.

---

## C. Stable identifiers (single source of truth)

| Identifier | Kind | Owner element |
| --- | --- | --- |
| `quick-view-modal` | testid | `ModalContent` (shell) |
| `quick-view-modal-error` | testid | ErrorBoundary fallback (shell) |
| `quick-view-add-to-cart-btn` | testid | wrapper around base Add-to-Bag button (body) |
| `quick-view-view-full-details-link` | testid | `<Link>` (body) |
| `quick-view-modal-title` | DOM `id` | heading element inside body (anchor for `aria-labelledby`) |

If the development session needs to deviate from any of the above, this contract MUST be updated first and the dependent test specs (`e2e-tests.md`, `unit-tests.md`) re-read by their respective sessions.
