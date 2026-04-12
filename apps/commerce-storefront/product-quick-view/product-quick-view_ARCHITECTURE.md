# Architecture Report: Product Quick View

> **Feature:** `product-quick-view`
> **App:** `apps/commerce-storefront`
> **Date:** 2026-04-12
> **Status:** Implementation complete — architecture review

---

## 1. C4 Context Diagram

The Product Quick View feature operates within the Salesforce PWA Kit ecosystem.
The storefront is a server-side rendered React application that communicates with
Salesforce Commerce APIs through a reverse proxy hosted in Managed Runtime.

```mermaid
C4Context
    title System Context — Product Quick View

    Person(shopper, "Shopper", "Browses products on the PLP")

    System_Boundary(storefront_boundary, "Commerce Storefront") {
        System(pwa_kit, "PWA Kit Storefront", "React SSR app running on Managed Runtime")
    }

    System_Ext(scapi, "Salesforce Commerce API (SCAPI)", "Shopper Products, Shopper Baskets, SLAS")
    System_Ext(managed_runtime, "Managed Runtime", "Node.js SSR hosting, reverse proxy, CDN")
    System_Ext(einstein, "Einstein API", "Product recommendations and activity tracking")

    Rel(shopper, pwa_kit, "Browses PLP, clicks Quick View", "HTTPS")
    Rel(pwa_kit, managed_runtime, "Hosted on", "SSR + CDN")
    Rel(pwa_kit, scapi, "Fetches product data, adds to basket", "HTTPS via /mobify/proxy/api")
    Rel(pwa_kit, einstein, "Tracks product views", "HTTPS")
```

### Deployment View

```mermaid
graph LR
    subgraph "Shopper Browser"
        A[React SPA<br/>Hydrated Client]
    end

    subgraph "Managed Runtime"
        B[Node.js SSR Server]
        C[Reverse Proxy<br/>/mobify/proxy/api]
        D[CDN Edge Cache]
    end

    subgraph "Salesforce Commerce Cloud"
        E[SCAPI<br/>Shopper Products API]
        F[SCAPI<br/>Shopper Baskets API]
        G[SLAS<br/>Auth Service]
    end

    A -->|"SSR initial load"| B
    A -->|"Client-side API calls"| C
    C -->|"Proxied requests"| E
    C -->|"Proxied requests"| F
    B -->|"Auth token exchange"| G
    D -->|"Cached bundles"| A
```

---

## 2. C4 Container Diagram — Quick View Feature

```mermaid
C4Container
    title Container Diagram — Quick View Feature

    Person(shopper, "Shopper")

    Container_Boundary(app, "PWA Kit Storefront") {
        Container(plp, "Product List Page", "React Page", "Renders product grid with tiles")
        Container(tile_override, "ProductTile Override", "React Component", "Wraps base tile, adds Quick View overlay bar")
        Container(qv_modal, "QuickViewModal", "React Component", "Chakra Modal with ProductView inside")
        Container(product_view, "ProductView", "Base Template Component", "Full product detail UI with cart mutations")
        Container(use_pvm, "useProductViewModal", "React Hook", "Fetches full product via useProduct SDK hook")
        Container(sdk_react, "commerce-sdk-react", "SDK Library", "React hooks for SCAPI: useProduct, useShopperBasketsMutation")
    }

    System_Ext(scapi, "SCAPI", "Commerce API")

    Rel(shopper, plp, "Browses products")
    Rel(plp, tile_override, "Renders per product")
    Rel(tile_override, qv_modal, "Opens on Quick View click")
    Rel(qv_modal, use_pvm, "Fetches full product data")
    Rel(qv_modal, product_view, "Renders product details")
    Rel(use_pvm, sdk_react, "Calls useProduct hook")
    Rel(product_view, sdk_react, "Calls useShopperBasketsMutation")
    Rel(sdk_react, scapi, "REST API via proxy")
```

---

## 3. Component Diagram — Quick View Data Flow

```mermaid
graph TB
    subgraph "Product List Page"
        PLP[PLP Grid]
    end

    subgraph "ProductTile Override"
        TILE[OriginalProductTile]
        BAR["Quick View Bar<br/>(Box as=button)"]
        DISC["useDisclosure()<br/>isOpen / onOpen / onClose"]
    end

    subgraph "QuickViewModal"
        MODAL["Modal - Chakra"]
        HOOK["useProductViewModal(product)"]
        SPINNER["Spinner - loading"]
        ERROR["Error State - unavailable"]
        PV["ProductView"]
    end

    subgraph "Salesforce SDK"
        USE_PRODUCT["useProduct()<br/>commerce-sdk-react"]
        USE_BASKET["useShopperBasketsMutation<br/>(addItemToBasket)"]
        DERIVED["useDerivedProduct()<br/>variant/inventory state"]
    end

    subgraph "Commerce API - SCAPI"
        PRODUCTS_API["GET /products/id<br/>expand=images,prices,<br/>availability,promotions"]
        BASKETS_API["POST /baskets/id/items"]
    end

    PLP -->|"renders N tiles"| TILE
    TILE --- BAR
    BAR -->|"onClick - onOpen()"| DISC
    DISC -->|"isOpen=true"| MODAL
    MODAL -->|"product prop"| HOOK
    HOOK -->|"fetches full product"| USE_PRODUCT
    USE_PRODUCT -->|"REST via proxy"| PRODUCTS_API
    HOOK -->|"isFetching=true"| SPINNER
    HOOK -->|"product=null, not isFetching"| ERROR
    HOOK -->|"product loaded"| PV
    PV --> DERIVED
    PV -->|"Add to Cart"| USE_BASKET
    USE_BASKET -->|"REST via proxy"| BASKETS_API
```

---

## 4. Component Inventory

### 4.1 New Components (Created)

| Component | Path | Type | Purpose |
|---|---|---|---|
| **ProductTile** (override) | `overrides/app/components/product-tile/index.jsx` | Override | Wraps base ProductTile with Quick View overlay bar. Uses useDisclosure for modal state. Renders QuickViewModal. |
| **QuickViewModal** | `overrides/app/components/quick-view-modal/index.jsx` | New | Chakra Modal that fetches full product data via useProductViewModal hook and renders ProductView inside. Handles loading, error, and success states. |

### 4.2 Reused Base Components (Not Modified)

| Component / Hook | Source | Role in Quick View |
|---|---|---|
| `OriginalProductTile` | `@salesforce/retail-react-app/app/components/product-tile` | Base tile rendering (image, name, price, swatches). Imported and spread-wrapped. |
| `ProductView` | `@salesforce/retail-react-app/app/components/product-view` | Full product detail UI inside modal: images, variant selectors, quantity, Add to Cart. |
| `useProductViewModal` | `@salesforce/retail-react-app/app/hooks/use-product-view-modal` | Hook that accepts a ProductSearchHit, calls useProduct with correct expand params, returns { product, isFetching }. |
| `useDerivedProduct` | Internal to ProductView | Manages variant selection state, inventory checks, price updates. |
| `useShopperBasketsMutation` | `@salesforce/commerce-sdk-react` | Cart mutation — Add to Cart button in ProductView calls this internally. |

### 4.3 Test Files (Created)

| File | Path | Coverage |
|---|---|---|
| ProductTile tests | `overrides/app/components/product-tile/index.test.js` | Overlay bar rendering, interaction (click, preventDefault, stopPropagation), accessibility, visual states, product type exclusions |
| QuickViewModal tests | `overrides/app/components/quick-view-modal/index.test.js` | Modal shell, loading/error/success states, ProductView prop forwarding, accessibility (aria-label, focus trap, Escape) |

---

## 5. Data Flow: SDK Hooks → Proxy → Commerce API

### 5.1 Sequence — Quick View Open to Add-to-Cart

```mermaid
sequenceDiagram
    participant S as Shopper
    participant Tile as ProductTile Override
    participant Modal as QuickViewModal
    participant Hook as useProductViewModal
    participant SDK as commerce-sdk-react
    participant Proxy as /mobify/proxy/api
    participant SCAPI as Salesforce Commerce API

    S->>Tile: Hover tile - overlay bar appears
    S->>Tile: Click Quick View bar
    Tile->>Tile: e.preventDefault() + e.stopPropagation()
    Tile->>Modal: onOpen() - isOpen=true

    Modal->>Hook: useProductViewModal(searchHitProduct)
    Hook->>SDK: useProduct(productId, expand=[images,prices,availability,promotions])
    SDK->>Proxy: GET /mobify/proxy/api/products/{id}?expand=...
    Proxy->>SCAPI: GET /shopper/products/v1/products/{id}
    SCAPI-->>Proxy: Full Product Response (JSON)
    Proxy-->>SDK: Product Data
    SDK-->>Hook: product + isFetching=false
    Hook-->>Modal: Render ProductView

    S->>Modal: Select variant (color/size)
    Modal->>Modal: useDerivedProduct updates state

    S->>Modal: Click Add to Cart
    Modal->>SDK: useShopperBasketsMutation(addItemToBasket)
    SDK->>Proxy: POST /mobify/proxy/api/baskets/{basketId}/items
    Proxy->>SCAPI: POST /shopper/baskets/v1/baskets/{id}/items
    SCAPI-->>Proxy: Updated Basket
    Proxy-->>SDK: Success
    SDK-->>Modal: Toast notification - Item added to cart
```

### 5.2 API Endpoints Used

| Endpoint | Method | Trigger | SDK Hook |
|---|---|---|---|
| `/shopper/products/v1/products/{productId}` | GET | Modal opens | `useProduct` (via `useProductViewModal`) |
| `/shopper/baskets/v1/baskets/{basketId}/items` | POST | Add to Cart clicked | `useShopperBasketsMutation('addItemToBasket')` |

### 5.3 Proxy Configuration

All API calls route through the Managed Runtime reverse proxy to avoid CORS:

```
Client → /mobify/proxy/api → xfdy2axw.api.commercecloud.salesforce.com
```

Configured in `config/default.js`:
```javascript
ssrParameters: {
    proxyConfigs: [
        { host: 'xfdy2axw.api.commercecloud.salesforce.com', path: 'api' }
    ]
}
```

### 5.4 Authentication Flow

- **SLAS (Shopper Login and API Access Service)** handles authentication
- `commerce-sdk-react` manages token lifecycle automatically
- Client ID: configured in `commerceAPI.parameters.clientId`
- Guest shoppers receive a guest access token transparently
- No custom auth code needed for Quick View — the SDK handles it

---

## 6. Override Architecture

### 6.1 PWA Kit Extensibility Pattern

```
@salesforce/retail-react-app (base template v9.1.1)
    └── app/components/product-tile/index.jsx      ← shadowed by override
    └── app/components/product-view/index.jsx       ← reused directly
    └── app/hooks/use-product-view-modal.js         ← reused directly

commerce-storefront (this project)
    └── overrides/app/components/product-tile/index.jsx   ← OVERRIDE (created)
    └── overrides/app/components/quick-view-modal/index.jsx ← NEW (created)
```

The `ccExtensibility` config in `package.json` drives module resolution:
```json
{
  "ccExtensibility": {
    "extends": "@salesforce/retail-react-app",
    "overridesDir": "overrides"
  }
}
```

When the build system resolves `app/components/product-tile`, it finds the override
at `overrides/app/components/product-tile/index.jsx` and uses that instead of the
base template's version. The override then imports the original via the full package path.

### 6.2 Override Isolation

The override wraps (not replaces) the base ProductTile:
- All original props are forwarded via spread: `<OriginalProductTile product={product} {...rest} />`
- The `Skeleton` export is re-exported from the base to maintain API compatibility
- No base template files are modified — zero risk to upstream upgrades

---

## 7. Technology Stack Summary

| Layer | Technology | Version |
|---|---|---|
| Framework | Salesforce PWA Kit | v3.x |
| Base Template | `@salesforce/retail-react-app` | 9.1.1 |
| UI Library | Chakra UI | v2.x (via PWA Kit) |
| API Client | `@salesforce/commerce-sdk-react` | Bundled with PWA Kit |
| State Management | React Query (TanStack) | v3.x (via SDK) |
| SSR Runtime | Managed Runtime | Node.js 24.x |
| Test Runner | Jest (via `pwa-kit-dev test`) | Bundled |
| E2E Tests | Playwright | Configured |
| Build Tool | Webpack (via `pwa-kit-dev build`) | Bundled |
