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

## Crash Page Detection (MANDATORY)

11. **After any action that triggers component rendering** (button click, navigation, modal open), **check for the PWA Kit crash page.** DOM signature:
    ```ts
    const crashHeading = page.getByRole('heading', { name: /this page isn't working/i });
    ```
    If detected, capture the stack trace from the `<pre>` element and throw a structured error:
    ```ts
    const hasCrash = await crashHeading.waitFor({ state: 'visible', timeout: 2000 }).then(() => true).catch(() => false);
    if (hasCrash) {
      const stack = await page.locator('pre').textContent().catch(() => 'no stack');
      throw new Error(`PWA Kit crash page detected after "${actionDescription}". Stack: ${stack}`);
    }
    ```
    This transforms ambiguous TimeoutErrors into actionable diagnostics. **Never let a crash page cause a silent 15-second timeout.**

## Three-Outcome Assertion Pattern (MANDATORY for modals/drawers)

12. **After opening a modal or drawer that fetches API data**, assert exactly one of three outcomes:
    ```ts
    // Outcome 1: Content loaded successfully
    const content = page.locator('[data-testid="quick-view-modal"]');
    // Outcome 2: Graceful error state inside the modal
    const errorState = page.locator('[data-testid*="-error"]');
    // Outcome 3: Crash page (entire page replaced)
    const crashPage = page.getByRole('heading', { name: /this page isn't working/i });

    const winner = await Promise.race([
      content.waitFor({ state: 'visible', timeout: 15000 }).then(() => 'content' as const),
      errorState.waitFor({ state: 'visible', timeout: 15000 }).then(() => 'error-state' as const),
      crashPage.waitFor({ state: 'visible', timeout: 15000 }).then(() => 'crash' as const),
    ]);

    if (winner === 'crash') {
      const stack = await page.locator('pre').textContent().catch(() => 'no stack');
      throw new Error(`PWA Kit crash page detected. Stack: ${stack}`);
    }
    // Outcome 1 or 2 are both valid — test logic decides which is expected
    ```
    An unexplained 15-second timeout provides **zero triage value**. Always explicitly detect the failure mode.
