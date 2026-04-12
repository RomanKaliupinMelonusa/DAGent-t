# E2E Test Guidelines (PWA Kit)

## Banned Patterns

1. **You MUST NOT use `page.waitForLoadState('networkidle')`.** The PWA Kit dev server uses an HMR WebSocket that keeps the network perpetually active. `networkidle` (0 open connections for 500ms) will NEVER resolve. This causes silent 60-second hangs per test.
2. **You MUST NOT use `page.waitForTimeout()`.** Use explicit locator waits instead.

## Wait Strategies

3. **Use `domcontentloaded` for page navigation waits:**
   ```ts
   await page.goto(url, { waitUntil: 'domcontentloaded' })
   ```
4. **Use explicit locator waits for readiness.** After navigation, wait for a known element:
   ```ts
   await page.locator('[data-testid="product-tile"]').first().waitFor({ state: 'visible' })
   ```

## SLAS / Commerce API Noise

5. **Console 403s from SLAS/Shopper APIs are expected local-dev noise.** SSR handles the initial data load via server-side proxy (`/mobify/proxy/api`). Client-side SLAS guest auth may fail on localhost because the origin is not whitelisted on the Commerce Cloud tenant. The page renders correctly regardless. **You MUST NOT attempt to debug or fix console 403 errors.**

## Server Execution

6. **Do NOT start the dev server manually using `npm start` before running tests.** Playwright's `webServer` configuration in `playwright.config.ts` handles server lifecycle automatically. Just run `npx playwright test`.

## Resource Constraints

7. **Always run Playwright with `--workers=1`** in CI/devcontainer environments. Multiple Chromium instances cause OOM crashes in constrained memory.
8. **Budget 60 seconds for PWA Kit server boot.** The `webServer` config has `timeout: 120_000` to account for cold start.

## Diagnostics

9. **Capture browser console errors and failed network requests** in `test.afterEach` or in the test body on failure. This evidence is critical for triage when reporting via `pipeline:fail`.

## Self-Review Gate (MANDATORY before commit)

10. **Before committing any E2E test, you MUST run:**
    ```bash
    grep -rn 'networkidle' e2e/
    ```
    If this command returns ANY results, you have violated rule #1. Rewrite the offending test to use `domcontentloaded` + explicit locator waits before running `agent-commit.sh`.
