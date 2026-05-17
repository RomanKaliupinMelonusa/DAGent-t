## Testing Mandate

### Unit Tests (Jest)

All storefront changes must include unit tests. The template comes with a Jest setup.

**Run tests:**
```bash
cd {appRoot} && npx jest --verbose
```

### What to Test

| Type | Example | Framework |
|---|---|---|
| Component render | Page renders without errors | Jest + React Testing Library (`@testing-library/react`) |
| Hook behavior | `useProduct` returns expected data shape | Custom hook testing with mock providers |
| Utility functions | Price formatting, URL construction | Plain Jest assertions |
| Route resolution | URL patterns map to correct components | Jest with route config |

### Mocking commerce-sdk-react

**ALWAYS mock the SDK hooks in unit tests.** Never let tests hit live Commerce APIs.

```jsx
jest.mock('@salesforce/commerce-sdk-react', () => ({
  useProduct: jest.fn(() => ({ data: mockProduct, isLoading: false })),
  useCategories: jest.fn(() => ({ data: mockCategories, isLoading: false })),
  // ... other hooks
}));
```

### SSR & Hydration Test Patterns

When testing components that use the isMounted/hydration-gating pattern:

1. **Never mock `useState`** when Chakra UI components are in the render tree — Chakra's internal hooks share the same `useState` import and will break.
2. **To test SSR output** (pre-hydration), use `ReactDOMServer.renderToString(<Component />)` wrapped in the necessary providers. Assert that hydration-gated elements are NOT in the SSR output.
3. **To test hydrated output**, render normally with `@testing-library/react`'s `render()` — `useEffect` fires synchronously in JSDOM, so `isMounted` will be `true` after render.
4. **Chakra Modal Escape key**: fire `Escape` on the modal overlay element (`getByRole('dialog')`), NOT on `document`. Chakra attaches the keydown listener to the modal container, not the document.
5. **jest-dom matchers**: import `@testing-library/jest-dom` in your test setup or at the top of each test file.
6. **Scoping `let` for Jest**: When using `let` variables toggled inside `beforeEach`, declare them at the `describe` block scope, not inside `beforeEach`. Jest hoists `jest.mock()` above imports but not above `let` declarations in the same scope.

### Playwright E2E Tests

E2E tests live in `e2e/` and run against the local dev server (`http://localhost:3000`).

**Rules:**
1. Every new user-facing page or flow MUST have at least one E2E smoke test.
2. Use `page.waitForSelector()` or Playwright's auto-waiting — never `page.waitForTimeout()`.
3. **Browser diagnostic capture is MANDATORY:** Capture `console.error` and failed network requests on every test. On assertion failure, capture a screenshot.
4. Do NOT `test.skip` without documenting the reason.
5. Commerce API responses are proxied — tests should work against the sandbox with real data.
