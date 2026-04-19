# Architecture Report: Product Quick View

**Feature:** `product-quick-view`
**App:** `apps/commerce-storefront` (Salesforce PWA Kit / Retail React App)
**Date:** 2026-04-19
**Author:** Executive Architect Agent

---

## 1. C4 Context Diagram

The Product Quick View feature operates within the Salesforce Commerce Cloud (SCAPI)
ecosystem. The storefront runs as a server-side rendered React application on
Managed Runtime (MRT), communicating with Commerce APIs through a reverse proxy.

```mermaid
C4Context
    title System Context — Product Quick View

    Person(shopper, "Shopper", "Browses PLP, uses Quick View to preview products")

    System(storefront, "PWA Kit Storefront", "React SSR app on Managed Runtime. Overrides retail-react-app base template.")

    System_Ext(scapi, "Salesforce Commerce API", "Shopper Products, Shopper Baskets, SLAS")
    System_Ext(mrt, "Managed Runtime", "CDN + SSR hosting. Proxies API calls.")
    System_Ext(einstein, "Einstein Recommendations", "Product recs and activity tracking")

    Rel(shopper, storefront, "Browses PLP, clicks Quick View", "HTTPS")
    Rel(storefront, mrt, "Deployed to", "pwa-kit-dev push")
    Rel(mrt, scapi, "Proxied API calls", "HTTPS /mobify/proxy/api")
    Rel(storefront, einstein, "Activity tracking", "HTTPS")
```

## 2. C4 Container Diagram

```mermaid
C4Container
    title Container Diagram — Quick View Data Flow

    Person(shopper, "Shopper")

    Container_Boundary(mrt_boundary, "Managed Runtime") {
        Container(cdn, "CDN Edge", "Cloudflare", "Caches static assets and HTML responses")
        Container(ssr, "SSR Lambda", "Node.js", "Server-side renders React pages")
    }

    Container_Boundary(storefront_boundary, "PWA Kit Storefront") {
        Container(plp, "Product List Page", "React + Loadable", "Renders product grid with ProductTile overrides")
        Container(tile, "ProductTile Override", "React Component", "Wraps base tile, adds Quick View bar")
        Container(modal, "QuickViewModal", "React + Chakra UI", "Modal overlay with ProductView inside")
        Container(hooks, "commerce-sdk-react Hooks", "React Query", "useProduct, useBasket, useProductViewModal")
    }

    System_Ext(scapi, "SCAPI", "Commerce APIs")

    Rel(shopper, cdn, "GET /category/*", "HTTPS")
    Rel(cdn, ssr, "Cache miss", "HTTPS")
    Rel(ssr, plp, "Renders", "SSR")
    Rel(plp, tile, "Renders grid of", "React")
    Rel(tile, modal, "Opens on click", "useDisclosure")
    Rel(modal, hooks, "Fetches product", "useProductViewModal")
    Rel(hooks, scapi, "GET /products/{id}", "/mobify/proxy/api")
    Rel(hooks, scapi, "POST /baskets/{id}/items", "/mobify/proxy/api")
```

## 3. Component Diagram — Quick View Feature

```mermaid
flowchart TB
    subgraph PLP["Product List Page"]
        direction TB
        PLPPage["PLP Page Component<br/>(base template)"]
        ProductGrid["Product Grid"]
    end

    subgraph TileOverride["ProductTile Override<br/>overrides/app/components/product-tile/"]
        direction TB
        GroupBox["Box role=group<br/>(hover container)"]
        BaseTile["OriginalProductTile<br/>(@salesforce/retail-react-app)"]
        ImageOverlay["Image Area Overlay<br/>(position: absolute, overflow: hidden)"]
        QuickViewBar["Quick View Bar<br/>(Box as=button)<br/>data-testid: quick-view-btn"]
    end

    subgraph ModalComponent["QuickViewModal<br/>overrides/app/components/quick-view-modal/"]
        direction TB
        ChakraModal["Chakra Modal<br/>(size: 4xl)"]
        ErrorBoundary["QuickViewErrorBoundary<br/>(class component)"]
        LoadingState["Spinner<br/>(data-testid: quick-view-spinner)"]
        ErrorState["Error Message<br/>(data-testid: quick-view-error)"]
        PV["ProductView<br/>(@salesforce/retail-react-app)<br/>showFullLink=true, imageSize=sm"]
    end

    subgraph Hooks["SDK Hooks Layer"]
        direction TB
        useProductViewModal["useProductViewModal<br/>(fetches full product)"]
        useProduct["useProduct<br/>(commerce-sdk-react)"]
        useBasketMutation["useShopperBasketsMutation<br/>(addItemToBasket)"]
    end

    subgraph SCAPI["Salesforce Commerce API"]
        direction TB
        ProductsAPI["/products/{productId}<br/>expand: images,prices,variations,availability"]
        BasketsAPI["/baskets/{basketId}/items"]
    end

    PLPPage --> ProductGrid
    ProductGrid --> GroupBox
    GroupBox --> BaseTile
    GroupBox --> ImageOverlay
    ImageOverlay --> QuickViewBar

    QuickViewBar -->|"onClick → onOpen()"| ChakraModal
    ChakraModal --> ErrorBoundary
    ErrorBoundary -->|"isFetching=true"| LoadingState
    ErrorBoundary -->|"product=null"| ErrorState
    ErrorBoundary -->|"product loaded"| PV

    ChakraModal --> useProductViewModal
    useProductViewModal --> useProduct
    PV --> useBasketMutation

    useProduct -->|"GET"| ProductsAPI
    useBasketMutation -->|"POST"| BasketsAPI

    style QuickViewBar fill:#2563eb,color:#fff
    style ChakraModal fill:#7c3aed,color:#fff
    style PV fill:#059669,color:#fff
```

## 4. Data Flow Sequence

```mermaid
sequenceDiagram
    participant S as Shopper
    participant Tile as ProductTile Override
    participant Modal as QuickViewModal
    participant Hook as useProductViewModal
    participant RQ as React Query Cache
    participant Proxy as MRT Proxy
    participant API as SCAPI

    S->>Tile: Hover product tile (desktop)
    Note over Tile: Bar slides up (CSS transition)
    S->>Tile: Click Quick View bar
    Tile->>Tile: e.preventDefault() + e.stopPropagation()
    Tile->>Modal: onOpen() via useDisclosure

    Modal->>Hook: useProductViewModal(searchHitProduct)
    Hook->>RQ: Check cache for product ID

    alt Cache Miss
        RQ->>Proxy: GET /mobify/proxy/api/products/{id}?expand=...
        Proxy->>API: GET /products/{id}
        API-->>Proxy: Product JSON (full detail)
        Proxy-->>RQ: Response
        RQ-->>Hook: { product, isFetching: false }
    else Cache Hit
        RQ-->>Hook: { product, isFetching: false }
    end

    Hook-->>Modal: product data
    Modal->>Modal: Render ProductView

    S->>Modal: Select variant (size/color)
    Note over Modal: ProductView updates via useDerivedProduct

    S->>Modal: Click Add to Cart
    Modal->>Proxy: POST /baskets/{id}/items
    Proxy->>API: POST /baskets/{id}/items
    API-->>Proxy: Updated basket
    Proxy-->>Modal: Success
    Modal->>S: Toast notification

    S->>Modal: Click X / Escape / Overlay
    Modal->>Tile: onClose() — focus returns to trigger
```

## 5. Component Inventory

### New Components (Created)

| Component | Path | Type | Purpose |
|---|---|---|---|
| **ProductTile Override** | `overrides/app/components/product-tile/index.jsx` | Override | Wraps base ProductTile with Quick View overlay bar; manages modal state via useDisclosure |
| **QuickViewModal** | `overrides/app/components/quick-view-modal/index.jsx` | New | Chakra Modal shell that fetches full product data via useProductViewModal and renders ProductView |
| **QuickViewErrorBoundary** | (inside quick-view-modal/index.jsx) | New (class) | Local React error boundary isolating ProductView render failures from the PLP |
| **ProductTile Tests** | `overrides/app/components/product-tile/index.test.js` | Test | Unit tests for overlay bar rendering, interaction, a11y |
| **QuickViewModal Tests** | `overrides/app/components/quick-view-modal/index.test.js` | Test | Unit tests for modal shell, content rendering, error state |

### Reused Components (Unmodified Base Template)

| Component | Source | Role in Quick View |
|---|---|---|
| `ProductView` | `@salesforce/retail-react-app/app/components/product-view` | Full product UI: image gallery, variant selectors, quantity picker, Add to Cart |
| `ProductTile` (base) | `@salesforce/retail-react-app/app/components/product-tile` | Original tile rendered inside override wrapper via prop spread |
| `Shared UI` | `@salesforce/retail-react-app/app/components/shared/ui` | Chakra UI re-exports: Modal, Box, Spinner, Center, etc. |

### Reused Hooks (Unmodified)

| Hook | Source | Role |
|---|---|---|
| `useProductViewModal` | `@salesforce/retail-react-app/app/hooks/use-product-view-modal` | Fetches full ShopperProduct data from a ProductSearchHit |
| `useShopperBasketsMutation` | `@salesforce/commerce-sdk-react` | Add-to-cart mutation, used internally by ProductView |
| `useProduct` | `@salesforce/commerce-sdk-react` | Low-level product fetch, used by useProductViewModal |
| `useDerivedProduct` | `@salesforce/retail-react-app/app/hooks` | Variant selection state, used internally by ProductView |

## 6. Technology Stack

| Layer | Technology | Version |
|---|---|---|
| **UI Framework** | React | ^18.2.0 |
| **Component Library** | Chakra UI | (via retail-react-app) |
| **Base Template** | @salesforce/retail-react-app | 9.1.1 |
| **Commerce SDK** | @salesforce/commerce-sdk-react | (peer dep) |
| **Data Fetching** | React Query (TanStack) | (via commerce-sdk-react) |
| **Routing** | React Router | (via retail-react-app) |
| **SSR Runtime** | PWA Kit / Managed Runtime | Node.js 18/20/22 |
| **i18n** | react-intl | (via retail-react-app) |
| **Testing** | Jest + React Testing Library | (via pwa-kit-dev) |
| **Icons** | @chakra-ui/icons | ViewIcon, WarningIcon |
| **Extensibility** | PWA Kit Override System | ccExtensibility.overridesDir |

## 7. API Surface

All API calls are proxied through Managed Runtime at `/mobify/proxy/api` to avoid CORS issues.

| API Endpoint | Method | Triggered By | Parameters |
|---|---|---|---|
| `/products/{productId}` | GET | useProductViewModal → useProduct | expand=images,prices,variations,availability |
| `/baskets/{basketId}/items` | POST | ProductView → useShopperBasketsMutation | productId, quantity, variantValues |

**Authentication:** SLAS (Shopper Login and API Access Service) via @salesforce/commerce-sdk-react. Client ID configured in `config/default.js`. No additional auth wiring needed — the SDK handles token lifecycle automatically.

**Configuration:**
```
commerceAPI.parameters.clientId: 44cfcf31-d64d-4227-9cce-1d9b0716c321
commerceAPI.parameters.organizationId: f_ecom_aaia_prd
commerceAPI.parameters.shortCode: xfdy2axw
commerceAPI.parameters.siteId: RefArch
commerceAPI.proxyPath: /mobify/proxy/api
```

## 8. Override Architecture

```
overrides/app/components/product-tile/index.jsx    ← SHADOWS base template
    ↓ imports (explicit full path)
@salesforce/retail-react-app/app/components/product-tile/index.jsx  (base)
    ↓ rendered inside override wrapper with spread props

overrides/app/components/quick-view-modal/index.jsx  ← NEW component
    ↓ imports
@salesforce/retail-react-app/app/components/product-view  (base)
@salesforce/retail-react-app/app/hooks/use-product-view-modal  (base)
```

The PWA Kit override system resolves `app/components/product-tile` to the overrides
directory first. The override explicitly imports the **base** component via the
full `@salesforce/retail-react-app/...` path, wraps it, and adds new DOM elements.

## 9. Deployment Topology

```mermaid
flowchart LR
    subgraph Dev["Development"]
        LocalDev["npm run start<br/>(localhost:3000)"]
    end

    subgraph CI["CI/CD Pipeline"]
        Build["npm run build<br/>(webpack bundle)"]
        Test["npm test<br/>(Jest)"]
        Push["pwa-kit-dev push<br/>(upload to MRT)"]
    end

    subgraph MRT["Managed Runtime"]
        CDN["CDN Edge<br/>(global PoPs)"]
        SSRNode["SSR Node.js<br/>(origin)"]
        ProxyAPI["/mobify/proxy/api<br/>(SCAPI proxy)"]
    end

    subgraph SFCC["Salesforce Commerce Cloud"]
        SCAPI["Commerce API<br/>(OCAPI/SCAPI)"]
        SLAS["SLAS Auth"]
    end

    LocalDev --> Build
    Build --> Test
    Test --> Push
    Push --> CDN
    CDN --> SSRNode
    SSRNode --> ProxyAPI
    ProxyAPI --> SCAPI
    ProxyAPI --> SLAS
```

---

*This document was auto-generated by the Executive Architect agent for the product-quick-view feature.*
