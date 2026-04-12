# E2E Test Guidelines (PWA Kit)

## Wait Strategies

1. **NEVER use `page.waitForLoadState('networkidle')`.** The PWA Kit dev server maintains a persistent HMR WebSocket connection, so `networkidle` (0 connections for 500ms) will never resolve. This causes silent test hangs that consume the full Playwright timeout.
2. **Use `domcontentloaded` for page navigation waits:**
   ```ts
   await page.goto(url, { waitUntil: 'domcontentloaded' })
   ```
3. **Use explicit locator waits for readiness:** After navigation, wait for a known element to confirm the page rendered:
   ```ts
   await page.locator('[data-testid="product-tile"]').first().waitFor({ state: 'visible' })
   ```

## Resource Constraints

4. **Always run Playwright with `--workers=1`** in CI/devcontainer environments. Multiple Chromium instances cause OOM crashes in constrained memory.
5. **Budget 60 seconds for PWA Kit server boot.** The dev server (`npm start`) compiles webpack bundles on first request. If using Playwright's `webServer` config, set `timeout: 120_000` to account for cold start.

## Diagnostics

6. **Capture browser console errors and failed network requests** in `test.afterEach` or in the test body on failure. This evidence is critical for triage when reporting via `pipeline:fail`.
