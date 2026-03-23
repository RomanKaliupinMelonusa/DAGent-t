// =============================================================================
// Demo Auth Fixture — Programmatic per-test session injection
// =============================================================================
// Calls POST /auth/login with demo credentials, then writes the returned
// token into sessionStorage so the DemoAuthProvider hydrates automatically.
//
// Usage in test files:
//   import { test, expect } from "../fixtures/demo-auth.fixture";
//   test("my test", async ({ authenticatedPage }) => { ... });
//
// Environment variables (all have hardcoded fallbacks):
//   FUNCTION_APP_URL — Backend URL for the login API call
//   SWA_URL          — Frontend URL (baseURL in playwright.config.ts)
//   DEMO_USER        — Demo username (default: "demo")
//   DEMO_PASS        — Demo password (default: "demopass")
// =============================================================================

import { test as base, expect, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Credentials — env vars with hardcoded fallbacks
// ---------------------------------------------------------------------------

const DEMO_USER = process.env.DEMO_USER ?? "demo";
const DEMO_PASS = process.env.DEMO_PASS ?? "demopass";

// ---------------------------------------------------------------------------
// Login API URL builder
// ---------------------------------------------------------------------------

function getLoginUrl(): string {
  const base = (process.env.FUNCTION_APP_URL ?? "http://localhost:7071").replace(/\/+$/, "");
  const path = process.env.LOGIN_API_PATH ?? "/api/auth/login";
  return `${base}${path}`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DemoAuthFixtures {
  /** A page with demo auth token pre-injected into sessionStorage. */
  authenticatedPage: Page;
}

// ---------------------------------------------------------------------------
// Extended test object
// ---------------------------------------------------------------------------

export const test = base.extend<DemoAuthFixtures>({
  authenticatedPage: async ({ page, baseURL }, use) => {
    // 1. Navigate to the app so we have a valid origin for sessionStorage
    await page.goto(baseURL ?? "/", { waitUntil: "domcontentloaded" });

    // 2. Call the demo login API to get a real token
    const loginUrl = getLoginUrl();
    const response = await page.request.post(loginUrl, {
      data: { username: DEMO_USER, password: DEMO_PASS },
      timeout: 30_000,
    });

    if (!response.ok()) {
      const body = await response.text();
      throw new Error(
        `Demo login failed (${response.status()}): ${body}\n` +
          `Login URL: ${loginUrl}\n` +
          `Credentials: ${DEMO_USER} / ***`,
      );
    }

    const { token, displayName } = await response.json();

    // 3. Inject the token into sessionStorage (matches STORAGE_KEY in demoAuthContext.tsx)
    await page.evaluate(
      ({ token, displayName }) => {
        sessionStorage.setItem(
          "demo_auth",
          JSON.stringify({ token, displayName }),
        );
      },
      { token, displayName },
    );

    // 4. Reload so DemoAuthProvider hydrates from sessionStorage
    await page.reload({ waitUntil: "domcontentloaded" });

    // 5. Yield the authenticated page to the test
    await use(page);

    // 6. Cleanup — clear session
    await page.evaluate(() => sessionStorage.clear()).catch(() => {
      /* page may already be closed */
    });
  },
});

export { expect };
