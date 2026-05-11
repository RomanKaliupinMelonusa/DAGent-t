# Quickstart: PLP Product Quick View Modal

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)
**Branch**: `001-plp-quick-view`

This quickstart is for **manual smoke verification** by the development agent session and as the orientation doc for the downstream E2E and unit-test agent sessions. It is not a test plan — see [contracts/e2e-tests.md](contracts/e2e-tests.md) and [unit-tests.md](unit-tests.md) for those.

## 1. Run the storefront locally

From the repo root:

```bash
cd apps/commerce-storefront
npm install        # only if dependencies are stale
npm run start
```

The PWA Kit dev server prints the resolved URL on startup, e.g.:

```
PWA Kit Express server is running on http://localhost:49968
```

The port is **environment-dependent** — it is NOT always `49968`. Capture whatever port the server reports and use that in subsequent steps.

> Tip for the E2E session: set `STOREFRONT_URL=http://localhost:<port>` before running Playwright so the spec doesn't depend on `playwright.config.ts`'s default.

## 2. Land on a known PLP

Open the canonical fixture URL in a browser:

```
http://localhost:<port>/category/womens-clothing-dresses
```

Wait until the tile grid is visible. The dev `_app` override flips `window.__APP_HYDRATED__ = true` after first hydration; the E2E session uses this via `awaitHydrated(page)` from `apps/commerce-storefront/e2e/fixtures.ts`.

## 3. Manually exercise Quick View

For each smoke step, jot down PASS/FAIL inline.

1. **Trigger visible on tile.** Hover any product tile — `data-testid="quick-view-trigger-{productId}"` button appears (desktop) or is persistently visible (mobile viewport). [PASS/FAIL]
2. **Trigger does not navigate.** Click the trigger. URL stays on the PLP. The Quick View modal (`data-testid="quick-view-modal"`) opens. [PASS/FAIL]
3. **Product detail renders inside.** The modal contains `data-testid="product-view"` with image gallery, name, price. [PASS/FAIL]
4. **No Pickup / Ship-to-Store UI.** Inspect the modal: NONE of these are present:
   - `data-testid="pickup-select-store-msg"`
   - `data-testid="store-stock-status-msg"`
   - any `data-testid` containing `pickup`
   - any visible text matching `/pickup|ship to store|pick up/i`. [PASS/FAIL]
5. **Variation switching.** Click a different color swatch (if present). The hero image and price update. The modal stays open. [PASS/FAIL]
6. **Disabled state on incomplete master.** Open Quick View on a master product without picking a variation: `data-testid="quick-view-add-to-cart-btn"` is `disabled`. Pick a complete in-stock variation: it becomes enabled. [PASS/FAIL]
7. **Add to bag.** Click `quick-view-add-to-cart-btn`. The Quick View modal closes; `data-testid="add-to-cart-modal"` opens with at least one `data-testid="product-added"` row. [PASS/FAIL]
8. **Close paths.** Re-open Quick View. Verify ALL of these dismiss the modal AND restore focus to the originating trigger:
   - close button click,
   - overlay click,
   - `Escape` keypress. [PASS/FAIL]
9. **View Full Details.** Open Quick View. Click `data-testid="quick-view-view-full-details-link"`. Page navigates to the corresponding PDP. [PASS/FAIL]
10. **Tile-click regression.** Click a tile's image (NOT the trigger). Page navigates to the PDP, exactly like before this feature. [PASS/FAIL]
11. **Set/Bundle exclusion.** If your data has a set or bundle product on any PLP, confirm NO `quick-view-trigger-*` button renders on its tile. (If no such product is available on the running storefront, defer to the unit test that owns this assertion.) [PASS/FAIL]

## 4. Hand-off to test sessions

After manual smoke is GREEN, the development session is done with its own work. The two test sessions consume the test contracts:

- **E2E session** — open [contracts/e2e-tests.md](contracts/e2e-tests.md). Implement `apps/commerce-storefront/e2e/product-quick-view.spec.ts` via Playwright MCP. Resolve URL from `STOREFRONT_URL` env var (or `playwright.config.ts`); do NOT hard-code the dev port.
- **Unit-test session** — open [unit-tests.md](unit-tests.md). Author Jest + RTL tests against the modules listed in [contracts/](contracts/). Stub all SDK hooks; do NOT touch the network. Stay strictly within the enumerated cases.

## 5. Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Trigger renders but click does nothing | `isMounted` flag not flipping — confirm the trigger's `useEffect` runs on the client. |
| Modal opens then PDP also navigates | `event.stopPropagation()` missing on the trigger's `onClick`. |
| Pickup-in-Store UI shows up inside the modal | `showDeliveryOptions={false}` not passed to `<ProductView>`. |
| Console warns about hydration mismatch on tiles | Trigger render output differs between SSR and client — check the `isMounted` pattern is not gating visible markup, only handlers. |
| Add-to-Bag succeeds but the global confirmation modal does not appear | `useAddToCartModalContext().onOpen(...)` not called after the mutation, or a second `<AddToCartModal>` was mistakenly mounted somewhere. |
| Unit tests fail because `quick-view-add-to-cart-btn` has no `disabled` attribute when expected | The wrapper element around the base Add-to-Bag button is not forwarding the base button's `disabled` prop. |
