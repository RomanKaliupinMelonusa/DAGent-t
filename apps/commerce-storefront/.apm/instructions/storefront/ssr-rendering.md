## SSR & Rendering

### Dual-Context Rendering

PWA Kit runs the same React source code in two contexts:
1. **Server-side (Express/Node.js):** Initial page render for fast load + SEO.
2. **Client-side (Browser):** Hydration + subsequent navigations (SPA behavior).

### Critical SSR Rules

1. **No `window`, `document`, or browser APIs in server code.** Guard with:
   ```jsx
   if (typeof window !== 'undefined') {
     // browser-only code
   }
   ```
2. **`getProps()` runs on the server first, then on client navigation.** It must be isomorphic.
3. **No side effects in `getProps()`.** It should only fetch data and return props. No DOM manipulation, no localStorage.
4. **`getProps()` receives `(params, location, request)`.** Use these — don't access `window.location`.
5. **Errors in `getProps()` crash SSR.** Always wrap API calls in try/catch and return fallback data.

### Express Server

- The Express server config lives in `app/ssr.js`.
- Custom middleware can be added here (e.g., redirects, header injection).
- Do NOT add heavy computation here — it runs on every request and affects TTFB.

### Hydration

- After SSR, React hydrates the server-rendered HTML on the client.
- **Hydration mismatch = broken page.** The server and client must render identical initial HTML.
- Common mismatch causes:
  - `Date.now()` or `Math.random()` in render
  - Browser-only state in initial render
  - Conditional rendering based on `typeof window`

### Commerce SDK Hooks & SSR

`commerce-sdk-react` hooks (`useProduct`, `useProductViewModal`, `useShopperBasketsMutation`, `useCustomer`, etc.) fire API calls immediately on mount. When a component using these hooks is part of the SSR render tree, those API calls execute on the **server** for every request — causing:
- SCAPI rate-limit hits (N concurrent API calls × M concurrent SSR requests)
- SSR crash if the hook depends on client-only context (toast, auth state)
- Blank pages when the server-rendered HTML never completes

**Rules for components with commerce hooks:**

1. **Modals, drawers, popovers, tooltips** — these start closed and open on user interaction. **NEVER render them in the component tree during SSR.** Guard with `isOpen`:
   ```jsx
   // ✅ Correct — modal component only mounts after client-side click
   {isOpen && (
     <Suspense fallback={<Spinner />}>
       <QuickViewModal product={product} onClose={onClose} />
     </Suspense>
   )}

   // ❌ WRONG — hooks inside MyModal fire during SSR for every tile on the page
   <MyModal isOpen={isOpen} product={product} />
   ```

2. **Per-item hooks in lists** — If a list renders 25 items and each mounts a component calling `useProduct()`, that's 25 API calls per SSR request. Use `React.lazy()` + `Suspense` and only mount the active item:
   ```jsx
   // ✅ Correct — lazy-load only when activated
   const [activeProduct, setActiveProduct] = useState(null);
   {activeProduct && <LazyProductDetail product={activeProduct} />}

   // ❌ WRONG — 25 useProduct() calls during SSR
   {products.map(p => <ProductDetail key={p.id} product={p} />)}
   ```

3. **`useToast()` from Chakra UI** — this hook accesses browser-only context. Wrap toast-using components in a client-only guard or a lazy boundary.

4. **Always wrap commerce-hook components in an ErrorBoundary** — isolate failures in fetched content from crashing the parent page.

### Performance

- Use `React.lazy()` + `Suspense` for code splitting heavy components.
- Static assets go in `app/static/` — served via `/mobify/bundle/`.
- Use the `ssrShared` config to control which files are accessible via CDN.
- Never import large libraries in the critical rendering path.
