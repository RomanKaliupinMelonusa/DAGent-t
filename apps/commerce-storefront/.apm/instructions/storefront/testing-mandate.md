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

### Playwright E2E Tests

E2E tests live in `e2e/` and run against the local dev server (`http://localhost:3000`).

**Rules:**
1. Every new user-facing page or flow MUST have at least one E2E smoke test.
2. Use `page.waitForSelector()` or Playwright's auto-waiting — never `page.waitForTimeout()`.
3. **Browser diagnostic capture is MANDATORY:** Capture `console.error` and failed network requests on every test. On assertion failure, capture a screenshot.
4. Do NOT `test.skip` without documenting the reason.
5. Commerce API responses are proxied — tests should work against the sandbox with real data.
