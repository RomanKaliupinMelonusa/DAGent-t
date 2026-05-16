## PWA Kit — Shared Scars

Hard-won lessons from prior runs. Every code-writing agent MUST honour these.

### SSR
- **NEVER** access `window`, `document`, `navigator`, `localStorage`, `sessionStorage` in render bodies or module scope — crashes SSR. Allowed only inside `useEffect` or behind `typeof window !== 'undefined'`.
- **No `Date.now()` / `Math.random()` in render output** — causes hydration mismatch.
- **isMounted pattern** for interactive affordances in the SSR tree: gate `onClick` elements behind `useState(false)` + `useEffect(() => setMounted(true), [])` so they appear only after hydration.
- **Modals/drawers/popovers** that use commerce-sdk-react hooks MUST NOT render during SSR. Guard with `{isOpen && <Component />}` — never `<Component isOpen={isOpen} />`.
- **useBreakpointValue / useMediaQuery** return the `base` (mobile) value during SSR but the responsive value on the client, causing a hydration mismatch. React silently fails hydration, breaking `__APP_HYDRATED__` and all E2E tests that depend on `awaitHydrated()`. **Always provide a stable value** for SSR: either always-on (`aria-label` present for all viewports) or gate behind `useEffect`/`isMounted` if the value must differ.
### ErrorBoundary
- **Wrap base-template components** (`ProductView`, `ProductItem`, `ProductScroller`) in a local `<ErrorBoundary>` when rendered inside portals (modal, drawer, popover). The SDK's `AppErrorBoundary` wraps routes, not portals — an unhandled throw destroys the entire page. Fallback MUST include `data-testid` ending in `-error`.

### data-testid
- Every clickable element, form input, and structural container MUST have `data-testid` (kebab-case).
- **Prop-spread footgun**: parent pages may pass `data-testid` via `{...rest}` that overwrites yours. Always add your testid on a **wrapper element**, not the base component's root.
- **Cardinality in lists**: interactive elements inside `.map()` MUST use a per-instance suffix (`btn-${productId}`) unless the acceptance contract declares `cardinality: many`.

### Commerce SDK
- **NEVER** use raw `fetch()` or `axios` for Commerce API calls. Always use `commerce-sdk-react` hooks. All API traffic goes through `/mobify/proxy/api`.

### Config
- **NEVER** modify `ssrEnabled` in config files.
- Validate config changes: `node -e "require('./config/default')"`.
