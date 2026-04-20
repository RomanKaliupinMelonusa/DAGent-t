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

9. **Capture browser console errors and failed network requests** in `test.afterEach` or in the test body on failure. This evidence is critical for triage when reporting via `report_outcome` (status: "failed").

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

## Anti-Tautology Rules (MANDATORY — tests that cannot fail are forbidden)

A test that passes for both the happy path and the error state is **worse than no test at all** — it ships a false green light. The following patterns are banned.

13. **Test titles MUST NOT contain ` or ` as a disjunction between a happy and failure outcome.**
    - ❌ `'shows modal with product content or error state'`
    - ❌ `'renders product details or crash page'`
    - ✅ `'shows modal with product content'` (separate test: `'shows graceful error when product API fails'`)

    Rationale: a title with " or " almost always signals an assertion that accepts either outcome, which means the test cannot distinguish a working feature from a broken one.

14. **Each acceptance criterion needs its own positive test.** One test per `required_flow`. Do not fold "happy path" and "error fallback" into a single assertion.

15. **Forbidden tautological assertion shapes** (apply even when title is clean):
    - ❌ `expect(A.or(B)).toBeVisible()` where A = success element and B = error element.
    - ❌ `await Promise.race([content.waitFor(), errorState.waitFor()])` **without** subsequently asserting that `winner === 'content'` in a happy-path test. The three-outcome pattern (rule #12) is for **diagnostic** purposes — after racing, a happy-path test must still assert the success branch won.
    - ❌ `await page.locator('body, html, #root').isVisible()` as the only assertion.
    - ❌ Any assertion whose locator matches elements on every page of the site (navigation, footer, title).

16. **Every happy-path test MUST assert a feature-specific, non-trivial element** — typically a `data-testid` added for the feature under test. If the feature introduces `data-testid="quick-view-modal"`, the happy-path test must assert that **exact** testid is visible with **product-specific content** (e.g. a non-empty price or product name inside the modal).

17. **Console-error budget.** At the end of every feature test, assert `expect(consoleErrors).toEqual([])` (or an explicit, feature-scoped allowlist). The existing `beforeEach/afterEach` logging is diagnostic — it does not fail the test. You MUST add an explicit assertion on `consoleErrors` in the test body, or the test tolerates uncaught exceptions that real users would see as broken.

18. **Self-review gate for anti-tautology.** Before committing:
    ```bash
    # Fail the run if any test title disjoins success and failure.
    grep -nE "^\s*test\((['\"]).*\b(or|and)\b.*(error|crash|fail|broken)" e2e/ && exit 1 || true
    # Fail the run if any happy-path test omits a console-error assertion.
    grep -nL "consoleErrors" e2e/*.spec.ts
    ```
    If the first command prints any line, rewrite the test title and split the assertions. If the second command lists any feature spec file, add a `consoleErrors` assertion to every happy-path test in that file.
