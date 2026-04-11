import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for the PWA Kit commerce storefront.
 *
 * Runs E2E tests against the local dev server (npm start → localhost:3000).
 * The webServer config auto-starts the dev server before tests and shuts it
 * down after.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'html',
  timeout: 60_000,

  use: {
    baseURL: process.env.STOREFRONT_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Start the PWA Kit dev server before running tests */
  webServer: process.env.STOREFRONT_URL
    ? undefined // Skip webServer when testing against a deployed URL
    : {
        command: 'npm start',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000, // PWA Kit SSR startup can be slow
      },
});
