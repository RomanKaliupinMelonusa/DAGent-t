## PWA Kit Patterns

### Component Architecture

- **Page components** live in `app/pages/`. Each page component receives data via `getProps()` (server-side) and renders with React.
- **UI components** use [Chakra UI](https://chakra-ui.com/) for styling. Always import from `@chakra-ui/react`.
- **Emotion CSS-in-JS** is the styling system. Use `sx` prop or `styled()` — never raw CSS files.
- **Icons** come from `@chakra-ui/icons` or custom SVGs in `app/static/`.

### Data Fetching with commerce-sdk-react

Use `@salesforce/commerce-sdk-react` hooks for ALL Salesforce Commerce API interactions:

| Hook | Purpose |
|---|---|
| `useProduct` | Fetch product details by ID |
| `useProducts` | Fetch product list by IDs |
| `useCategories` | Fetch category tree |
| `useSearchSuggestions` | Typeahead search |
| `useShopperBaskets` | Cart operations |
| `useShopperOrders` | Order creation |
| `useShopperLogin` | SLAS auth session |
| `useShopperCustomers` | Customer profile |

**Rules:**
1. NEVER call Commerce APIs directly via `fetch()` or `axios`. Always use the SDK hooks.
2. Use `useQuery` / `useMutation` patterns from the SDK — they handle caching and deduplication.
3. All API calls are proxied through `/mobify/proxy/api` — never use absolute Salesforce API URLs.

### Routing

- Routes are defined in `app/routes.jsx` (or `.tsx`).
- Each route maps a URL pattern to a page component.
- Use `getProps(params, location, request)` on page components for server-side data fetching.
- Route parameters are available via `useParams()` from `react-router-dom`.

### State Management

- **Server state:** Managed by `commerce-sdk-react` hooks (React Query under the hood).
- **Client state:** Use React's `useState` / `useContext` for UI state. Avoid Redux unless inherited from the template.
- **Cart/Basket:** Always use `useShopperBaskets` — never store cart data in local state.

### PWA Kit Extension Points

- **Request Processor:** `app/request-processor.js` — customize CDN caching rules.
- **SSR Server:** `app/ssr.js` — customize Express server behavior.
- **Worker:** `worker/main.js` — customize service worker (offline support, precaching).

### File Naming Conventions

- Page components: `app/pages/<page-name>/index.jsx`
- Partials/sections: `app/pages/<page-name>/partials/<section>.jsx`
- Shared components: `app/components/<component-name>/index.jsx`
- Hooks: `app/hooks/use-<name>.js`
- Utilities: `app/utils/<name>.js`
- Constants: `app/constants.js`
