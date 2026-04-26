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

9. **Capture browser console errors and failed network requests** by importing
   `test` and `expect` from `./fixtures` instead of `@playwright/test`.
   The auto-use `signals` fixture in `e2e/fixtures.ts` wires listeners on
   every `page` and attaches `console-errors`, `failed-requests`, and
   `uncaught-error` artifacts to **failed** tests automatically — no
   per-test `afterEach` wiring required.

   ```ts
   // ✅ Canonical imports
   import { test, expect } from './fixtures';

   test('my feature', async ({ page }) => { /* ... */ });
   ```

   The triage layer parses these attachments deterministically via
   `tools/autonomous-factory/src/triage/playwright-report.ts` and
   subtracts the pre-feature `<slug>/_kickoff/baseline.json` before the dev agent
   ever sees them. **Do NOT** roll your own `page.on('console')` handlers
   — they produce non-standard attachment names the parser won't match.

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
    const content = page.locator('[data-testid="feature-modal"]');
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
    An unexplained 15-second timeout provides **zero triage value**. Always explicitly detect the failure mode so the LLM classifier can decide between `test-code` (route back to the SDET) and `code-defect` (route to `@storefront-debug`).

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

16. **Every happy-path test MUST assert a feature-specific, non-trivial element** — typically a `data-testid` added for the feature under test. If the feature introduces `data-testid="feature-modal"`, the happy-path test must assert that **exact** testid is visible with **feature-specific content** (e.g. a non-empty heading or detail text inside the modal).

17. **Console-error budget.** At the end of every feature test, assert `expect(consoleErrors).toEqual([])` (or an explicit, feature-scoped allowlist). The existing `beforeEach/afterEach` logging is diagnostic — it does not fail the test. You MUST add an explicit assertion on `consoleErrors` in the test body, or the test tolerates uncaught exceptions that real users would see as broken.

18. **Self-review gate for anti-tautology.** Before committing:
    ```bash
    # Fail the run if any test title disjoins success and failure.
    grep -nE "^\s*test\((['\"]).*\b(or|and)\b.*(error|crash|fail|broken)" e2e/ && exit 1 || true
    # Fail the run if any happy-path test omits a console-error assertion.
    grep -nL "consoleErrors" e2e/*.spec.ts
    ```
    If the first command prints any line, rewrite the test title and split the assertions. If the second command lists any feature spec file, add a `consoleErrors` assertion to every happy-path test in that file.

## Overlay Dismissal (MANDATORY — call before first interaction)

PWA Kit mounts cookie/consent, locale-onboarding, and similar dialogs into a `chakra-portal` host that sits **on top of the PLP / PDP / cart page roots**. These portals intercept pointer events on tiles, swatches, ATC buttons, and any other actionable target. A spec that calls `.click()` / `.hover()` / `.fill()` without dismissing them first will retry for 60 s and time out with `<div class="chakra-portal">…</div> subtree intercepts pointer events`. Triage classifies that as `test-code` and routes it back to you.

19. **Every spec rooted at a storefront page (PLP, PDP, cart, checkout, search, account) MUST call `dismissOverlays(page)` immediately after `page.goto(...)` and BEFORE the first interaction.** This applies even on tests that target a "should not crash" outcome — the overlay still intercepts.

    Generic catalog of overlays the helper MUST handle (PWA-Kit-wide, not feature-specific):
    - **Tracking / cookie consent** — `role="dialog"` whose accessible name matches `/consent|cookie|tracking/i`, primary CTA matches `/accept|decline|got it|dismiss/i`.
    - **Locale / region / currency onboarding** — `role="dialog"` with primary CTA matching `/continue|confirm|select/i`.
    - **Any other `chakra-portal`-mounted dialog** with a primary CTA matching the union pattern below.

    **The helper is inlined per spec.** Do NOT modify `e2e/fixtures.ts` — fixtures.ts is treated as PWA-Kit framework code and is out of bounds for feature work. Add **only** the `Page` type import and the helper function below to each spec file that navigates to a storefront page (your spec already imports `test`/`expect` from `'./fixtures'` per rule §9 — do not duplicate that import).

    ```ts
    import type { Page } from '@playwright/test';

    /**
     * Dismiss any Chakra-portal-mounted dialog (consent, locale, onboarding)
     * that intercepts pointer events on PLP/PDP/cart roots. PWA-Kit-generic;
     * idempotent; never throws; bounded total wall time (~1.5s worst case,
     * <50 ms when no overlay is present). Uses only `@playwright/test`
     * primitives — no `waitForTimeout`, no `networkidle` (per rules §1–§2).
     */
    async function dismissOverlays(page: Page): Promise<void> {
      const ctaPattern = /accept|decline|close|continue|got it|dismiss|confirm|select/i;
      // Up to 3 passes — stacked portals (consent + locale) need sequential dismiss.
      // Each pass blocks at most ~500 ms (one CTA click attempt @ 400 ms +
      // one short locator wait), so worst case is ~1.5 s without timers.
      for (let pass = 0; pass < 3; pass++) {
        const dialogs = await page.getByRole('dialog').all();
        let dismissed = false;
        for (const dialog of dialogs) {
          if (!(await dialog.isVisible().catch(() => false))) continue;
          const cta = dialog.getByRole('button', { name: ctaPattern }).first();
          const clicked = await cta
            .click({ timeout: 400 })
            .then(() => true)
            .catch(() => false);
          if (!clicked) {
            await page.keyboard.press('Escape').catch(() => {});
          }
          // Wait for THIS dialog to detach before scanning again. Bounded
          // by an explicit locator wait (rule §3-style) — no waitForTimeout.
          await dialog.waitFor({ state: 'hidden', timeout: 400 }).catch(() => {});
          dismissed = true;
        }
        if (!dismissed) return;
      }
    }
    ```

    Self-review grep (run before commit; sets a flag instead of `exit`-ing the parent shell):
    ```bash
    # Every spec that calls page.goto must also call dismissOverlays.
    missing=0
    for f in $(grep -lE "page\.goto\(" e2e/*.spec.ts 2>/dev/null); do
      if ! grep -q "dismissOverlays" "$f"; then
        echo "MISSING dismissOverlays: $f"
        missing=1
      fi
    done
    [ "$missing" = 0 ] || echo "FAIL: add dismissOverlays(page) per §19 to the files above"
    ```

## Strict-Mode-Safe Locators (MANDATORY)

Playwright runs every actionable locator (`.click`, `.hover`, `.fill`, `.tap`, `.dispatchEvent`, `.press`) under **strict mode**. If the locator resolves to ≥ 2 elements, the action throws `strict mode violation: <selector> resolved to N elements`. Triage classifies that as `test-code` and routes it back to you.

20. **Cardinality discipline rules:**

    1. **Every actionable locator MUST resolve to exactly one element.** If you build a locator with `.filter({ has })`, `.locator(...)`, `getByRole(...)`, or `getByText(...)` and you intend to act on it, end the chain with `.first()` / `.nth(i)` OR pair it with `await expect(loc).toHaveCount(1)` before the action verb. The `.toHaveCount(1)` form doubles as a regression assertion: if the DOM grows to two matches in the future, the test fails loudly instead of silently acting on the first.
    2. **Prefer feature-scoped `data-testid` over prefix-stem matchers for actions.** Feature-scoped testids (e.g. `product-tile-quick-view-btn-${productId}`, `cart-line-remove-btn-${lineId}`) name a single instance. Prefix-stem matchers (`[data-testid^="product-tile-"]`, `getByTestId(/^cart-line-/)`) are for **enumeration only** — never for action. If your spec needs to act on "the first tile", reach for the feature-scoped child testid directly, not the parent stem + filter.
    3. **`.filter({ has })` on prefix-stem testids is a smell when the goal is action.** It typically resolves to N parents (one per tile / cart line / etc.) and forces you to bolt `.first()` onto the chain to satisfy strict mode — at which point the prefix-stem is doing no work. Collapse to the child testid.
    4. **When iterating multi-resolution locators, materialise first.** Use `for (const el of await loc.all()) { … }`. Never rely on Playwright's implicit fan-out for actionable verbs — strict mode rejects it, and the failure mode is non-obvious.

    **Worked counter-example (real cycle-2 regression).**

    ❌ Failing — strict mode rejected (resolved to 50 elements):
    ```ts
    await page
      .locator('[data-testid^="product-tile-"]')
      .filter({ has: page.getByTestId('quick-view-trigger').first() })
      .hover();
    // Error: strict mode violation: locator(...).filter({ has: ... }) resolved to 50 elements
    ```

    ✅ Corrected (Strategy A — explicit `.first()`, accepts N matches): when the spec only needs to act on "any one" tile, pick one explicitly. Cardinality is intentional, no count assertion needed.
    ```ts
    const trigger = page.getByTestId(/^product-tile-quick-view-btn-/).first();
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
    ```

    ✅ Corrected (Strategy B — exact-one assertion, fails loudly): when the spec must guarantee a single instance (e.g. an acceptance criterion says "the page shows exactly one Quick View trigger for the featured product"), assert the count first. Do **not** wrap it in `.catch()` — that defeats the regression guard.
    ```ts
    const trigger = page.getByTestId(`product-tile-quick-view-btn-${productId}`);
    await expect(trigger).toHaveCount(1);
    await trigger.click();
    ```

    Pick **one** strategy per call site. Never combine `.toHaveCount(1).catch(...)` with `.first()` — the catch swallows the regression signal and the `.first()` makes the assertion redundant.

    ✅ Alternative — when the design genuinely requires hovering the parent tile to reveal the trigger, hover the **specific** tile (feature-scoped tile testid), not the prefix stem:
    ```ts
    const productId = 'womens-jewelry-bundleM';
    await page.getByTestId(`product-tile-${productId}`).hover();
    await page.getByTestId(`product-tile-quick-view-btn-${productId}`).click();
    ```

## When you receive a triage-handoff from a prior cycle (MANDATORY)

You have been re-invoked because a prior cycle's spec failed in a downstream node (`e2e-runner`, `qa-adversary`, or `storefront-debug`) and triage classified the failure as `test-code`. The pipeline materialises the prior triage decision into your invocation under `inputs/triage-handoff.json`. Treat this artifact as authoritative.

21. **Redev-cycle discipline:**

    1. **Read first, edit second.** Before opening any spec, read `inputs/triage-handoff.json` and surface these fields to yourself: `failingItem`, `errorExcerpt`, `triageDomain`, `triageReason`, `priorAttemptCount`, `touchedFiles`. The `triageReason` is the LLM classifier's diagnosis — it tells you exactly which assertion path needs editing.
    2. **Diff before rewriting.** Read the existing failing spec verbatim. Identify (a) tests that were passing in the prior run and (b) tests that triaged into your domain. **Preserve passing assertions byte-for-byte.** Do NOT regenerate the file from scratch — that is how new defect classes get introduced and how `halt_on_identical` ends the run after three cycles with no progress.
    3. **Scope edits to the failing assertion path.** Only modify the locator chain, wait, setup helper, or assertion that the `triageReason` directly implicates. Untouched tests stay untouched. New defect classes introduced into previously-passing tests are a regression.
    4. **No new test cases during a redev cycle** unless the handoff explicitly calls out missing coverage. The redev surface is "fix what triage flagged", not "expand the suite".
    5. **Re-audit every changed locator against §20 and every page-rooted spec against §19** before committing. Run the §10 / §18 / §19 self-review greps locally; a redev that re-introduces a `networkidle`, a tautological title, a missing `dismissOverlays`, or a strict-mode-unsafe locator will simply triage back to you next cycle.

## Hydration discipline (MANDATORY — gate first interaction on hydration)

PWA Kit ships fully-rendered HTML from the SSR server. Buttons, links, and form controls are present in the DOM **before** React has attached its event handlers on the client. A spec that calls `.click()` / `.fill()` / `.press()` between `page.goto(...)` and React's first `useEffect` will land on a non-interactive element — the click dispatches, the handler is not yet bound, the modal never opens, and Playwright times out 15 s later with a useless `TimeoutError`. Triage classifies that as `test-code` and routes it back to you.

The app shell sets `window.__APP_HYDRATED__ = true` from a single `useEffect` after first client-side mount (see `overrides/app/components/_app/index.jsx`). The `awaitHydrated(page)` helper exported from `./fixtures` polls for that flag with a 10 s timeout.

22. **Every spec MUST `await awaitHydrated(page)` between `page.goto(...)` and the first user-action verb** (`click`, `fill`, `press`, `hover`, `tap`, `dispatchEvent`, `selectOption`, `check`, `setInputFiles`). Place it after `dismissOverlays(page)` (§19) so overlays are dismissed under the SSR DOM and the next interaction lands on a hydrated handler.

    ```ts
    // ✅ Canonical sequence
    import { test, expect, awaitHydrated } from './fixtures';

    test('opens quick view modal', async ({ page }) => {
      await page.goto('/category/womens-jewelry', { waitUntil: 'domcontentloaded' });
      await dismissOverlays(page);          // §19 — drop intercepting portals
      await awaitHydrated(page);            // §22 — wait for React to attach handlers
      await page.getByTestId('product-tile-quick-view-btn-womens-jewelry-bundleM').click();
      await expect(page.getByTestId('quick-view-modal')).toBeVisible();
    });
    ```

    **Pre-hydration shell tests are the only exception.** A spec that deliberately asserts on the SSR-rendered shell *before* hydration (e.g. SEO meta tags, no-JS fallback, server-rendered breadcrumb) MUST omit `awaitHydrated` AND add a one-line comment immediately above `page.goto(...)`:

    ```ts
    // pre-hydration: asserting SSR-rendered <title> before React mounts.
    await page.goto('/category/womens-jewelry', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveTitle(/Women's Jewelry/);
    ```

    The `// pre-hydration` token is what the self-review grep allowlists — keep the wording exact.

    Self-review grep (run before commit; sets a flag instead of `exit`-ing the parent shell):
    ```bash
    # Every spec that calls page.goto must also call awaitHydrated, OR
    # justify the omission with a `// pre-hydration` comment.
    missing=0
    for f in $(grep -lE "page\.goto\(" e2e/*.spec.ts 2>/dev/null); do
      if ! grep -q "awaitHydrated" "$f" && ! grep -q "// pre-hydration" "$f"; then
        echo "MISSING awaitHydrated: $f"
        missing=1
      fi
    done
    [ "$missing" = 0 ] || echo "FAIL: add awaitHydrated(page) per §22 to the files above (or annotate with // pre-hydration)"
    ```
