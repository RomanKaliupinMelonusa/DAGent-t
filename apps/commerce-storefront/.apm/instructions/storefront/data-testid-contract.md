# data-testid Contract

You **MUST** add explicit `data-testid` attributes to all new interactive UI elements, buttons, and critical DOM nodes.

The SDET agent relies **entirely** on these attributes to author E2E tests using `page.getByTestId()`. If you fail to include them, the QA automation will break.

## Rules

1. **Every clickable element** (buttons, links, toggle switches) MUST have a `data-testid`.
2. **Every form input** (text fields, selects, checkboxes) MUST have a `data-testid`.
3. **Key structural containers** (product tiles, cart items, modal dialogs, navigation menus) MUST have a `data-testid`.
4. **Use descriptive, kebab-case names** that reflect the element's purpose:
   ```jsx
   <button data-testid="add-to-cart-btn">Add to Cart</button>
   <input data-testid="search-input" />
   <div data-testid="product-tile">...</div>
   <dialog data-testid="quick-view-modal">...</dialog>
   ```
5. **Never use dynamic or index-based test IDs** unless unavoidable. Prefer stable identifiers:
   ```jsx
   // ✅ Good
   <div data-testid={`product-tile-${product.id}`}>
   // ❌ Bad
   <div data-testid={`item-${index}`}>
   ```
6. **List items** should include a stable identifier suffix (e.g., product ID, SKU).

7. **Collective testids in repeating lists — contract-gated.** Interactive elements inside a `.map(...)` (one per tile/row/hit) MUST use a per-instance testid suffix — `quick-view-btn-${productId}`, `add-to-cart-btn-${productId}`, `remove-item-btn-${lineItemId}`. A bare collective testid on every instance trips Playwright strict-mode and is forbidden **unless** the acceptance contract declares it with `cardinality: many`; in that case the bare form is permitted (the E2E author targets `.first()` / `.nth()`).

   Before implementing, read `{{appRoot}}/in-progress/{{featureSlug}}_ACCEPTANCE.yml`. For every `required_dom` entry you render, confirm `cardinality` matches the DOM shape. If the contract says `cardinality: one` but the element sits inside a list render, either suffix the testid per instance, or call `report_outcome({ status: "failed", message: "Acceptance contract mismatch: <testid> declared cardinality:one but appears in repeating list" })` so spec-compiler can repair the contract.

## PWA Kit Override Prop-Spread Footgun

When overriding a base PWA Kit component, **parent pages may pass `data-testid` via props** that gets spread via `{...rest}` onto the root element, **overwriting your hardcoded `data-testid`**.

For example, the PLP page passes `data-testid={`sf-product-tile-${product.id}`}` to each `<ProductTile>`. Inside the base component, `{...rest}` spreads this onto the `<Link>` after the hardcoded `data-testid="product-tile"`, destroying it.

**Rules for overrides:**

1. **Always add your required `data-testid` on a WRAPPER element** — not on the base component's root:
   ```jsx
   // ✅ Correct — testid on your wrapper, unaffected by parent props
   <Box data-testid="product-tile" position="relative">
     <OriginalProductTile {...props} />
     <QuickViewOverlay />
   </Box>

   // ❌ WRONG — parent's data-testid="sf-product-tile-123" overwrites yours
   <OriginalProductTile data-testid="product-tile" {...props} />
   ```

2. **Audit parent pages** before choosing testid strategy. Run:
   ```bash
   grep -rn 'data-testid' node_modules/@salesforce/retail-react-app/app/pages/ | grep '<YourComponent>'
   ```

3. **If the base component already has a `data-testid`**, verify whether parent pages overwrite it via prop spread. If they do, your override MUST add a stable testid on a wrapper.

4. **Document your testid contract** in a `report_outcome` (with docNote) so the SDET agent knows exactly which testids to target.
