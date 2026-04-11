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

### Performance

- Use `React.lazy()` + `Suspense` for code splitting heavy components.
- Static assets go in `app/static/` — served via `/mobify/bundle/`.
- Use the `ssrShared` config to control which files are accessible via CDN.
- Never import large libraries in the critical rendering path.
