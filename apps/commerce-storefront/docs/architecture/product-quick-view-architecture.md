# Product Quick View — Architecture Report

> **Feature:** product-quick-view  
> **Date:** 2026-04-29  
> **Author:** Executive Architect (doc-architect node)

---

## 1. C4 Context Diagram

The Product Quick View feature operates within the existing PWA Kit commerce storefront architecture. It introduces no new external system integrations — it reuses the established SCAPI proxy chain.

```mermaid
C4Context
    title System Context — Product Quick View

    Person(shopper, "Shopper", "Browses PLP, interacts with Quick View modal")

    System(storefront, "Commerce Storefront", "PWA Kit React SPA hosted on Managed Runtime")

    System_Ext(scapi, "Salesforce Commerce API (SCAPI)", "Shopper Products, Shopper Baskets, SLAS Auth")
    System_Ext(managedRuntime, "Managed Runtime", "CDN + SSR Node.js hosting for PWA Kit")
    System_Ext(einstein, "Einstein Recommendations", "Product intelligence (unchanged by this feature)")

    Rel(shopper, storefront, "HTTPS", "Browse PLP, open Quick View, add to cart")
    Rel(storefront, managedRuntime, "Deployed to", "Bundle deployment via pwa-kit-dev")
    Rel(storefront, scapi, "REST via /mobify/proxy/api", "useProduct, addItemToBasket, createBasket")
    Rel(storefront, einstein, "REST", "Tile-click tracking (unchanged)")
```

## 2. C4 Container Diagram

```mermaid
C4Container
    title Container View — Quick View within Storefront

    Person(shopper, "Shopper")

    Container_Boundary(storefront, "Commerce Storefront (PWA Kit)") {
        Component(plp, "PLP Page", "React Route", "Product listing with tiles")
        Component(productTile, "ProductTile Override", "React Component", "Wraps base tile + Quick View trigger")
        Component(quickViewModal, "QuickViewModal", "React Component", "Modal shell + ProductView body")
        Component(productView, "Base ProductView", "React Component (reused)", "Swatches, gallery, quantity, add-to-cart")
        Component(addToCartModal, "AddToCartModal", "React Component (existing)", "Confirmation after successful add")
        Component(sdkHooks, "Commerce SDK Hooks", "React Hooks", "useProduct, useShopperBasketsMutation")
    }

    System_Ext(scapi, "SCAPI", "Commerce APIs")
    System_Ext(mr, "Managed Runtime", "Proxy + SSR")

    Rel(shopper, plp, "Browses")
    Rel(plp, productTile, "Renders N tiles")
    Rel(productTile, quickViewModal, "Opens on trigger click")
    Rel(quickViewModal, productView, "Renders with showDeliveryOptions=false")
    Rel(quickViewModal, sdkHooks, "useProductViewModal, useDerivedProduct")
    Rel(quickViewModal, addToCartModal, "onOpen() after successful add")
    Rel(sdkHooks, mr, "Fetch via proxy")
    Rel(mr, scapi, "Proxy pass-through")
```

## 3. C4 Component Diagram — Quick View Feature

```mermaid
C4Component
    title Component Diagram — Product Quick View

    Container_Boundary(quickView, "Quick View Feature") {
        Component(trigger, "Quick View Trigger", "IconButton", "Overlay on tile image; isMounted guard for SSR safety")
        Component(modalShell, "QuickViewModal Shell", "Chakra Modal", "Focus trap, responsive sizing, ErrorBoundary")
        Component(modalBody, "QuickViewContent", "React Component", "Orchestrates product fetch + add-to-cart")
        Component(errorFallback, "QuickViewErrorFallback", "Error UI", "data-testid: quick-view-modal-error")
    }

    Container_Boundary(reused, "Reused Base Components") {
        Component(baseProductView, "ProductView", "Base retail-react-app", "Swatches, gallery, quantity, inventory")
        Component(baseProductTile, "ProductTile", "Base retail-react-app", "Image, title, price, swatch row")
        Component(addToCartCtx, "AddToCartModalContext", "React Context", "Global confirmation modal API")
        Component(useProductViewModalHook, "useProductViewModal", "Hook", "Merges tile data with useProduct detail")
        Component(useDerivedProductHook, "useDerivedProduct", "Hook", "Variant selection, inventory state")
        Component(basketMutation, "useShopperBasketsMutation", "SDK Hook", "createBasket, addItemToBasket")
    }

    Rel(trigger, modalShell, "Opens")
    Rel(modalShell, modalBody, "Renders when isOpen")
    Rel(modalShell, errorFallback, "Fallback on error")
    Rel(modalBody, baseProductView, "Renders with props")
    Rel(modalBody, useProductViewModalHook, "Fetches product detail")
    Rel(modalBody, useDerivedProductHook, "Derives variant/stock state")
    Rel(modalBody, basketMutation, "Add to cart")
    Rel(modalBody, addToCartCtx, "onOpen() on success")
```

## 4. Component Inventory

### New Components (Override Surface)

| Component | Path | Purpose |
|---|---|---|
| `QuickViewModal` | `overrides/app/components/quick-view-modal/index.jsx` | Modal shell + body orchestrating product view in a dialog |
| `QuickViewContent` | (same file, internal) | Fetches product data, manages variation state, handles add-to-cart |
| `QuickViewErrorFallback` | (same file, internal) | ErrorBoundary fallback with `-error` testid |
| `ProductTile` (override) | `overrides/app/components/product-tile/index.jsx` | Wraps base tile with Quick View trigger overlay |

### Modified Components

| Component | Path | Change |
|---|---|---|
| `routes.jsx` | `overrides/app/routes.jsx` | Removed unused `my-new-route` placeholder |

### Deleted Components

| Component | Path | Reason |
|---|---|---|
| `MyNewRoute` | `overrides/app/pages/my-new-route/index.jsx` | Scaffold cleanup (unused) |

### Reused Base Components (Unmodified)

| Component | Package | Role in Feature |
|---|---|---|
| `ProductView` | `@salesforce/retail-react-app` | Full product detail UI (swatches, gallery, quantity, price) |
| `ProductTile` (base) | `@salesforce/retail-react-app` | Base tile rendering (image, title, price) |
| `AddToCartModal` | `@salesforce/retail-react-app` | Confirmation modal after successful basket mutation |
| `useProductViewModal` | `@salesforce/retail-react-app` | Product data fetching + tile-to-detail merge |
| `useDerivedProduct` | `@salesforce/retail-react-app` | Variant selection, inventory, orderable logic |
| `useAddToCartModalContext` | `@salesforce/retail-react-app` | Context API for global add-to-cart confirmation |
| `useShopperBasketsMutationHelper` | `@salesforce/commerce-sdk-react` | Basket mutations (create + addItem) |

## 5. Data Flow Diagram

```mermaid
sequenceDiagram
    participant S as Shopper
    participant T as ProductTile (trigger)
    participant QV as QuickViewModal
    participant PV as ProductView (base)
    participant SDK as Commerce SDK Hooks
    participant Proxy as /mobify/proxy/api
    participant SCAPI as Salesforce Commerce API

    S->>T: Click Quick View trigger
    T->>QV: onOpen() → isOpen=true (client-only mount)
    QV->>SDK: useProductViewModal(initialProduct, variationValues)
    SDK->>Proxy: GET /products/{productId}
    Proxy->>SCAPI: GET /shopper/products/v1/...
    SCAPI-->>Proxy: Product detail JSON
    Proxy-->>SDK: Product response
    SDK-->>QV: { product, isFetching }
    QV->>PV: Render ProductView (showDeliveryOptions=false)

    S->>PV: Select variant swatches
    PV->>QV: handleVariationChange(attr, value)
    QV->>SDK: Re-fetch with new variationValues

    S->>QV: Click "Add to Bag"
    QV->>SDK: addItemToNewOrExistingBasket(productItems)
    SDK->>Proxy: POST /baskets or POST /baskets/{id}/items
    Proxy->>SCAPI: Basket mutation
    SCAPI-->>Proxy: Success response
    Proxy-->>SDK: Basket updated
    SDK-->>QV: Mutation success
    QV->>QV: closeQuickView()
    QV->>S: AddToCartModalContext.onOpen({product, itemsAdded})
```

## 6. SSR / Hydration Strategy

```mermaid
stateDiagram-v2
    [*] --> SSR_Render
    SSR_Render --> HTML_Shipped: Server renders PLP tiles (no trigger, no modal)
    HTML_Shipped --> Hydration: Browser receives HTML
    Hydration --> Client_Mounted: React hydrates, isMounted=true
    Client_Mounted --> Trigger_Visible: IconButton renders (opacity transition)
    Trigger_Visible --> Modal_Open: User clicks trigger
    Modal_Open --> Product_Fetch: useProductViewModal fires
    Product_Fetch --> Content_Rendered: ProductView appears in modal
```

**Key SSR decisions:**
- Trigger uses `isMounted` pattern — absent from server HTML, appears post-hydration
- Modal contents gated on `{isOpen && <QuickViewModal>}` — `useProduct` never fires during SSR
- Lazy-loaded via `React.lazy()` — modal chunk only fetched on first trigger click
- Zero hydration mismatch: server HTML has no trigger/modal markup

## 7. API Dependency Map

| API Endpoint | SDK Hook | Trigger | Auth |
|---|---|---|---|
| `GET /shopper/products/v1/organizations/{orgId}/products/{productId}` | `useProduct` (via `useProductViewModal`) | Modal opens | SLAS guest/registered |
| `POST /shopper/baskets/v2/organizations/{orgId}/baskets` | `useShopperBasketsMutation('createBasket')` | Add to cart (no basket exists) | SLAS guest/registered |
| `POST /shopper/baskets/v2/organizations/{orgId}/baskets/{basketId}/items` | `useShopperBasketsMutation('addItemToBasket')` | Add to cart (basket exists) | SLAS guest/registered |

All API calls route through the `/mobify/proxy/api` reverse proxy configured in `config/default.js`. No direct external calls are made from the browser.

---

*Generated by doc-architect node · 2026-04-29*
