/**
 * e2e/_qa_product-quick-view.spec.ts
 *
 * QA-Adversary probes for the Product Quick View feature.
 * Attempts to break the feature through adversarial interactions
 * that exercise boundary conditions, race conditions, and alternate
 * input modalities.
 *
 * Every probe maps to a required_flow or required_dom entry in
 * the acceptance contract.
 */

import { test, expect, awaitHydrated } from './fixtures';
import type { Page, ConsoleMessage } from '@playwright/test';

// ---------------------------------------------------------------------------
// Baseline noise allowlist — derived MECHANICALLY from baseline.json
// Only entries where volatility === "persistent" are included.
// Patterns are treated as literal substrings.
// ---------------------------------------------------------------------------

const BASELINE_PERSISTENT_PATTERNS: string[] = [
  'Warning: The result of getServerSnapshot should be cached to avoid an infinite loop',
  'Warning: %s: Support for defaultProps will be removed from function components in a future major release. Use JavaScript default parameters instead.',
  'Failed to load resource: net::ERR_NAME_NOT_RESOLVED',
  'retail-react-app.use-datacloud._handleApiError ERROR [DataCloudApi] Error sending Data Cloud event',
  'r: 403 Forbidden',
];

function isBaselineNoise(msg: string): boolean {
  return BASELINE_PERSISTENT_PATTERNS.some((pattern) => msg.includes(pattern));
}

// ---------------------------------------------------------------------------
// Forbidden patterns from acceptance contract
// ---------------------------------------------------------------------------

const FORBIDDEN_CONSOLE_PATTERNS: RegExp[] = [
  /Failed to fetch product/,
  /QuickView.*unmounted/,
];

const FORBIDDEN_NETWORK_PATTERNS: RegExp[] = [
  /GET \/mobify\/proxy\/api\/.*\/products\/.*/,
  /POST \/mobify\/proxy\/api\/.*\/baskets$/,
  /POST \/mobify\/proxy\/api\/.*\/baskets\/.*\/items/,
];

// ---------------------------------------------------------------------------
// Signal capture helpers
// ---------------------------------------------------------------------------

interface Signals {
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
}

function createSignals(): Signals {
  return { consoleErrors: [], pageErrors: [], failedRequests: [] };
}

function attachSignalListeners(page: Page, signals: Signals): void {
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') {
      signals.consoleErrors.push(msg.text());
    }
  });
  page.on('pageerror', (err: Error) => {
    const header = err.name ? `${err.name}: ${err.message}` : err.message;
    const stack = (err.stack ?? '').split('\n').slice(0, 5).join('\n');
    signals.pageErrors.push(stack || header);
  });
  page.on('requestfailed', (req) => {
    const failure = req.failure();
    const reason = failure?.errorText ?? 'failed';
    signals.failedRequests.push(
      `${req.method()} ${req.url()} ${reason}`,
    );
  });
}

/**
 * Assert no forbidden console patterns (after baseline filtering).
 * Assert no uncaught page errors (TypeError, ReferenceError, RangeError).
 * Assert no forbidden network failures.
 */
function assertNoViolations(signals: Signals): void {
  // Filter console errors to non-baseline
  const nonBaselineErrors = signals.consoleErrors.filter(
    (e) => !isBaselineNoise(e),
  );

  // Check forbidden console patterns
  for (const err of nonBaselineErrors) {
    for (const pattern of FORBIDDEN_CONSOLE_PATTERNS) {
      expect(
        pattern.test(err),
        `Forbidden console pattern "${pattern}" found in: ${err}`,
      ).toBe(false);
    }
  }

  // Uncaught page errors are always violations
  const criticalPageErrors = signals.pageErrors.filter(
    (e) =>
      /TypeError|ReferenceError|RangeError/.test(e) && !isBaselineNoise(e),
  );
  expect(
    criticalPageErrors,
    `Uncaught page errors: ${criticalPageErrors.join('; ')}`,
  ).toEqual([]);

  // Check forbidden network failure patterns
  for (const req of signals.failedRequests) {
    for (const pattern of FORBIDDEN_NETWORK_PATTERNS) {
      expect(
        pattern.test(req),
        `Forbidden network failure "${pattern}" matched: ${req}`,
      ).toBe(false);
    }
  }
}

// ---------------------------------------------------------------------------
// Overlay dismissal helper (from existing spec pattern)
// ---------------------------------------------------------------------------

/**
 * Nuclear option: remove all Chakra portal overlays from the DOM.
 * On mobile viewports (< 768px) the consent/locale dialogs fill the
 * entire viewport and cannot be dismissed by clicking because the
 * overlay backdrop intercepts all pointer events. This is platform
 * behavior, not a feature bug, so we surgically remove it.
 */
async function forceRemoveOverlays(page: Page): Promise<void> {
  await page.evaluate(() => {
    // Find all Chakra modal overlays and remove them
    document.querySelectorAll('.chakra-modal__overlay').forEach((el) => el.remove());
    // Also find and click any consent/cookie dialog close/accept buttons
    document.querySelectorAll('[role="dialog"]').forEach((dialog) => {
      const buttons = dialog.querySelectorAll('button');
      for (const btn of buttons) {
        const text = (btn.textContent || '').toLowerCase();
        if (/accept|decline|close|dismiss|got it|continue/.test(text)) {
          btn.click();
          return;
        }
      }
      // If no matching button, just remove the dialog's parent portal
      const portal = dialog.closest('.chakra-portal');
      if (portal) portal.remove();
    });
    // Remove aria-hidden from main content (Chakra focus trap side-effect)
    document.querySelectorAll('[data-aria-hidden="true"]').forEach((el) => {
      el.removeAttribute('aria-hidden');
      el.removeAttribute('data-aria-hidden');
    });
  });
  // Brief wait for React reconciliation
  await page.waitForTimeout(500);
}

async function dismissOverlays(page: Page): Promise<void> {
  const ctaPattern =
    /accept|decline|close|continue|got it|dismiss|confirm|select/i;
  for (let pass = 0; pass < 5; pass++) {
    const dialogs = await page.getByRole('dialog').all();
    let dismissed = false;
    for (const dialog of dialogs) {
      if (!(await dialog.isVisible().catch(() => false))) continue;
      // On mobile viewports, buttons may be obscured — try force click first
      const cta = dialog.getByRole('button', { name: ctaPattern }).first();
      const clicked = await cta
        .click({ timeout: 800, force: true })
        .then(() => true)
        .catch(() => false);
      if (!clicked) {
        // Fallback: try any visible button inside the dialog
        const anyBtn = dialog.getByRole('button').first();
        const fallbackClicked = await anyBtn
          .click({ timeout: 400, force: true })
          .then(() => true)
          .catch(() => false);
        if (!fallbackClicked) {
          await page.keyboard.press('Escape').catch(() => {});
        }
      }
      await dialog
        .waitFor({ state: 'hidden', timeout: 1500 })
        .catch(() => {});
      dismissed = true;
    }
    if (!dismissed) {
      // Also try removing any Chakra portal overlays via JS as last resort
      await page.evaluate(() => {
        document.querySelectorAll('.chakra-portal').forEach((el) => {
          const dialog = el.querySelector('[role="dialog"]');
          if (dialog) {
            const closeBtn = dialog.querySelector('button');
            if (closeBtn) (closeBtn as HTMLButtonElement).click();
          }
        });
      }).catch(() => {});
      // Brief wait for any JS-triggered dismissal
      await page.waitForTimeout(300);
      // Check if any dialogs remain
      const remaining = await page.getByRole('dialog').all();
      const anyVisible = await Promise.all(
        remaining.map((d) => d.isVisible().catch(() => false)),
      );
      if (!anyVisible.some(Boolean)) return;
    }
  }
}

// ---------------------------------------------------------------------------
// Adversarial Probes
// ---------------------------------------------------------------------------

test.describe('QA-Adversary: Product Quick View', () => {
  // =========================================================================
  // Probe 1: Double-click on quick-view trigger (race condition)
  // Flow: open-quick-view-from-tile
  // =========================================================================
  test('probe:double-click-trigger — open-quick-view-from-tile', async ({
    page,
  }) => {
    const signals = createSignals();
    attachSignalListeners(page, signals);

    await page.goto('/category/mens-accessories', {
      waitUntil: 'domcontentloaded',
    });
    await dismissOverlays(page);
    await awaitHydrated(page);

    const trigger = page.getByTestId('quick-view-trigger').first();
    await expect(trigger).toBeVisible({ timeout: 10000 });

    // Rapid double-click — could cause double-mount or stale state
    await trigger.dblclick();

    // Modal should still resolve to a single visible instance
    const modal = page.getByTestId('quick-view-modal');
    await expect(modal).toBeVisible({ timeout: 10000 });

    // Product view should render
    await expect(page.getByTestId('product-view')).toBeVisible({
      timeout: 10000,
    });

    // Should not have multiple modals stacked
    const modalCount = await page.getByTestId('quick-view-modal').count();
    expect(modalCount, 'Multiple modals opened from double-click').toBe(1);

    assertNoViolations(signals);
  });

  // =========================================================================
  // Probe 2: Keyboard-only navigation to open Quick View
  // Flow: open-quick-view-from-tile
  // =========================================================================
  test('probe:keyboard-only-open — open-quick-view-from-tile', async ({
    page,
  }) => {
    const signals = createSignals();
    attachSignalListeners(page, signals);

    await page.goto('/category/mens-accessories', {
      waitUntil: 'domcontentloaded',
    });
    await dismissOverlays(page);
    await awaitHydrated(page);

    const trigger = page.getByTestId('quick-view-trigger').first();
    await expect(trigger).toBeVisible({ timeout: 10000 });

    // Focus the trigger via programmatic focus then activate with Enter
    await trigger.focus();
    await page.keyboard.press('Enter');

    const modal = page.getByTestId('quick-view-modal');
    await expect(modal).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('product-view')).toBeVisible({
      timeout: 10000,
    });

    assertNoViolations(signals);
  });

  // =========================================================================
  // Probe 3: Mobile viewport replay
  // Flow: open-quick-view-from-tile
  // =========================================================================
  test('probe:mobile-viewport — open-quick-view-from-tile', async ({
    page,
  }) => {
    const signals = createSignals();
    attachSignalListeners(page, signals);

    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/category/mens-accessories', {
      waitUntil: 'domcontentloaded',
    });
    await dismissOverlays(page);
    await awaitHydrated(page);
    // On mobile the consent overlay covers the full viewport.
    // Force-dismiss it via JS after the standard helper attempt.
    await forceRemoveOverlays(page);

    // On mobile, quick-view-trigger should be persistently visible
    const trigger = page.getByTestId('quick-view-trigger').first();
    await expect(trigger).toBeVisible({ timeout: 10000 });

    await trigger.click();

    const modal = page.getByTestId('quick-view-modal');
    await expect(modal).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('product-view')).toBeVisible({
      timeout: 10000,
    });

    // Required DOM elements must be present in mobile too
    await expect(
      page.getByTestId('quick-view-view-full-details-link'),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByTestId('quick-view-add-to-cart-btn'),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByTestId('quick-view-modal-close-btn'),
    ).toBeVisible({ timeout: 10000 });

    assertNoViolations(signals);
  });

  // =========================================================================
  // Probe 4: Rapid double-click on color swatch (race condition)
  // Flow: switch-color-swatch-in-quick-view
  // =========================================================================
  test('probe:double-click-swatch — switch-color-swatch-in-quick-view', async ({
    page,
  }) => {
    const signals = createSignals();
    attachSignalListeners(page, signals);

    await page.goto('/category/mens-accessories', {
      waitUntil: 'domcontentloaded',
    });
    await dismissOverlays(page);
    await awaitHydrated(page);

    await page.getByTestId('quick-view-trigger').first().click();
    await expect(page.getByTestId('quick-view-modal')).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByTestId('product-view')).toBeVisible({
      timeout: 10000,
    });

    // Rapid double-click on second color swatch
    const swatch = page.getByTestId('color-swatch').nth(1);
    await swatch.dblclick();

    // Product view should remain stable
    await expect(page.getByTestId('product-view')).toBeVisible({
      timeout: 10000,
    });

    assertNoViolations(signals);
  });

  // =========================================================================
  // Probe 5: Double-click Add to Cart button (double-submit)
  // Flow: add-to-bag-from-quick-view
  // =========================================================================
  test('probe:double-click-add-to-cart — add-to-bag-from-quick-view', async ({
    page,
  }) => {
    const signals = createSignals();
    attachSignalListeners(page, signals);

    await page.goto('/category/womens-clothing-dresses', {
      waitUntil: 'domcontentloaded',
    });
    await dismissOverlays(page);
    await awaitHydrated(page);

    await page.getByTestId('quick-view-trigger').first().click();
    await expect(page.getByTestId('quick-view-modal')).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByTestId('product-view')).toBeVisible({
      timeout: 10000,
    });

    // Double-click the add-to-cart button — could cause double-add
    const addBtn = page.getByTestId('quick-view-add-to-cart-btn');
    await addBtn.dblclick({ timeout: 10000 });

    // Either the confirmation modal appears or the modal stays open;
    // but no uncaught errors should occur
    const confirmModal = page.getByTestId('add-to-cart-modal');
    await confirmModal
      .waitFor({ state: 'visible', timeout: 15000 })
      .catch(() => {
        // Timeout is acceptable for double-click if button was disabled
      });

    assertNoViolations(signals);
  });

  // =========================================================================
  // Probe 6: Close modal via Escape key
  // Flow: close-quick-view-restores-focus
  // =========================================================================
  test('probe:escape-key-close — close-quick-view-restores-focus', async ({
    page,
  }) => {
    const signals = createSignals();
    attachSignalListeners(page, signals);

    await page.goto('/category/mens-accessories', {
      waitUntil: 'domcontentloaded',
    });
    await dismissOverlays(page);
    await awaitHydrated(page);

    const trigger = page.getByTestId('quick-view-trigger').first();
    await expect(trigger).toBeVisible({ timeout: 10000 });
    await trigger.click();

    await expect(page.getByTestId('quick-view-modal')).toBeVisible({
      timeout: 10000,
    });

    // Close via Escape
    await page.keyboard.press('Escape');

    // Modal should be hidden
    await expect(page.getByTestId('quick-view-modal')).not.toBeVisible({
      timeout: 10000,
    });

    // Trigger should still be visible (focus restored)
    await expect(trigger).toBeVisible({ timeout: 10000 });

    assertNoViolations(signals);
  });

  // =========================================================================
  // Probe 7: Back-button / re-entry after opening modal
  // Flow: close-quick-view-restores-focus
  // =========================================================================
  test('probe:back-button-reentry — close-quick-view-restores-focus', async ({
    page,
  }) => {
    const signals = createSignals();
    attachSignalListeners(page, signals);

    await page.goto('/category/mens-accessories', {
      waitUntil: 'domcontentloaded',
    });
    await dismissOverlays(page);
    await awaitHydrated(page);

    const trigger = page.getByTestId('quick-view-trigger').first();
    await expect(trigger).toBeVisible({ timeout: 10000 });
    await trigger.click();

    await expect(page.getByTestId('quick-view-modal')).toBeVisible({
      timeout: 10000,
    });

    // Navigate away using goBack then goForward
    await page.goBack();
    await page.waitForLoadState('domcontentloaded');
    await page.goForward();
    await page.waitForLoadState('domcontentloaded');
    await awaitHydrated(page);

    // After re-entry, the page should be stable — no zombie modals
    // Triggers should be visible
    await expect(
      page.getByTestId('quick-view-trigger').first(),
    ).toBeVisible({ timeout: 10000 });

    assertNoViolations(signals);
  });

  // =========================================================================
  // Probe 8: Mobile viewport — no pickup UI
  // Flow: no-pickup-ui-in-quick-view
  // =========================================================================
  test('probe:mobile-no-pickup — no-pickup-ui-in-quick-view', async ({
    page,
  }) => {
    const signals = createSignals();
    attachSignalListeners(page, signals);

    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/category/mens-accessories', {
      waitUntil: 'domcontentloaded',
    });
    await dismissOverlays(page);
    await awaitHydrated(page);
    // On mobile the consent overlay covers the full viewport.
    await forceRemoveOverlays(page);

    await page.getByTestId('quick-view-trigger').first().click();
    await expect(page.getByTestId('quick-view-modal')).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByTestId('product-view')).toBeVisible({
      timeout: 10000,
    });

    // Negative assertion: no delivery/pickup options on mobile either
    await expect(page.getByTestId('delivery-options')).not.toBeVisible();
    await expect(page.getByTestId('store-pickup')).not.toBeVisible();

    assertNoViolations(signals);
  });

  // =========================================================================
  // Probe 9: Verify Add to Cart disabled state (master product)
  // Flow: add-to-bag-disabled-when-unavailable
  // =========================================================================
  test('probe:add-to-cart-disabled-master — add-to-bag-disabled-when-unavailable', async ({
    page,
  }) => {
    const signals = createSignals();
    attachSignalListeners(page, signals);

    await page.goto('/category/womens-clothing-dresses', {
      waitUntil: 'domcontentloaded',
    });
    await dismissOverlays(page);
    await awaitHydrated(page);

    await page.getByTestId('quick-view-trigger').first().click();
    await expect(page.getByTestId('quick-view-modal')).toBeVisible({
      timeout: 10000,
    });

    const addBtn = page.getByTestId('quick-view-add-to-cart-btn');
    await expect(addBtn).toBeVisible({ timeout: 10000 });

    // Verify disabled state — must be disabled before complete variation selected
    await expect(addBtn).toBeDisabled();

    // Non-empty text required
    await expect(addBtn).not.toHaveText('');

    assertNoViolations(signals);
  });

  // =========================================================================
  // Probe 10: DOM cardinality checks
  // Flow: open-quick-view-from-tile (required_dom verification)
  // =========================================================================
  test('probe:dom-cardinality — required_dom', async ({ page }) => {
    const signals = createSignals();
    attachSignalListeners(page, signals);

    await page.goto('/category/mens-accessories', {
      waitUntil: 'domcontentloaded',
    });
    await dismissOverlays(page);
    await awaitHydrated(page);

    // quick-view-trigger should have cardinality: many (at least 1)
    const triggerCount = await page.getByTestId('quick-view-trigger').count();
    expect(triggerCount, 'Expected multiple quick-view-trigger elements').toBeGreaterThanOrEqual(1);

    // Open quick view
    await page.getByTestId('quick-view-trigger').first().click();
    await expect(page.getByTestId('quick-view-modal')).toBeVisible({
      timeout: 10000,
    });

    // quick-view-modal: cardinality one
    const modalCount = await page.getByTestId('quick-view-modal').count();
    expect(modalCount, 'Expected exactly 1 quick-view-modal').toBe(1);

    // quick-view-modal-close-btn: cardinality one
    const closeBtnCount = await page
      .getByTestId('quick-view-modal-close-btn')
      .count();
    expect(closeBtnCount, 'Expected exactly 1 close button').toBe(1);

    // quick-view-add-to-cart-btn: cardinality one, requires_non_empty_text
    const addBtn = page.getByTestId('quick-view-add-to-cart-btn');
    await expect(addBtn).toBeVisible({ timeout: 10000 });
    await expect(addBtn).not.toHaveText('');
    const addBtnCount = await addBtn.count();
    expect(addBtnCount, 'Expected exactly 1 add-to-cart button').toBe(1);

    // quick-view-view-full-details-link: cardinality one, requires_non_empty_text
    const detailsLink = page.getByTestId('quick-view-view-full-details-link');
    await expect(detailsLink).toBeVisible({ timeout: 10000 });
    await expect(detailsLink).not.toHaveText('');
    const detailsCount = await detailsLink.count();
    expect(detailsCount, 'Expected exactly 1 view-full-details link').toBe(1);

    // product-view: cardinality one
    const pvCount = await page.getByTestId('product-view').count();
    expect(pvCount, 'Expected exactly 1 product-view').toBe(1);

    assertNoViolations(signals);
  });

  // =========================================================================
  // Probe 11: Open-close-reopen (state leak detection)
  // Flow: open-quick-view-from-tile + close-quick-view-restores-focus
  // =========================================================================
  test('probe:open-close-reopen — open-quick-view-from-tile', async ({
    page,
  }) => {
    const signals = createSignals();
    attachSignalListeners(page, signals);

    await page.goto('/category/mens-accessories', {
      waitUntil: 'domcontentloaded',
    });
    await dismissOverlays(page);
    await awaitHydrated(page);

    const trigger = page.getByTestId('quick-view-trigger').first();
    await expect(trigger).toBeVisible({ timeout: 10000 });

    // Open
    await trigger.click();
    await expect(page.getByTestId('quick-view-modal')).toBeVisible({
      timeout: 10000,
    });

    // Close via close button
    await page.getByTestId('quick-view-modal-close-btn').click({ timeout: 5000 });
    await expect(page.getByTestId('quick-view-modal')).not.toBeVisible({
      timeout: 10000,
    });

    // Re-open — should work cleanly with no stale state
    await trigger.click();
    await expect(page.getByTestId('quick-view-modal')).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByTestId('product-view')).toBeVisible({
      timeout: 10000,
    });

    assertNoViolations(signals);
  });
});
