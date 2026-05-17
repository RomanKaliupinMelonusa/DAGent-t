# Contract: Quick View Context & Provider

**Feature**: [../spec.md](../spec.md) | **Plan**: [../plan.md](../plan.md)
**Module**: `apps/commerce-storefront/overrides/app/components/quick-view-modal/context.jsx`

This contract is the binding surface for the unit-test session ([../unit-tests.md](../unit-tests.md), §UT-PROV-*) and the integration point for the trigger and modal shell.

## Public exports

```jsx
// context.jsx
export const QuickViewContext: React.Context<QuickViewContextValue>;
export const QuickViewProvider: React.FC<{ children: React.ReactNode }>;
export const useQuickView: () => QuickViewContextValue;
```

## `QuickViewContextValue`

See [../data-model.md](../data-model.md) §1. Recap:

```ts
type QuickViewContextValue = {
  isOpen: boolean;                                        // initial: false
  openProduct: ProductSummary | null;                     // initial: null
  openQuickView: (product: ProductSummary) => void;
  closeQuickView: () => void;
};
```

## `QuickViewProvider`

- Renders `<QuickViewContext.Provider value={...}>{children}<QuickViewModalShell /></QuickViewContext.Provider>`.
- `QuickViewModalShell` is mounted **inside** the provider so the modal singleton is co-located with its state. The shell's children (`QuickViewModalBody`) are themselves gated on `isOpen` so they never mount during SSR.
- The provider's internal state uses `useState` only — no reducers, no external state library.
- `useEffect` is NOT used by the provider itself; lifecycle is entirely synchronous around the open/close calls.

## `useQuickView`

- Reads `QuickViewContext` via `React.useContext`.
- Throws an explicit, identifiable error if used outside `<QuickViewProvider>` (so misuse fails loudly in unit tests rather than silently no-oping).

## Mount location

`QuickViewProvider` is mounted inside the existing `_app` override at:

```
apps/commerce-storefront/overrides/app/components/_app/index.jsx
```

It wraps `<BaseApp>` (or sits beside it inside the existing provider chain). It MUST sit inside any other provider that the modal body's reused hooks (`useShopperBasketsMutation`, `useCurrentBasket`, `useAddToCartModalContext`) require — i.e., inside the SDK / commerce providers already mounted by the base app.

## SSR contract

- Initial server render: `isOpen === false`, `openProduct === null`. The provider renders its children plus the modal shell, but the shell renders nothing visible because `isOpen` is `false`.
- Client hydration: identical state, identical DOM. No re-render flicker.

## Test contract surface

The unit-test session asserts (per `unit-tests.md`):

- UT-PROV-001 — initial state.
- UT-PROV-002 — `openQuickView(product)` flips `isOpen` and sets `openProduct`.
- UT-PROV-003 — `closeQuickView()` resets state.

The development session must keep this exact API; no renaming, no extra fields without a contract update.
