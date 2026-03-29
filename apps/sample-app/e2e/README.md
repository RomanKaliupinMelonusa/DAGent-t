# e2e/

Playwright end-to-end tests for the sample app.

## Setup

```bash
cd ..                              # sample-app root
npx playwright install chromium    # install browser
```

## Running

Start both backend and frontend first, then:

```bash
npx playwright test                # run all E2E tests
npx playwright test --ui           # interactive mode
```

## Test Specs

| File | Tests | Description |
|------|-------|-------------|
| `login.spec.ts` | 4 | Demo login flow — form rendering, credential validation, session persistence |
| `authenticated-hello.spec.ts` | 4 | Post-login API call — /hello response display, navigation while authenticated, sign-out |
| `profile.spec.ts` | 7 | User profile page — happy path save, 400/401 error handling, network failure, navigation persistence, banner clearing |

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `SWA_URL` | `http://localhost:3000` | Frontend URL |
| `FUNCTION_APP_URL` | `http://localhost:7071` | Backend URL (for auth fixture) |
| `DEMO_USER` | `demo` | Demo credentials |
| `DEMO_PASS` | `demopass` | Demo credentials |

## Auth Fixture

Use the demo auth fixture for tests that need an authenticated session:

```typescript
import { test, expect } from "./fixtures/demo-auth.fixture";

test("authenticated test", async ({ authenticatedPage }) => {
  await authenticatedPage.goto("/");
  // page is already logged in
});
```
