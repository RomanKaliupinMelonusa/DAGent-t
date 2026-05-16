# E2E Test Guidelines (PWA Kit — Demo Pipeline)

## Banned Patterns

1. **NEVER `page.waitForLoadState('networkidle')`** — PWA Kit HMR WebSocket keeps the network active forever. Use `domcontentloaded` + explicit locator waits.
2. **NEVER `page.waitForTimeout()`** — use explicit locator waits.

## Wait Strategies

3. Navigation: `await page.goto(url, { waitUntil: 'domcontentloaded' })`
4. Readiness: wait for a known element after navigation: `await page.locator('[data-testid="product-tile"]').first().waitFor({ state: 'visible' })`

## SLAS / Commerce API Noise

5. Console 403s from SLAS/Shopper APIs are expected local-dev noise. Do NOT debug them.

## Server & Resource Rules

6. Do NOT start the dev server — `playwright.config.ts` `webServer` handles it.
7. Always `--workers=1` — multiple Chromium instances cause OOM.
8. Budget 60s for PWA Kit server boot.

## Diagnostics

9. Import `test` and `expect` from `./fixtures` (NOT `@playwright/test`). The `signals` fixture auto-captures console errors and failed requests. Do NOT roll your own `page.on('console')` handlers.

## Self-Review Gate

10. `grep -rn 'networkidle' e2e/` — any hit is a commit-blocker.

## Crash Page Detection (MANDATORY)

11. After actions triggering rendering (click, navigation, modal open), check for the PWA Kit crash page:
    ```ts
    const crashHeading = page.getByRole('heading', { name: /this page isn't working/i });
    const hasCrash = await crashHeading.waitFor({ state: 'visible', timeout: 2000 }).then(() => true).catch(() => false);
    if (hasCrash) {
      const stack = await page.locator('pre').textContent().catch(() => 'no stack');
      throw new Error(`PWA Kit crash page detected. Stack: ${stack}`);
    }
    ```

## Three-Outcome Assertion (MANDATORY for modals/drawers)

12. After opening a modal that fetches API data, assert one of: content loaded, graceful error state, or crash page. Use `Promise.race` with three locators and 15s timeout. Happy-path tests MUST assert the success branch won.

## Anti-Tautology Rules

13. Test titles MUST NOT contain ` or ` between happy and failure outcomes — split into separate tests. Forbidden: `expect(A.or(B)).toBeVisible()` where A = success, B = error. Every happy-path test MUST assert a feature-specific `data-testid` with feature-specific content.

## Console Error Budget (MANDATORY)

14. Every happy-path test MUST end with:
    ```ts
    expect(
      consoleErrors.filter((e) => !BASELINE_NOISE_PATTERNS.some((re) => re.test(e)))
    ).toEqual([]);
    ```
    `BASELINE_NOISE_PATTERNS` MUST be derived mechanically from baseline (see agent prompt).

## Overlay Dismissal (MANDATORY)

15. PWA Kit mounts cookie/consent and locale dialogs that intercept pointer events. Every spec MUST call `dismissOverlays(page)` after `page.goto(...)` and BEFORE the first interaction. Import from `./helpers`.

## Strict-Mode Locators

16. Every actionable locator (`.click`, `.hover`, `.fill`) MUST resolve to exactly 1 element. Use `.first()` / `.nth(i)` or assert `.toHaveCount(1)` before acting. Never use prefix-stem locators for actions — only enumeration.

## Hydration Gate (MANDATORY)

17. Every spec MUST `await awaitHydrated(page)` between `page.goto(...)` and the first user-action verb. Import from `./fixtures`. Place after `dismissOverlays(page)`.

## Cold-Start Warm-Up (MANDATORY)

18. Every spec file MUST include `test.beforeAll` with one throwaway navigation to prevent cold-start timeout flakes.
