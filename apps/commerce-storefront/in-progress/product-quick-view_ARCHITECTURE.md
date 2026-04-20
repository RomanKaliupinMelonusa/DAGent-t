# Architecture Report: Product Quick View

**Feature:** `product-quick-view`
**Date:** 2026-04-20
**App:** `apps/commerce-storefront` (Salesforce PWA Kit / Managed Runtime)

---

## 1. C4 Context Diagram

The Product Quick View feature operates within the existing Salesforce Commerce
storefront ecosystem. The storefront is a React SSR app deployed on Managed
Runtime, communicating with Salesforce Commerce API (SCAPI) through a CDN proxy.

```mermaid
C4Context
    title System Context — Product Quick View

    Person(shopper, "Shopper", "Browses products on the PLP and uses Quick View to preview details without navigating away")

    System(storefront, "Commerce Storefront", "PWA Kit React SSR app deployed on Managed Runtime. Renders PLP with product tiles and Quick View modal overlay.")

    System_Ext(scapi, "Salesforce Commerce API (SCAPI)", "Shopper Products, Shopper Baskets, SLAS authentication endpoints")
    System_Ext(cdn, "Managed Runtime CDN", "Edge caching, SSR rendering, /mobify/proxy/* reverse proxy to SCAPI")
    System_Ext(einstein, "Einstein Recommendations", "Product recommendations and activity tracking")
    System_Ext(imgService, "SFCC Dynamic Imaging", "On-demand image resizing and CDN delivery for product images")

    Rel(shopper, storefront, "Browses PLP, clicks Quick View", "HTTPS")
    Rel(storefront, cdn, "SSR + static assets", "HTTPS")
    Rel(cdn, scapi, "Proxied API calls via /mobify/proxy/api", "HTTPS")
    Rel(storefront, einstein, "Activity tracking", "HTTPS")
    Rel(storefront, imgService, "Product images via DIS", "HTTPS")
```

## 2. C4 Container Diagram

```mermaid
C4Container
    title Container Diagram — Quick View Data Flow

    Person(shopper, "Shopper")

    Container_Boundary(browser, "Browser") {
        Container(plp, "PLP Page", "React", "Product listing with search results grid")
        Container(tile, "ProductTile Override", "React + Chakra UI", "Wraps base tile with Quick View overlay bar")
        Container(modal, "QuickViewModal", "React + Chakra UI", "Modal overlay rendering full ProductView")
        Container(productView, "ProductView", "React (base template)", "Image gallery, variant selectors, Add to Cart")
        Container(sdkHooks, "Commerce SDK Hooks", "React Query + commerce-sdk-react", "useProductViewModal, useProduct, useShopperBasketsMutation")
    }

    Container_Boundary(server, "Managed Runtime") {
        Container(ssr, "SSR Renderer", "Node.js + Express", "Server-side renders initial PLP HTML")
        Container(proxy, "API Proxy", "/mobify/proxy/api", "Reverse proxy forwarding SCAPI requests")
    }

    System_Ext(scapi, "SCAPI", "Shopper Products & Baskets APIs")

    Rel(shopper, plp, "Views product grid")
    Rel(plp, tile, "Renders per product")
    Rel(shopper, tile, "Hovers / taps Quick View bar")
    Rel(tile, modal, "Opens on click (client-side only)")
    Rel(modal, sdkHooks, "useProductViewModal(searchHit)")
    Rel(sdkHooks, proxy, "GET /products/{id}?expand=...", "HTTPS")
    Rel(proxy, scapi, "Proxied request", "HTTPS")
    Rel(productView, sdkHooks, "useShopperBasketsMutation (Add to Cart)")
    Rel(modal, productView, "Renders with fetched product data")
```

## 3. Component Inventory

### 3.1 New Components (Created by Feature)

| Component | Path | Purpose | Dependencies |
|---|---|---|---|
| **ProductTile** (override) | `overrides/app/components/product-tile/index.jsx` | Wraps base `ProductTile` in a group-hover container. Adds Quick View overlay bar with slide-up animation. Controls modal open/close via `useDisclosure`. | `OriginalProductTile` (base), `QuickViewModal`, `ViewIcon`, Chakra `useDisclosure` |
| **QuickViewModal** | `overrides/app/components/quick-view-modal/index.jsx` | Chakra `Modal` shell that fetches full product data via `useProductViewModal` hook and renders `ProductView`. Handles loading, error, and unavailable states. Includes `QuickViewErrorBoundary`. | `ProductView` (base), `useProductViewModal` (base hook), `useIntl`, Chakra Modal components |
| **QuickViewErrorBoundary** | (inline in `quick-view-modal/index.jsx`) | Class-based React error boundary. Catches `ProductView` render failures and shows a graceful error message instead of crashing the page. | None (React core) |

### 3.2 Reused Base Template Components (NOT Modified)

| Component / Hook | Source | Role in Quick View |
|---|---|---|
| `ProductView` | `@salesforce/retail-react-app/app/components/product-view` | Full product detail UI: image gallery, variant selectors (color/size), quantity picker, Add to Cart button. Rendered inside the modal. Handles cart mutations internally. |
| `useProductViewModal` | `@salesforce/retail-react-app/app/hooks/use-product-view-modal` | Hook that accepts a `ProductSearchHit`, calls `useProduct` with correct `expand` params (`images`, `promotions`, `availability`), returns `{ product, isFetching }`. |
| `ProductViewModal` | `@salesforce/retail-react-app/app/components/product-view-modal` | Existing modal used in Cart/Wishlist for editing items. Our `QuickViewModal` follows the same pattern but is tailored for PLP context. |
| `OriginalProductTile` | `@salesforce/retail-react-app/app/components/product-tile` | Base product tile with image, name, price, swatches. Imported directly and wrapped by our override. |
| `Skeleton` | `@salesforce/retail-react-app/app/components/product-tile` | Re-exported from our override for consumers expecting it from the tile module. |

### 3.3 Test Files

| File | Coverage |
|---|---|
| `overrides/app/components/product-tile/index.test.js` | Overlay bar rendering, interaction (click/preventDefault/stopPropagation), product type filtering, prop forwarding |
| `overrides/app/components/quick-view-modal/index.test.js` | Modal loading/error/success states, aria-label, ProductView prop passing, close behavior |
| `e2e/product-quick-view.spec.ts` | Playwright E2E: Quick View bar visibility, modal open/close, product data rendering, mobile viewport, overlay backdrop close |

## 4. Data Flow

### 4.1 Quick View Trigger → Modal → API → Render

```mermaid
sequenceDiagram
    participant S as Shopper
    participant T as ProductTile (Override)
    participant M as QuickViewModal
    participant H as useProductViewModal Hook
    participant RQ as React Query Cache
    participant P as /mobify/proxy/api
    participant API as SCAPI (Shopper Products)
    participant PV as ProductView

    S->>T: Hover/Tap product tile
    Note over T: Overlay bar slides up (CSS transition)
    S->>T: Click "Quick View" bar
    Note over T: e.preventDefault() + e.stopPropagation()
    T->>T: useDisclosure.onOpen()
    T->>M: Render QuickViewModal (isOpen=true)
    M->>H: useProductViewModal(searchHit)
    H->>RQ: Check cache for product ID
    alt Cache miss
        RQ->>P: GET /products/{id}?expand=images,promotions,availability
        P->>API: Forward request
        API-->>P: Full ShopperProduct response
        P-->>RQ: Cache response
    end
    RQ-->>H: { product, isFetching: false }
    H-->>M: productViewModalData
    M->>PV: Render ProductView (product, showFullLink=true, imageSize="sm")
    PV-->>S: Image gallery, variant selectors, Add to Cart
```

### 4.2 Add to Cart (Within Modal)

```mermaid
sequenceDiagram
    participant S as Shopper
    participant PV as ProductView
    participant BM as useShopperBasketsMutation
    participant P as /mobify/proxy/api
    participant API as SCAPI (Shopper Baskets)
    participant Toast as Chakra Toast

    S->>PV: Select variants + click "Add to Cart"
    PV->>BM: addItemToBasket({ productId, quantity, ... })
    BM->>P: POST /baskets/{basketId}/items
    P->>API: Forward basket mutation
    API-->>P: Updated basket
    P-->>BM: Success response
    BM-->>PV: Mutation complete
    PV->>Toast: Show "Item added to cart" notification
    Toast-->>S: Toast appears above modal overlay
```

## 5. Override Mechanism Architecture

The PWA Kit extensibility system resolves component imports through an override chain:

```
Import Resolution Order:
1. overrides/app/components/<name>/index.jsx   ← Our custom code (WINS)
2. @salesforce/retail-react-app/app/components/<name>/index.jsx  ← Base template

Configuration:
  package.json → ccExtensibility.overridesDir: "overrides"
```

```mermaid
graph TD
    A[PLP Page imports ProductTile] -->|Webpack resolves| B{Override exists?}
    B -->|Yes| C[overrides/app/components/product-tile/index.jsx]
    B -->|No| D[@salesforce/retail-react-app/.../product-tile/index.jsx]
    C -->|Explicitly imports base| D
    C --> E[QuickViewModal - new component]
    E -->|Uses base hook| F[useProductViewModal]
    E -->|Renders base component| G[ProductView]
    F -->|Internally calls| H[useProduct from commerce-sdk-react]
    G -->|Internally calls| I[useShopperBasketsMutation]
```

**Key architectural constraint:** Our override imports the base `ProductTile` explicitly via the full package path (`@salesforce/retail-react-app/app/components/product-tile`), wraps it, and adds the overlay bar. This avoids duplicating any base tile logic.

## 6. Deployment Architecture

```mermaid
graph LR
    subgraph CI["GitHub Actions CI"]
        Build["npm run build"]
        Test["npm test"]
        Push["pwa-kit-dev push"]
    end

    subgraph MRT["Managed Runtime"]
        Bundle["Bundle Storage"]
        SSR["SSR Lambda - Node.js"]
        CDN["CDN Edge"]
        Proxy["/mobify/proxy/api"]
    end

    subgraph SFCC["Salesforce Commerce Cloud"]
        SCAPI["Shopper APIs"]
        SLAS["SLAS Auth"]
        DIS["Dynamic Imaging"]
    end

    Build --> Push
    Push --> Bundle
    Bundle --> SSR
    SSR --> CDN
    CDN --> Proxy
    Proxy --> SCAPI
    CDN --> SLAS
    CDN --> DIS
```

The Quick View feature requires **no deployment configuration changes**. It uses:
- Existing proxy configuration (`/mobify/proxy/api` → `xfdy2axw.api.commercecloud.salesforce.com`)
- Existing SLAS client ID (`44cfcf31-d64d-4227-9cce-1d9b0716c321`)
- Existing Commerce API org (`f_ecom_aaia_prd`) and site (`RefArch`)
- No new routes, no new API endpoints, no new environment variables

## 7. Technology Stack Summary

| Layer | Technology | Version |
|---|---|---|
| Framework | Salesforce PWA Kit | 9.1.1 (`@salesforce/retail-react-app`) |
| UI Library | Chakra UI | via PWA Kit shared UI |
| State / Data | React Query | via `@salesforce/commerce-sdk-react` |
| API | Salesforce Commerce API (SCAPI) | Shopper Products v1, Shopper Baskets v1 |
| Auth | SLAS (Shopper Login & API Access Service) | Managed by `commerce-sdk-react` |
| i18n | react-intl | ICU message format |
| Testing | Jest + React Testing Library | via `pwa-kit-dev test` |
| E2E | Playwright | Configured in `playwright.config.ts` |
| Runtime | Node.js 22.x on Managed Runtime | SSR + CDN |
| Build | Webpack | via `pwa-kit-dev build` |

---

*Generated by doc-architect agent — 2026-04-20 (rev 2: post-implementation alignment)*
