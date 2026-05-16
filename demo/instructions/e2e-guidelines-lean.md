# E2E Test Guidelines (PWA Kit — Demo Pipeline)

## Banned Patterns

1. **NEVER use `page.waitForLoadState('networkidle')`** — PWA Kit's HMR WebSocket keeps the network active. It will NEVER resolve. Use `domcontentloaded` + explicit locator waits.
2. **NEVER use `page.waitForTimeout()`** — use explicit locator waits.

## Wait Strategies

3. **Navigation:** `await page.goto(url, { waitUntil: 'domcontentloaded' })`
4. **Readiness:** After navigation, wait for a known element:
   ```ts
   await page.locator('[data-testid="product-tile"]').first().waitFor({ state: 'visible' })
   ```

## SLAS / Commerce API Noise

5. Console 403s from SLAS/Shopper APIs are expected local-dev noise. **Do NOT debug or fix them.**

## Server & Resource Rules

6. Do NOT start the dev server — `playwright.config.ts` `webServer` handles it.
7. Always run with `--workers=1` — multiple Chromium instances cause OOM.
8. Budget 60s for PWA Kit server boot.

## Diagnostics

9. Import `test` and `expect` from `./fixtures` (NOT `@playwright/test`). The auto-use `signals` fixture captures console errors, failed requests, and uncaught errors automatically on failed tests. Do NOT roll your own `page.on('console')` handlers.

## Self-Review Gate (before commit)

10. Run `grep -rn 'networkidle' e2e/` — any hit is a commit-blocker.

## Crash Page Detection (MANDATORY)

11. After any action that triggers rendering (click, navigation, modal open), check for the PWA Kit crash page:
    ```ts
    const crashHeading = page.getByRole('heading', { name: /this page isn't working/i });
    const hasCrash = await crashHeading.waitFor({ state: 'visible', timeout: 2000 }).then(() => true).catch(() => false);
    if (hasCrash) {
      const stack = await page.locator('pre').textContent().catch(() => 'no stack');
      throw new Error(`PWA Kit crash page detected. Stack: ${stack}`);
    }
    ```

## Three-Outcome Assertion (MANDATORY for modals/drawers)

12. After opening a modal that fetches API data, assert one of: content loaded, graceful error state, or crash page. Use `Promise.race` with the three locators and a 15s timeout. A happy-path test MUST assert the success branch won — accepting any outcome is tautological.

## Anti-Tautology Rules

13. **Test titles MUST NOT contain ` or ` between a happy and failure outcome.** Split into separate tests.
14. Each acceptance criterion needs its own positive `test()` block.
15. Forbidden: `expect(A.or(B)).toBeVisible()` where A = success, B = error. Forbidden: assertions whose locator matches every page (nav, footer).
16. Every happy-path test MUST assert a feature-specific `data-testid` with feature-specific content.

## Console Error Budget (MANDATORY)

17. Every happy-path test MUST end with:
    ```ts
    expect(
      consoleErrors.filter((e) => !BASELINE_NOISE_PATTERNS.some((re) => re.test(e)))
    ).toEqual([]);
    ```
    `BASELINE_NOISE_PATTERNS` MUST be derived mechanically from `inputs/baseline.json` (see agent prompt). Do NOT hand-roll patterns.

18. Self-review before commit:
    ```bash
    grep -nE "^\s*test\((['\"]).*\b(or|and)\b.*(error|crash|fail|broken)" e2e/ && exit 1 || true
    grep -nL "consoleErrors" e2e/*.spec.ts
    ```

## Overlay Dismissal (MANDATORY)

19. PWA Kit mounts cookie/consent and locale dialogs in `chakra-portal` that intercept pointer events. Every spec navigating to a storefront page MUST call `dismissOverlays(page)` after `page.goto(...)` and BEFORE the first interaction. Import from `./helpers`:
    ```ts
    import { dismissOverlays } from './helpers';
    ```

## Strict-Mode Locators

20. Every actionable locator (`.click`, `.hover`, `.fill`) MUST resolve to exactly 1 element.
    - Use `.first()` / `.nth(i)` or assert `.toHaveCount(1)` before acting.
    - Prefer feature-scoped `data-testid` over prefix-stem matchers for actions.
    - Never use prefix-stem locators (`[data-testid^="..."]`) for action — only enumeration.

## Hydration Gate (MANDATORY)

22. Every spec MUST `await awaitHydrated(page)` between `page.goto(...)` and the first user-action verb. Import from `./fixtures`:
    ```ts
    import { test, expect, awaitHydrated } from './fixtures';
    ```
    Place after `dismissOverlays(page)`. Pre-hydration shell tests are the only exception — annotate with `// pre-hydration` comment.

## Cold-Start Warm-Up (MANDATORY)

23. Every spec file MUST include a `test.beforeAll` warm-up hook that performs one throwaway navigation before tests run, preventing cold-start timeout flakes.
