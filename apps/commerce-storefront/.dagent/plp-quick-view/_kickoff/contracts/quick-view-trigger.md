# Contract: Quick View Trigger

**Feature**: [../spec.md](../spec.md) | **Plan**: [../plan.md](../plan.md)
**Module**: `apps/commerce-storefront/overrides/app/components/quick-view-modal/trigger.jsx`
**Mounted by**: `apps/commerce-storefront/overrides/app/components/product-tile/index.jsx` (sibling overlay alongside the base `ProductTile`).

## Props

```ts
type QuickViewTriggerProps = {
  product: ProductSummary;   // see ../data-model.md §2
};
```

The trigger does NOT receive an `onClick` from the tile wrapper. It calls `useQuickView().openQuickView(product)` itself. This keeps the tile wrapper free of Quick-View-specific knowledge beyond rendering the sibling.

## Render rules

1. If `product?.id` is falsy → render `null`.
2. If `product.type?.set === true` OR `product.type?.bundle === true` → render `null`. (FR-014, SC-008.)
3. Otherwise render a single `<button type="button">` with:
   - `data-testid={`quick-view-trigger-${product.id}`}`
   - `aria-haspopup="dialog"`
   - `aria-controls` referencing the modal's id (a stable string constant — e.g., `"quick-view-modal"` — co-owned with the modal shell)
   - Visible label localized via `react-intl` (desktop variant) and `aria-label` for the icon variant (mobile)
   - `onClick` → calls `openQuickView(product)` AND calls `event.stopPropagation()` so the click does not bubble to the tile's PDP `<a>`.

## Hover/focus visibility

- Desktop: visible on tile hover OR keyboard focus over the tile image area. Implemented via Chakra responsive style props or local CSS — implementation detail, not part of the test contract beyond "rendered in DOM".
- Mobile / touch: persistently rendered as a compact icon button on the image. Detected via Chakra responsive breakpoints (`useBreakpointValue` is acceptable; the trigger MUST still render server-side, so the visible-state choice is purely visual).

The unit-test contract does NOT test hover-visibility CSS; it only tests that the trigger element exists in the DOM and that its disabled/non-rendered cases match.

## SSR / hydration contract

The trigger uses the `isMounted` pattern:

```jsx
const [mounted, setMounted] = React.useState(false);
React.useEffect(() => { setMounted(true); }, []);
const onClick = mounted ? handleClick : noop;
```

- The button element MUST be rendered on the server with stable text/attrs.
- The `onClick` is inert until mounted; this is what prevents pre-hydration interaction races.
- No data fetches occur on the SSR path.

## Click behavior contract

- Calls `event.stopPropagation()` before invoking `openQuickView` so the parent tile link is NOT activated.
- Does NOT call `event.preventDefault()` against any form — the trigger is `type="button"`, so it has no implicit submit semantics.
- Does NOT navigate.

## Test contract surface

Per `unit-tests.md` §UT-TRIG-*:

- UT-TRIG-001 — renders for simple product.
- UT-TRIG-002 — hidden for product set.
- UT-TRIG-003 — hidden for product bundle.
- UT-TRIG-004 — calls `openQuickView` with the product.
- UT-TRIG-005 — does not propagate to PDP link.
- UT-TRIG-006 — SSR-safe (no client-only side effects on initial render).

Per `e2e-tests.md` Flow E2E-001 / E2E-008:

- The selector `quick-view-trigger-{productId}` MUST be addressable by Playwright.
- The trigger MUST NOT navigate; the tile's image/title click MUST still navigate normally.
