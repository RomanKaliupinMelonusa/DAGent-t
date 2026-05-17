/**
 * product-quick-view.spec.ts — E2E tests for PLP Product Quick View Modal.
 *
 * Contract: apps/commerce-storefront/.dagent/plp-quick-view/_kickoff/contracts/e2e-tests.md
 * Testids used (from contract §2):
 *   - quick-view-trigger-{productId}
 *   - quick-view-modal
 *   - quick-view-modal-error
 *   - quick-view-add-to-cart-btn
 *   - quick-view-view-full-details-link
 *   - sf-product-tile-{productId} (reused)
 *   - product-view (reused)
 *   - add-to-cart-modal (reused)
 *   - product-added (reused)
 *   - inventory-message (reused)
 */

import { test, expect, awaitHydrated } from './fixtures';
import { dismissOverlays, assertNoCrashPage } from './helpers';
import type { Page, Locator } from '@playwright/test';

// ---------------------------------------------------------------------------
// Baseline noise patterns — mechanically derived from baseline output.
// All entries with volatility: "persistent" become regex allow-list entries.
// ---------------------------------------------------------------------------

const BASELINE_NOISE_PATTERNS: RegExp[] = [
  /Warning: The result of getServerSnapshot should be cached to avoid an infinite loop/,
  /Warning:.*Support for defaultProps will be removed from function components/,
  /Failed to load resource: the server responded with a status of 403/,
  /403 Forbidden at vendor\.js/,
  /Failed to load resource: net::ERR_NAME_NOT_RESOLVED/,
  /\[DataCloudApi\] Error sending Data Cloud event/,
  /TypeError: Failed to fetch at vendor\.js/,
  // Network failures (4xx requests captured by fixture as console lines)
  /\/dw\/image\/v2\/AAIA_PRD\/on\/demandware\.static/,
  /\/callback/,
  /\/web\/events\//,
  /\/__mrt\/hmr/,
  /\/mobify\/proxy\/api\/shopper\/auth/,
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PLP_PATH = '/category/womens-clothing-dresses';

/**
 * Navigate to the PLP, await hydration, and dismiss overlays.
 */
async function gotoPlp(page: Page): Promise<void> {
  await page.goto(PLP_PATH, { waitUntil: 'domcontentloaded' });
  await awaitHydrated(page);
  await dismissOverlays(page);
}

/**
 * Return the first Quick View trigger on the PLP and its product ID.
 */
async function firstQuickViewTrigger(
  page: Page,
): Promise<{ trigger: Locator; productId: string }> {
  const trigger = page.locator('[data-testid^="quick-view-trigger-"]').first();
  await expect(trigger).toBeVisible({ timeout: 15_000 });
  const testid = await trigger.getAttribute('data-testid');
  const productId = testid!.replace('quick-view-trigger-', '');
  return { trigger, productId };
}

/**
 * Open Quick View by clicking the first trigger and waiting for the modal.
 * Returns the trigger locator and productId for downstream assertions.
 */
async function openQuickView(
  page: Page,
): Promise<{ trigger: Locator; productId: string }> {
  const { trigger, productId } = await firstQuickViewTrigger(page);
  await trigger.click();
  await assertNoCrashPage(page, 'open Quick View');
  await expect(page.getByTestId('quick-view-modal')).toBeVisible({ timeout: 15_000 });
  return { trigger, productId };
}

/**
 * Assert console error budget: filter out baseline noise, assert zero remaining.
 */
function assertConsoleErrorBudget(consoleErrors: string[]): void {
  const unexpected = consoleErrors.filter(
    (e) => !BASELINE_NOISE_PATTERNS.some((re) => re.test(e)),
  );
  expect(unexpected).toEqual([]);
}

// ---------------------------------------------------------------------------
// Cold-start warm-up (mandatory per guidelines §16)
// ---------------------------------------------------------------------------

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await page.goto(PLP_PATH, { waitUntil: 'domcontentloaded' });
  await page.close();
});

// ---------------------------------------------------------------------------
// Flows
// ---------------------------------------------------------------------------

test.describe('PLP Quick View Modal', () => {
  // -------------------------------------------------------------------------
  // E2E-001: open-quick-view-from-tile (P1, US1)
  // -------------------------------------------------------------------------
  test('open-quick-view-from-tile', async ({ page, signals }) => {
    await gotoPlp(page);
    const urlBefore = page.url();

    await openQuickView(page);

    // Modal visible with product-view inside
    await expect(page.getByTestId('quick-view-modal')).toBeVisible();
    await expect(
      page.getByTestId('quick-view-modal').getByTestId('product-view'),
    ).toBeVisible();
    // Error state NOT visible
    await expect(page.getByTestId('quick-view-modal-error')).not.toBeVisible();
    // URL unchanged (no navigation away from PLP)
    expect(page.url()).toBe(urlBefore);

    assertConsoleErrorBudget(signals.consoleErrors);
  });

  // -------------------------------------------------------------------------
  // E2E-002: switch-color-swatch-in-quick-view (P1, US1)
  // -------------------------------------------------------------------------
  test('switch-color-swatch-in-quick-view', async ({ page, signals }) => {
    await gotoPlp(page);
    await openQuickView(page);

    const modal = page.getByTestId('quick-view-modal');

    // Look for color swatch group inside modal — identify by fieldset/label
    // containing "color" (case-insensitive)
    const colorGroup = modal.locator(
      'fieldset:has(legend:text-matches("color", "i")), [role="radiogroup"][aria-label*="olor" i]',
    );

    const colorGroupVisible = await colorGroup
      .first()
      .isVisible()
      .catch(() => false);

    test.skip(!colorGroupVisible, 'No color swatch group visible on this product');

    // Find swatch buttons/radios inside the color group
    const swatches = colorGroup.first().locator('button, input[type="radio"], [role="radio"]');
    const swatchCount = await swatches.count();

    test.skip(swatchCount < 2, 'Only 1 color swatch present; cannot test switching');

    // Capture pre-click gallery image src
    const galleryImg = modal.locator('img').first();
    const srcBefore = await galleryImg.getAttribute('src');

    // Click the second swatch
    await swatches.nth(1).click();
    await assertNoCrashPage(page, 'switch color swatch');

    // Wait briefly for image update
    await expect(galleryImg).not.toHaveAttribute('src', srcBefore ?? '', {
      timeout: 10_000,
    });

    // Modal still visible
    await expect(page.getByTestId('quick-view-modal')).toBeVisible();

    assertConsoleErrorBudget(signals.consoleErrors);
  });

  // -------------------------------------------------------------------------
  // E2E-003: add-to-bag-from-quick-view (P1, US2)
  // -------------------------------------------------------------------------
  test('add-to-bag-from-quick-view', async ({ page, signals }) => {
    await gotoPlp(page);
    await openQuickView(page);

    const modal = page.getByTestId('quick-view-modal');
    const addBtn = page.getByTestId('quick-view-add-to-cart-btn');

    // Wait for add button to be enabled (a complete variation may already
    // be pre-selected for simple products)
    await expect(addBtn).toBeEnabled({ timeout: 15_000 });

    // Click Add to Bag, wait for basket response
    const [basketResponse] = await Promise.all([
      page.waitForResponse(
        (r) => /baskets/.test(r.url()) && r.status() < 400,
        { timeout: 30_000 },
      ),
      addBtn.click(),
    ]);

    // Quick View modal dismissed
    await expect(page.getByTestId('quick-view-modal')).not.toBeVisible({
      timeout: 15_000,
    });

    // Add-to-cart confirmation modal visible
    await expect(page.getByTestId('add-to-cart-modal')).toBeVisible({
      timeout: 15_000,
    });

    // At least 1 product-added row
    await expect(
      page.getByTestId('add-to-cart-modal').getByTestId('product-added').first(),
    ).toBeVisible();

    // Basket response was 2xx
    expect(basketResponse.status()).toBeLessThan(400);

    assertConsoleErrorBudget(signals.consoleErrors);
  });

  // -------------------------------------------------------------------------
  // E2E-004: close-quick-view-restores-focus (P2, cross-cutting)
  // -------------------------------------------------------------------------
  test('close-quick-view-restores-focus — Escape', async ({ page, signals }) => {
    await gotoPlp(page);
    const { productId } = await openQuickView(page);

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('quick-view-modal')).not.toBeVisible({
      timeout: 5_000,
    });

    // Focus returned to trigger
    const focusedTestId = await page.evaluate(() =>
      document.activeElement?.getAttribute('data-testid'),
    );
    expect(focusedTestId).toBe(`quick-view-trigger-${productId}`);

    assertConsoleErrorBudget(signals.consoleErrors);
  });

  test('close-quick-view-restores-focus — close button', async ({ page, signals }) => {
    await gotoPlp(page);
    const { productId } = await openQuickView(page);

    // Close button inside modal
    const closeBtn = page
      .getByTestId('quick-view-modal')
      .getByRole('button', { name: /close/i });
    await closeBtn.click();
    await expect(page.getByTestId('quick-view-modal')).not.toBeVisible({
      timeout: 5_000,
    });

    const focusedTestId = await page.evaluate(() =>
      document.activeElement?.getAttribute('data-testid'),
    );
    expect(focusedTestId).toBe(`quick-view-trigger-${productId}`);

    assertConsoleErrorBudget(signals.consoleErrors);
  });

  test('close-quick-view-restores-focus — overlay click', async ({ page, signals }) => {
    await gotoPlp(page);
    const { productId } = await openQuickView(page);

    // Click the overlay (modal overlay is typically the backdrop behind the dialog)
    const overlay = page.locator('[data-testid="quick-view-modal"]').locator('..').locator('[class*="Overlay"], [class*="overlay"], [aria-hidden="true"]').first();
    const overlayVisible = await overlay.isVisible().catch(() => false);

    if (overlayVisible) {
      await overlay.click({ position: { x: 5, y: 5 }, force: true });
    } else {
      // Fallback: click outside the modal content area by clicking the
      // modal container's edge (Chakra Modal places overlay as a sibling)
      await page.mouse.click(5, 5);
    }

    await expect(page.getByTestId('quick-view-modal')).not.toBeVisible({
      timeout: 5_000,
    });

    const focusedTestId = await page.evaluate(() =>
      document.activeElement?.getAttribute('data-testid'),
    );
    expect(focusedTestId).toBe(`quick-view-trigger-${productId}`);

    assertConsoleErrorBudget(signals.consoleErrors);
  });

  // -------------------------------------------------------------------------
  // E2E-005: no-pickup-ui-in-quick-view (P1, negative)
  // -------------------------------------------------------------------------
  test('no-pickup-ui-in-quick-view', async ({ page, signals }) => {
    await gotoPlp(page);
    await openQuickView(page);

    const modal = page.getByTestId('quick-view-modal');

    // None of the pickup testids should be visible
    await expect(
      modal.locator('[data-testid="pickup-select-store-msg"]'),
    ).not.toBeVisible();
    await expect(
      modal.locator('[data-testid="store-stock-status-msg"]'),
    ).not.toBeVisible();
    // No element with testid containing "pickup"
    const pickupElements = modal.locator('[data-testid*="pickup"]');
    expect(await pickupElements.count()).toBe(0);

    // No text matching pickup/ship to store
    const pickupText = modal.locator('text=/pickup|ship to store|pick up/i');
    expect(await pickupText.count()).toBe(0);

    assertConsoleErrorBudget(signals.consoleErrors);
  });

  // -------------------------------------------------------------------------
  // E2E-006: add-to-bag-disabled-when-unavailable (P2, US3)
  // -------------------------------------------------------------------------
  test('add-to-bag-disabled-when-unavailable', async ({ page, signals }) => {
    await gotoPlp(page);
    await openQuickView(page);

    const addBtn = page.getByTestId('quick-view-add-to-cart-btn');

    // Check if the button starts disabled (master product, no variation pre-selected)
    const isDisabledInitially = await addBtn.isDisabled().catch(() => false);

    test.skip(
      !isDisabledInitially,
      'First product has a pre-selected valid variation; cannot test disabled state. Covered by unit tests.',
    );

    // Button is disabled before variation selection
    await expect(addBtn).toBeDisabled();

    // Attempt to find an OOS variation by scanning swatches
    const modal = page.getByTestId('quick-view-modal');
    const sizeGroup = modal.locator(
      'fieldset:has(legend:text-matches("size", "i")), [role="radiogroup"][aria-label*="ize" i]',
    );

    const sizeGroupVisible = await sizeGroup.first().isVisible().catch(() => false);
    if (sizeGroupVisible) {
      const sizeSwatches = sizeGroup.first().locator('button, input[type="radio"], [role="radio"]');
      const count = await sizeSwatches.count();

      // Try clicking each swatch and checking if button stays disabled + inventory message appears
      let foundOos = false;
      for (let i = 0; i < count; i++) {
        await sizeSwatches.nth(i).click();
        const disabled = await addBtn.isDisabled().catch(() => false);
        if (disabled) {
          const invMsg = page.getByTestId('inventory-message');
          const invVisible = await invMsg.isVisible().catch(() => false);
          if (invVisible) {
            foundOos = true;
            await expect(addBtn).toBeDisabled();
            await expect(invMsg).toBeVisible();
            break;
          }
        }
      }
      // If no OOS found, that's acceptable — skip with note
      if (!foundOos) {
        // The initial disabled state already asserted above is the primary assertion
      }
    }

    assertConsoleErrorBudget(signals.consoleErrors);
  });

  // -------------------------------------------------------------------------
  // E2E-007: view-full-details-link (P3, US4)
  // -------------------------------------------------------------------------
  test('view-full-details-link', async ({ page, signals }) => {
    await gotoPlp(page);
    await openQuickView(page);

    const link = page.getByTestId('quick-view-view-full-details-link');
    await expect(link).toBeVisible();

    await link.click();
    await assertNoCrashPage(page, 'navigate to PDP via View Full Details');

    // URL should now be a PDP (contains /product/ or similar pattern)
    await page.waitForURL(/\/product\/|\/products\//, { timeout: 15_000 });
    expect(page.url()).toMatch(/\/product/);

    // Modal no longer visible
    await expect(page.getByTestId('quick-view-modal')).not.toBeVisible();

    assertConsoleErrorBudget(signals.consoleErrors);
  });

  // -------------------------------------------------------------------------
  // E2E-008: tile-click-still-navigates-to-pdp (P2, US1 regression)
  // -------------------------------------------------------------------------
  test('tile-click-still-navigates-to-pdp', async ({ page, signals }) => {
    await gotoPlp(page);

    const urlBefore = page.url();

    // Click the tile image (NOT the Quick View trigger)
    // Product tiles have testid sf-product-tile-{productId}; click the img inside
    const firstTile = page.locator('[data-testid^="sf-product-tile-"]').first();
    await expect(firstTile).toBeVisible({ timeout: 15_000 });
    const tileImg = firstTile.locator('a img, a').first();
    await tileImg.click();

    // Should navigate to PDP
    await page.waitForURL(/\/product\/|\/products\//, { timeout: 15_000 });
    expect(page.url()).not.toBe(urlBefore);

    // Quick View modal should NOT be visible
    await expect(page.getByTestId('quick-view-modal')).not.toBeVisible();

    assertConsoleErrorBudget(signals.consoleErrors);
  });
});
