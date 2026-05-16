# E2E Test Guidelines (PWA Kit — Demo Pipeline)

## Banned Patterns

1. **NEVER `page.waitForLoadState('networkidle')`** — PWA Kit HMR WebSocket keeps the network active forever. Use `domcontentloaded` + explicit locator waits.
2. **NEVER `page.waitForTimeout()`** — use explicit locator waits.
3. Console 403s from SLAS/Shopper APIs are expected local-dev noise. Do NOT debug them.

## Server & Resource Rules

4. Do NOT start the dev server — `playwright.config.ts` `webServer` handles it.
5. Always `--workers=1` — multiple Chromium instances cause OOM.
6. Budget 60s for PWA Kit server boot.

## Diagnostics

7. Import `test` and `expect` from `./fixtures` (NOT `@playwright/test`). The `signals` fixture auto-captures console errors and failed requests. Do NOT roll your own `page.on('console')` handlers.

## Self-Review Gate

8. `grep -rn 'networkidle' e2e/` — any hit is a commit-blocker.

## Crash Page Detection (MANDATORY)

9. After actions triggering rendering (click, navigation, modal open), check for the PWA Kit crash page:
    ```ts
    const crashHeading = page.getByRole('heading', { name: /this page isn't working/i });
    const hasCrash = await crashHeading.waitFor({ state: 'visible', timeout: 2000 }).then(() => true).catch(() => false);
    if (hasCrash) {
      const stack = await page.locator('pre').textContent().catch(() => 'no stack');
      throw new Error(`PWA Kit crash page detected. Stack: ${stack}`);
    }
    ```

## Three-Outcome Assertion (MANDATORY for modals/drawers)

10. After opening a modal that fetches API data, assert one of: content loaded, graceful error state, or crash page. Use `Promise.race` with three locators and 15s timeout. Happy-path tests MUST assert the success branch won.

## Anti-Tautology Rules

11. Test titles MUST NOT contain ` or ` between happy and failure outcomes — split into separate tests. Forbidden: `expect(A.or(B)).toBeVisible()` where A = success, B = error. Every happy-path test MUST assert a feature-specific `data-testid` with feature-specific content.

## Console Error Budget (MANDATORY)

12. Every happy-path test MUST end with:
    ```ts
    expect(
      consoleErrors.filter((e) => !BASELINE_NOISE_PATTERNS.some((re) => re.test(e)))
    ).toEqual([]);
    ```
    `BASELINE_NOISE_PATTERNS` MUST be derived mechanically from baseline (see agent prompt).

## Overlay & Hydration (MANDATORY)

13. Call `dismissOverlays(page)` after `page.goto()` and BEFORE the first interaction — overlays intercept pointer events.
14. `await awaitHydrated(page)` between `goto()` and first user action. Import from `./fixtures`. Place after `dismissOverlays(page)`.

## Strict-Mode Locators

15. Every actionable locator (`.click`, `.hover`, `.fill`) MUST resolve to exactly 1 element. Use `.first()` / `.nth(i)` or assert `.toHaveCount(1)` before acting.

## Cold-Start Warm-Up (MANDATORY)

16. Every spec file MUST include `test.beforeAll` with one throwaway navigation to prevent cold-start timeout flakes.

## Step Translation Table

| Contract step | Playwright code |
|---|---|
| `{ action: goto, url }` | `await page.goto(url, { waitUntil: 'domcontentloaded' })` |
| `{ action: click, testid }` | `await page.getByTestId(testid).click()` |
| `{ action: fill, testid, value }` | `await page.getByTestId(testid).fill(value)` |
| `{ action: assert_visible, testid }` | `await expect(page.getByTestId(testid)).toBeVisible({ timeout: 10000 })` |
| `{ action: assert_text, testid, contains }` | `await expect(page.getByTestId(testid)).toContainText(contains)` |

**Match modifiers:** `match: first` → `.first()`, `match: nth` → `.nth(nth)`, `match: only` (default) → bare locator.
