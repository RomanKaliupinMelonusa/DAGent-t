# Architecture Report: Product Quick View

**Feature:** `product-quick-view`
**App:** `apps/commerce-storefront`
**Date:** 2026-04-13
**Status:** Implementation Complete

---

## 1. C4 Context Diagram

The Product Quick View feature operates within the Salesforce PWA Kit ecosystem.
The storefront is a server-side rendered React application deployed to Managed Runtime,
with all commerce data flowing through SCAPI (Shopper Commerce API) via a proxy layer.

```mermaid
C4Context
    title System Context — Product Quick View

    Person(shopper, "Shopper", "Browses products on PLP, uses Quick View to preview and add to cart")

    System(storefront, "Commerce Storefront", "PWA Kit React app with Quick View overlay on Product Listing Page")

    System_Ext(scapi, "Salesforce Commerce API", "Shopper Products, Shopper Baskets, Shopper Search APIs")
    System_Ext(slas, "SLAS", "Shopper Login and API Access Service for OAuth2 tokens")
    System_Ext(managed_runtime, "Managed Runtime", "Hosting, CDN, SSR rendering, proxy routing")
    System_Ext(einstein, "Einstein API", "Product recommendations and activity tracking")

    Rel(shopper, storefront, "Browses PLP, clicks Quick View, adds to cart", "HTTPS")
    Rel(storefront, managed_runtime, "Deployed to, SSR executed on", "Node.js")
    Rel(storefront, scapi, "Product data, basket mutations", "HTTPS via /mobify/proxy/api")
    Rel(storefront, slas, "Auth tokens for guest and registered shoppers", "OAuth2 PKCE")
    Rel(storefront, einstein, "Activity tracking", "HTTPS")
```

## 2. C4 Container Diagram

```mermaid
C4Container
    title Container Diagram — Quick View Data Flow

    Person(shopper, "Shopper")

    Container_Boundary(pwa, "PWA Kit Storefront") {
        Container(plp, "Product Listing Page", "React Route", "Renders ProductTile grid from search results")
        Container(tile, "ProductTile Override", "React Component", "Wraps base tile with Quick View overlay bar")
        Container(modal, "QuickViewModal", "React Component", "Chakra Modal with ProductView and useProductViewModal hook")
        Container(pv, "ProductView", "Base Template Component", "Full product detail UI with images, variants, Add to Cart")
        Container(hooks, "Commerce SDK Hooks", "React Query", "useProduct, useShopperBasketsMutation, useCurrentBasket")
        Container(ssr, "SSR Server", "Express and Node.js", "Server-side renders initial HTML, hydrates on client")
    }

    System_Ext(proxy, "/mobify/proxy/api", "Reverse proxy to SCAPI")
    System_Ext(scapi, "SCAPI", "Shopper Products and Baskets API")

    Rel(shopper, plp, "Views product grid", "HTTPS")
    Rel(plp, tile, "Renders each search hit")
    Rel(tile, modal, "Opens on Quick View click")
    Rel(modal, pv, "Renders product details")
    Rel(modal, hooks, "useProductViewModal then useProduct")
    Rel(pv, hooks, "useShopperBasketsMutation for add to cart")
    Rel(hooks, proxy, "API calls via React Query")
    Rel(proxy, scapi, "Proxied HTTPS requests")
```

## 3. Component Inventory

### 3.1 New Components (Created)

| Component | Path | Purpose | Lines |
|---|---|---|---|
| **ProductTile (Override)** | `overrides/app/components/product-tile/index.jsx` | Wraps base ProductTile with Quick View overlay bar. Manages useDisclosure state. Lazy-loads QuickViewModal via React.lazy. | ~179 |
| **QuickViewModal** | `overrides/app/components/quick-view-modal/index.jsx` | Chakra Modal that fetches full product data via useProductViewModal hook, renders ProductView with loading/error/success states. Includes QuickViewErrorBoundary. | ~149 |
| **EyeIcon** | Inline in product-tile/index.jsx | Lightweight SVG eye icon replacing @chakra-ui/icons dependency. SSR-safe. | ~8 |
| **QuickViewErrorBoundary** | Inline in quick-view-modal/index.jsx | Class-based React error boundary. Catches ProductView render failures without crashing PLP. | ~28 |

### 3.2 Reused Base Template Components (Unmodified)

| Component / Hook | Source | Role in Feature |
|---|---|---|
| `OriginalProductTile` | `@salesforce/retail-react-app/app/components/product-tile` | Base tile rendering (image, name, price, swatches). Rendered inside the override wrapper. |
| `ProductView` | `@salesforce/retail-react-app/app/components/product-view` | Full product detail UI inside modal. Handles variant selection, cart mutations, toast notifications internally. |
| `useProductViewModal` | `@salesforce/retail-react-app/app/hooks/use-product-view-modal` | Fetches full ShopperProduct data with correct expand params (images, promotions, availability). |
| `useShopperBasketsMutation` | `@salesforce/commerce-sdk-react` | Add-to-cart mutation (invoked internally by ProductView). |
| `useProduct` | `@salesforce/commerce-sdk-react` | Core product data fetching hook (invoked by useProductViewModal). |

### 3.3 Test Files (Created)

| File | Path | Coverage |
|---|---|---|
| ProductTile Override Tests | `overrides/app/components/product-tile/index.test.js` | Overlay bar rendering, interaction, accessibility, visual states |
| QuickViewModal Tests | `overrides/app/components/quick-view-modal/index.test.js` | Modal shell (loading/error/success), ProductView integration, accessibility |

---

## 4. Data Flow

### 4.1 Quick View Lifecycle

```mermaid
sequenceDiagram
    participant S as Shopper
    participant PLP as Product Listing Page
    participant Tile as ProductTile Override
    participant Modal as QuickViewModal
    participant Hook as useProductViewModal
    participant RQ as React Query Cache
    participant Proxy as /mobify/proxy/api
    participant SCAPI as SCAPI Shopper Products

    S->>PLP: Browse category page
    PLP->>Tile: Render ProductTile with search hit data
    Note over Tile: Overlay bar visible on mobile or on hover for desktop

    S->>Tile: Click Quick View bar
    Tile->>Tile: e.preventDefault() + e.stopPropagation()
    Tile->>Tile: useDisclosure onOpen()
    Tile->>Modal: React.lazy mount when isOpen is true
    Modal->>Hook: useProductViewModal(productSearchHit)
    Hook->>RQ: useProduct with id and expand params

    alt Cache Hit
        RQ-->>Hook: Cached product data
    else Cache Miss
        RQ->>Proxy: GET /products/id with expand params
        Proxy->>SCAPI: Proxied request
        SCAPI-->>Proxy: Product JSON
        Proxy-->>RQ: Response
        RQ-->>Hook: Product data
    end

    Hook-->>Modal: product and isFetching false
    Modal->>Modal: Render ProductView
    Note over Modal: Images, variants, price, Add to Cart

    S->>Modal: Select variant and click Add to Cart
    Modal->>Proxy: POST baskets/id/items via useShopperBasketsMutation
    Proxy->>SCAPI: Add item to basket
    SCAPI-->>Proxy: Updated basket
    Proxy-->>Modal: Success
    Modal->>S: Toast notification - Item added to cart
```

### 4.2 SDK Hook Chain

```
ProductTile (override)
  |-- QuickViewModal (React.lazy)
       |-- useProductViewModal(productSearchHit)
       |    |-- useProduct(productId, { expand: [images, promotions, availability] })
       |         |-- React Query -> /mobify/proxy/api -> SCAPI Shopper Products
       |-- useIntl() -> i18n for aria-label and error messages
       |-- ProductView (base template)
            |-- useDerivedProduct() -> variant/inventory state derivation
            |-- useShopperBasketsMutation('addItemToBasket') -> cart mutation
            |-- useCurrentBasket() -> current basket context
            |-- useToast() -> success/error notifications
```

---

## 5. PWA Kit Override Architecture

```mermaid
graph TB
    subgraph "Override Layer"
        PT_O["ProductTile Override<br/>overrides/app/components/product-tile/"]
        QVM["QuickViewModal<br/>overrides/app/components/quick-view-modal/"]
        AC["_app-config Override<br/>overrides/app/components/_app-config/"]
        Routes["routes.jsx Override<br/>overrides/app/routes.jsx"]
    end

    subgraph "Base Template"
        PT_B["ProductTile base"]
        PVM_B["ProductViewModal base"]
        PV_B["ProductView base"]
        UPVM["useProductViewModal hook"]
        SDK["commerce-sdk-react hooks"]
    end

    subgraph "Runtime Resolution"
        RES["PWA Kit Build<br/>ccExtensibility.overridesDir"]
    end

    PT_O -->|"imports base via explicit path"| PT_B
    PT_O -->|"lazy-loads"| QVM
    QVM -->|"reuses hook"| UPVM
    QVM -->|"renders"| PV_B
    UPVM -->|"delegates to"| SDK
    PVM_B -.->|"existing pattern for cart/wishlist edit"| PV_B
    RES -->|"shadows base ProductTile"| PT_O
    RES -.->|"base ProductTile still available via explicit import"| PT_B
```

### Key Override Decisions

| Decision | Mechanism |
|---|---|
| Shadow ProductTile across entire app | File at `overrides/app/components/product-tile/index.jsx` auto-replaces base |
| Still access original ProductTile | Explicit import: `from '@salesforce/retail-react-app/app/components/product-tile'` |
| No route changes needed | Quick View is a modal overlay on existing PLP route — no new URLs |
| No config changes needed | Feature uses existing SCAPI credentials and proxy configuration |

---

## 6. SSR Safety Architecture

The feature is designed to be SSR-safe with zero hydration mismatches:

| Concern | Solution |
|---|---|
| **Modal hooks during SSR** | QuickViewModal loaded via React.lazy() + guarded by `{isOpen && ...}`. Never mounts during server render. |
| **useDisclosure initial state** | Initializes isOpen: false on both server and client. No mismatch. |
| **useProductViewModal during SSR** | Only called when QuickViewModal mounts (client-only). Zero server-side API calls per tile. |
| **useToast during SSR** | Only called inside ProductView which is inside the lazy-loaded modal. Never executes on server. |
| **Overlay bar rendering** | Pure CSS styling with responsive opacity/transform. Renders identically on server and client. |
| **EyeIcon SVG** | Inline SVG component — no external dependency, deterministic render. |

---

## 7. Accessibility Architecture

| Feature | Implementation |
|---|---|
| **Overlay bar semantics** | `Box as="button"` renders native button element. Focusable via Tab. Enter/Space triggers click. |
| **Keyboard reveal** | `_focus` pseudo makes bar visible when Tab-focused on desktop, bypassing hover requirement. |
| **Modal aria-label** | Dynamic: "Quick view for {productName}" with fallback to "product". |
| **Bar aria-label** | Dynamic: "Quick View {productName}". |
| **Focus trapping** | Chakra Modal traps focus. Tab cycling stays within modal. |
| **Escape to close** | Chakra Modal handles Escape key natively. |
| **Focus restoration** | On close, focus returns to trigger element (Chakra default behavior). |
| **Color contrast** | White text on rgba(0,0,0,0.6) exceeds WCAG AA 4.5:1 ratio. |

---

## 8. Deployment Topology

```mermaid
graph LR
    subgraph "Build Pipeline"
        SRC["Source Code overrides/"] --> BUILD["pwa-kit-dev build<br/>webpack + override resolution"]
        BUILD --> BUNDLE["SSR Bundle<br/>server + client chunks"]
    end

    subgraph "Managed Runtime"
        BUNDLE --> CDN["CDN Edge<br/>static assets"]
        BUNDLE --> SSR["SSR Lambda<br/>Node.js 24.x"]
    end

    subgraph "SFCC Backend"
        SSR --> PROXY["/mobify/proxy/api"]
        PROXY --> SCAPI["SCAPI<br/>xfdy2axw.api.commercecloud.salesforce.com"]
    end

    CDN --> BROWSER["Shopper Browser"]
    SSR --> BROWSER
```

**Bundle Impact:**
- QuickViewModal is code-split via React.lazy() — not included in the main PLP chunk
- Modal JS only downloaded when shopper clicks Quick View for the first time
- ProductTile override adds approximately 4KB (uncompressed) to the base tile chunk
- No new npm dependencies — reuses existing @salesforce/retail-react-app and @salesforce/commerce-sdk-react
