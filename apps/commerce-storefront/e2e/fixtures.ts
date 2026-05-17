/**
 * e2e/fixtures.ts — Auto-use Playwright fixtures that deterministically
 * attach browser-runtime signals to every failed test.
 *
 * Replaces `@playwright/test` as the canonical `test` import for specs
 * under `./e2e`. By extending the base `page` fixture with `console`,
 * `pageerror`, and `requestfailed` listeners, and attaching the collected
 * payloads in an `afterEach` hook, the triage pipeline receives:
 *
 *   - `console-errors`  — newline-delimited `console.error` / `console.warn`
 *                         messages captured in-browser.
 *   - `failed-requests` — `METHOD URL -> STATUS (type)` lines for every
 *                         request that failed or returned 4xx/5xx.
 *   - `uncaught-error`  — page-level exceptions ("TypeError: …") surfaced
 *                         via `page.on('pageerror')`.
 *
 * The `@playwright/test` JSON reporter writes these attachments into
 * `playwright-report.json`, where
 * `tools/autonomous-factory/src/triage/playwright-report.ts` parses them
 * into `StructuredFailure.consoleErrors` / `failedRequests` /
 * `uncaughtErrors`. The triage layer then subtracts the pre-feature
 * baseline (`<slug>_BASELINE.json`) before the dev agent ever sees them.
 *
 * Attachments are emitted ONLY when the test fails — passing tests don't
 * pollute the report with noise. Attachments are also only emitted when
 * the respective channel has content, so renderers can skip empty blocks.
 *
 * ## Usage
 *
 * ```ts
 * // e2e/some-feature.spec.ts
 * import { test, expect } from './fixtures';
 *
 * test('renders modal', async ({ page }) => {
 *   await page.goto('/');
 *   await page.getByTestId('quick-view-btn').first().click();
 *   await expect(page.getByTestId('quick-view-modal')).toBeVisible();
 * });
 * ```
 *
 * No per-test wiring required — the auto-use `page` fixture attaches
 * listeners before each test and flushes the collected payloads to
 * `testInfo.attach()` in the teardown phase.
 */

import { test as base, expect } from '@playwright/test';
import type { ConsoleMessage, Page, Request } from '@playwright/test';

// ---------------------------------------------------------------------------
// Internal per-test state
// ---------------------------------------------------------------------------

interface SignalBuckets {
  readonly consoleErrors: string[];
  readonly failedRequests: string[];
  readonly uncaughtErrors: string[];
}

/**
 * Truncate any single captured line so one runaway log message can't blow
 * the report size. The downstream parser also truncates, but capping here
 * keeps the JSON artifact compact on disk.
 */
const MAX_LINE = 2_000;
function clip(s: string): string {
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length > MAX_LINE ? `${one.slice(0, MAX_LINE - 1)}\u2026` : one;
}

/**
 * Wire listeners to `page` and return the shared bucket so the teardown
 * hook can decide whether to attach.
 */
function installSignalListeners(page: Page): SignalBuckets {
  const buckets: SignalBuckets = {
    consoleErrors: [],
    failedRequests: [],
    uncaughtErrors: [],
  };

  const onConsole = (msg: ConsoleMessage) => {
    const type = msg.type();
    if (type !== 'error' && type !== 'warning') return;
    // Ignore Chromium's dev-tools lifecycle noise — not an app defect.
    const text = msg.text();
    if (!text) return;
    buckets.consoleErrors.push(clip(`[${type}] ${text}`));
  };

  const onPageError = (err: Error) => {
    const header = err.name ? `${err.name}: ${err.message}` : err.message;
    const stackFirst = (err.stack ?? '').split('\n').slice(0, 6).join('\n');
    buckets.uncaughtErrors.push(clip(stackFirst || header));
  };

  const onRequestFailed = (req: Request) => {
    const failure = req.failure();
    const reason = failure?.errorText ?? 'failed';
    buckets.failedRequests.push(
      clip(`${req.method()} ${req.url()} -> ${reason} (${req.resourceType()})`),
    );
  };

  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  page.on('requestfailed', onRequestFailed);

  // Response-level 4xx/5xx — distinct from transport-level `requestfailed`.
  page.on('response', (res) => {
    const status = res.status();
    if (status < 400) return;
    buckets.failedRequests.push(
      clip(`${res.request().method()} ${res.url()} -> ${status} (${res.request().resourceType()})`),
    );
  });

  return buckets;
}

// ---------------------------------------------------------------------------
// Extended fixtures
// ---------------------------------------------------------------------------

type Signals = { signals: SignalBuckets };

export const test = base.extend<Signals>({
  // Auto-used signals bucket — installs listeners on the default `page`
  // fixture and attaches captured payloads on failure.
  signals: [
    async ({ page }, use, testInfo) => {
      const buckets = installSignalListeners(page);
      await use(buckets);

      // Attach only when the test actually failed — passing tests should
      // leave the report clean. `timedOut` counts as failed for our
      // purposes: we want the diagnostic even when the assertion never
      // reached `expect`.
      const failed =
        testInfo.status !== testInfo.expectedStatus ||
        testInfo.status === 'timedOut';
      if (!failed) return;

      if (buckets.consoleErrors.length > 0) {
        await testInfo.attach('console-errors', {
          body: buckets.consoleErrors.join('\n'),
          contentType: 'text/plain',
        });
      }
      if (buckets.failedRequests.length > 0) {
        await testInfo.attach('failed-requests', {
          body: buckets.failedRequests.join('\n'),
          contentType: 'text/plain',
        });
      }
      if (buckets.uncaughtErrors.length > 0) {
        // Emit each uncaught exception as its own attachment so multiple
        // errors surface separately in the JSON reporter — the parser
        // already handles a repeated `uncaught-error` name.
        for (const msg of buckets.uncaughtErrors) {
          await testInfo.attach('uncaught-error', {
            body: msg,
            contentType: 'text/plain',
          });
        }
      }
    },
    { auto: true },
  ],
});

export { expect };

// ---------------------------------------------------------------------------
// Hydration gate
// ---------------------------------------------------------------------------

/**
 * Wait for the storefront app shell to finish its first client-side mount,
 * indicated by `window.__APP_HYDRATED__ === true` (set from a useEffect in
 * `overrides/app/components/_app/index.jsx`).
 *
 * Use this between `page.goto(...)` and the first user-action verb on any
 * spec that interacts with React-attached handlers (click, fill, hover,
 * tap, press, dispatchEvent, selectOption, check, setInputFiles). Without
 * this gate, Playwright can act on SSR-rendered DOM before React has
 * attached `onClick` and the event is silently dropped.
 *
 * Explicit by design — pre-hydration shell tests must NOT call this. See
 * `apps/commerce-storefront/.apm/instructions/storefront/e2e-guidelines.md`
 * §22 for usage rules and the self-review grep.
 */
export async function awaitHydrated(
  page: Page,
  opts?: { timeout?: number },
): Promise<void> {
  await page.waitForFunction(
    () => (window as unknown as { __APP_HYDRATED__?: boolean }).__APP_HYDRATED__ === true,
    undefined,
    { timeout: opts?.timeout ?? 10_000 },
  );
}

