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
