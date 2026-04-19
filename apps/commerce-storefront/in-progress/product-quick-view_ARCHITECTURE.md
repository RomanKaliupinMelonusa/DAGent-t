# Architecture Report: Product Quick View

**Feature:** `product-quick-view`
**App:** `apps/commerce-storefront`
**Date:** 2026-04-19
**Author:** Executive Architect (automated)

---

## 1. C4 Context Diagram

The Product Quick View feature operates within the Salesforce PWA Kit Managed Runtime ecosystem. The storefront communicates with SCAPI (Salesforce Commerce API) via a reverse proxy, using SDK hooks for data fetching and mutation.

```mermaid
C4Context
    title System Context — Product Quick View

    Person(shopper, "Shopper", "Browses PLP, uses Quick View to preview products without navigating to PDP")

    System(storefront, "Commerce Storefront", "PWA Kit React SPA running on Managed Runtime (Node SSR + Client hydration)")

    System_Ext(scapi, "Salesforce Commerce API (SCAPI)", "Shopper Products, Shopper Baskets, SLAS Auth")
    System_Ext(cdn, "Managed Runtime CDN", "Serves SSR pages and static bundles via eCDN edge nodes")
    System_Ext(slas, "SLAS", "Shopper Login & API Access Service — issues OAuth tokens for API calls")

    Rel(shopper, storefront, "Browses PLP, clicks Quick View overlay bar", "HTTPS")
    Rel(storefront, scapi, "Fetches product details, adds to cart", "HTTPS via /mobify/proxy/api")
    Rel(storefront, cdn, "Serves SSR HTML + JS bundles", "HTTPS")
    Rel(storefront, slas, "Obtains shopper access token (guest or registered)", "HTTPS OAuth2")
```

## 2. C4 Container Diagram

```mermaid
C4Container
    title Container Diagram — Product Quick View Data Flow

    Person(shopper, "Shopper")

    Container_Boundary(runtime, "Managed Runtime") {
        Container(ssr, "SSR Server", "Node.js", "Server-side renders PLP with ProductTile components. Quick View bar renders with opacity:0 on desktop (no SSR mismatch).")
        Container(spa, "Client SPA", "React 18 + Chakra UI", "Hydrates PLP. Handles Quick View interactions entirely client-side.")
    }

    Container_Boundary(apis, "Salesforce Commerce Cloud") {
        ContainerDb(catalog, "Product Catalog", "SCAPI Shopper Products", "Returns product details with variants, images, pricing, inventory")
        ContainerDb(basket, "Basket Service", "SCAPI Shopper Baskets", "Manages cart: addItemToBasket mutation")
        Container(slas, "SLAS", "OAuth2", "Issues access tokens for guest and registered shoppers")
    }

    Rel(shopper, spa, "Hovers tile → bar appears → clicks Quick View", "Browser interaction")
    Rel(spa, ssr, "Initial page load (SSR)", "HTTP")
    Rel(spa, catalog, "useProductViewModal → useProduct(productId, {expand})", "/mobify/proxy/api")
    Rel(spa, basket, "ProductView → useShopperBasketsMutation addItemToBasket", "/mobify/proxy/api")
    Rel(spa, slas, "commerce-sdk-react auto-token refresh", "/mobify/proxy/api")
```

## 3. C4 Component Diagram

```mermaid
C4Component
    title Component Diagram — Quick View Feature

    Container_Boundary(plp, "Product Listing Page") {
        Component(productList, "ProductList", "Base template component", "Renders grid of ProductTile components from search results")
        Component(productTile, "ProductTile Override", "overrides/app/components/product-tile/index.jsx", "Wraps base ProductTile with Quick View overlay bar and modal state")
        Component(quickViewBar, "Quick View Overlay Bar", "Inline in ProductTile", "Full-width semi-transparent bar at bottom of product image area")
        Component(quickViewModal, "QuickViewModal", "overrides/app/components/quick-view-modal/index.jsx", "Chakra Modal fetching full product data and rendering ProductView")
        Component(productView, "ProductView", "Base template", "Full product detail UI: images, swatches, size selector, quantity picker, Add to Cart")
        Component(errorBoundary, "QuickViewErrorBoundary", "Class component in quick-view-modal", "Isolates ProductView render crashes from route-level error boundary")
    }

    Container_Boundary(hooks, "SDK Hooks Layer") {
        Component(useProductViewModal, "useProductViewModal", "Base template hook", "Wraps useProduct with correct expand params")
        Component(useProduct, "useProduct", "commerce-sdk-react", "TanStack Query wrapper for GET /products/{id}")
        Component(useBasketMutation, "useShopperBasketsMutation", "commerce-sdk-react", "TanStack Query mutation for POST basket items")
    }

    Rel(productList, productTile, "Renders for each search hit")
    Rel(productTile, quickViewBar, "Contains absolutely positioned")
    Rel(quickViewBar, quickViewModal, "onClick opens modal")
    Rel(quickViewModal, productView, "Renders when product loaded")
    Rel(quickViewModal, errorBoundary, "Wraps ProductView")
    Rel(quickViewModal, useProductViewModal, "Fetches full product data")
    Rel(useProductViewModal, useProduct, "Delegates API call")
    Rel(productView, useBasketMutation, "Add to Cart action")
```

## 4. Component Inventory

### 4.1 New Components (Created)

| Component | Path | Lines | Purpose |
|---|---|---|---|
| **ProductTile (Override)** | `overrides/app/components/product-tile/index.jsx` | 153 | Wraps base ProductTile with group-hover container, adds Quick View overlay bar, manages modal state |
| **QuickViewModal** | `overrides/app/components/quick-view-modal/index.jsx` | 137 | Chakra Modal displaying ProductView with loading/error/success states |
| **QuickViewErrorBoundary** | (inline in quick-view-modal/index.jsx) | ~25 | Class-based error boundary preventing ProductView crashes from bubbling up |

### 4.2 Reused Base Template Components (Unmodified)

| Component | Source | Role in Feature |
|---|---|---|
| `ProductView` | `@salesforce/retail-react-app/app/components/product-view` | Renders full product details inside modal (images, variants, cart) |
| `ProductTile` (base) | `@salesforce/retail-react-app/app/components/product-tile` | Original tile rendered inside override wrapper |
| `ProductViewModal` (pattern) | `@salesforce/retail-react-app/app/components/product-view-modal` | Architectural pattern reference (not directly imported) |

### 4.3 Reused Hooks (Unmodified)

| Hook | Source | Role in Feature |
|---|---|---|
| `useProductViewModal` | `@salesforce/retail-react-app/app/hooks/use-product-view-modal` | Fetches full product data with correct expand params |
| `useProduct` | `@salesforce/commerce-sdk-react` | Underlying SCAPI call via TanStack Query |
| `useShopperBasketsMutation` | `@salesforce/commerce-sdk-react` | Cart add-to-basket mutation (used internally by ProductView) |
| `useDisclosure` | Chakra UI (re-exported via shared/ui) | Modal open/close state management in ProductTile |

### 4.4 Test Files

| File | Path | Tests |
|---|---|---|
| ProductTile tests | `overrides/app/components/product-tile/index.test.js` | 243 lines — overlay bar rendering, interaction, accessibility |
| QuickViewModal tests | `overrides/app/components/quick-view-modal/index.test.js` | 279 lines — modal states, ProductView integration, error handling |

## 5. Data Flow

### 5.1 Quick View Interaction Sequence

```mermaid
sequenceDiagram
    participant Shopper
    participant ProductTile as ProductTile (Override)
    participant Modal as QuickViewModal
    participant Hook as useProductViewModal
    participant SCAPI as SCAPI (via proxy)
    participant ProductView as ProductView
    participant Basket as Basket API

    Shopper->>ProductTile: Hovers tile (desktop) / Sees bar (mobile)
    Note over ProductTile: Overlay bar slides up (CSS transition 250ms)
    Shopper->>ProductTile: Clicks Quick View bar
    Note over ProductTile: e.preventDefault() + e.stopPropagation()
    ProductTile->>Modal: Opens via useDisclosure.onOpen()
    Modal->>Hook: useProductViewModal(searchHitProduct)
    Hook->>SCAPI: GET /products/{productId}?expand=promotions,availability,images
    Note over Modal: Shows Spinner (data-testid=quick-view-spinner)
    SCAPI-->>Hook: Full product data (variants, images, pricing, inventory)
    Hook-->>Modal: { product, isFetching: false }
    Modal->>ProductView: Renders with product data, showFullLink=true, imageSize=sm
    Note over ProductView: Image gallery, color/size swatches, quantity picker, Add to Cart

    Shopper->>ProductView: Selects variant (size/color)
    Note over ProductView: useDerivedProduct updates selected variant, price, image

    Shopper->>ProductView: Clicks Add to Cart
    ProductView->>Basket: useShopperBasketsMutation addItemToBasket
    Basket-->>ProductView: Success
    Note over ProductView: Toast notification: Item added to cart

    Shopper->>Modal: Closes modal (X / Escape / overlay click)
    Modal->>ProductTile: onClose() — focus returns to Quick View bar
```

### 5.2 API Proxy Path

All SCAPI calls are proxied through Managed Runtime's reverse proxy to avoid CORS issues:

```
Browser → /mobify/proxy/api/... → SCAPI endpoint
```

Configuration in `config/default.js`:
- `commerceAPI.proxyPath`: `/mobify/proxy/api`
- `organizationId`: `f_ecom_aaia_prd`
- `shortCode`: `xfdy2axw`
- `siteId`: `RefArch`

### 5.3 SSR Behavior

| Phase | Behavior |
|---|---|
| **Server Render** | ProductTile renders with Quick View bar (opacity: 0 on desktop via responsive prop). Modal is NOT rendered (isOpen defaults to false). No hydration mismatch. |
| **Client Hydration** | React hydrates the tile. useDisclosure initializes with isOpen: false. Hover CSS transitions become active. |
| **User Interaction** | Quick View bar click triggers onOpen(). Modal mounts with QuickViewModal component. useProductViewModal fires the API call. |

## 6. Override Mechanism

The PWA Kit extensibility system is configured in `package.json`:

```json
{
  "ccExtensibility": {
    "extends": "@salesforce/retail-react-app",
    "overridesDir": "overrides"
  }
}
```

**Resolution order:**
1. `overrides/app/components/product-tile/index.jsx` → shadows `@salesforce/retail-react-app/app/components/product-tile/index.jsx`
2. The override imports the base component explicitly: `import OriginalProductTile from '@salesforce/retail-react-app/app/components/product-tile'`
3. All existing pages that render ProductTile (PLPs, search results, wishlists) automatically pick up the override

This means the Quick View feature is **automatically active on every page that uses ProductTile** without modifying any page-level code.

## 7. Technology Stack

| Layer | Technology | Version |
|---|---|---|
| Runtime | Salesforce Managed Runtime | — |
| Framework | PWA Kit (pwa-kit-dev) | Latest |
| Base Template | @salesforce/retail-react-app | 9.1.1 |
| UI Library | Chakra UI | (bundled with PWA Kit) |
| React | React 18 | ^18.2.0 |
| State/Data | TanStack Query via commerce-sdk-react | (bundled) |
| Testing | Jest (via pwa-kit-dev test) | (bundled) |
| E2E | Playwright | (configured) |
| Node.js | 18 / 20 / 22 | Compatible |

---

*This document was auto-generated by the Executive Architect agent as part of the autonomous pipeline.*
