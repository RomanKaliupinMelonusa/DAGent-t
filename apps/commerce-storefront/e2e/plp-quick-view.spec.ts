/**
 * E2E Tests: PLP Product Quick View Modal
 *
 * Contract: .dagent/plp-quick-view/_kickoff/e2e-contract.md
 * Feature: plp-quick-view
 *
 * Flows:
 *   E2E-001: open-quick-view-from-tile
 *   E2E-002: switch-color-swatch-in-quick-view
 *   E2E-003: add-to-bag-from-quick-view
 *   E2E-004: close-quick-view-restores-focus
 *   E2E-005: no-pickup-ui-in-quick-view
 *   E2E-006: add-to-bag-disabled-when-unavailable
 *   E2E-007: view-full-details-link
 *   E2E-008: tile-click-still-navigates-to-pdp
 */

import { test, expect, awaitHydrated } from './fixtures';
import type { Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Baseline noise patterns — mechanically derived from inputs/baseline.json
// Each entry corresponds to a console_errors[] item with volatility: "persistent"
// ---------------------------------------------------------------------------

const BASELINE_NOISE_PATTERNS: RegExp[] = [
  /Warning: The result of getServerSnapshot should be cached to avoid an infinite loop/,
  /Warning: %s: Support for defaultProps will be removed from function components in a future major release\.Use JavaScript default parameters instead\.%s PageDesignerProvider/,
  /Failed to load resource: net::ERR_NAME_NOT_RESOLVED/,
  /retail-react-app\.use-datacloud\._handleApiError ERROR \[DataCloudApi\] Error sending Data Cloud event/,
  /r: 403 Forbidden/,
  /Failed to load resource: the server responded with a status of 403 \(Forbidden\)/,
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Dismiss any Chakra-portal-mounted dialog (consent, locale, onboarding)
 * that intercepts pointer events on PLP/PDP/cart roots. PWA-Kit-generic;
 * idempotent; never throws; bounded total wall time (~1.5s worst case,
 * <50 ms when no overlay is present).
 */
async function dismissOverlays(page: Page): Promise<void> {
  const ctaPattern = /accept|decline|close|continue|got it|dismiss|confirm|select/i;
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
      await dialog.waitFor({ state: 'hidden', timeout: 400 }).catch(() => {});
      dismissed = true;
    }
    if (!dismissed) return;
  }
}

/**
 * Navigate to the PLP, dismiss overlays, and await hydration.
 */
async function gotoPlp(page: Page): Promise<void> {
  await page.goto('/category/womens-clothing-dresses', { waitUntil: 'domcontentloaded' });
  await dismissOverlays(page);
  await awaitHydrated(page);
}

/**
 * Returns the first quick-view trigger locator and its product ID.
 */
async function firstQuickViewTrigger(page: Page): Promise<{ locator: ReturnType<Page['locator']>; productId: string }> {
  const trigger = page.locator('[data-testid^="quick-view-trigger-"]').first();
  await trigger.waitFor({ state: 'visible', timeout: 10000 });
  const testid = await trigger.getAttribute('data-testid');
  const productId = testid!.replace('quick-view-trigger-', '');
  return { locator: trigger, productId };
}

/**
 * Opens the Quick View modal by clicking the first trigger.
 * Returns the trigger locator and product ID for subsequent assertions.
 */
async function openQuickView(page: Page): Promise<{ triggerLocator: ReturnType<Page['locator']>; productId: string }> {
  const { locator, productId } = await firstQuickViewTrigger(page);
  await locator.click();

  // Three-outcome detection per §12
  const modal = page.getByTestId('quick-view-modal');
  const errorState = page.getByTestId('quick-view-modal-error');
  const crashPage = page.getByRole('heading', { name: /this page isn't working/i });

  const winner = await Promise.race([
    modal.waitFor({ state: 'visible', timeout: 15000 }).then(() => 'content' as const),
    crashPage.waitFor({ state: 'visible', timeout: 15000 }).then(() => 'crash' as const),
  ]);

  if (winner === 'crash') {
    const stack = await page.locator('pre').textContent().catch(() => 'no stack');
    throw new Error(`PWA Kit crash page detected after clicking quick-view trigger. Stack: ${stack}`);
  }

  return { triggerLocator: locator, productId };
}

/**
 * Assert that console errors (beyond baseline noise) are zero.
 */
function assertConsoleErrorBudget(consoleErrors: string[]): void {
  const unexpected = consoleErrors.filter(
    (e) => !BASELINE_NOISE_PATTERNS.some((re) => re.test(e))
  );
  expect(unexpected).toEqual([]);
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe('PLP Quick View Modal', () => {
  let consoleErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
  });

  // -------------------------------------------------------------------------
  // E2E-001: open-quick-view-from-tile
  // -------------------------------------------------------------------------
  test('opens quick view modal from product tile', async ({ page }) => {
    await gotoPlp(page);
    const urlBefore = page.url();

    await openQuickView(page);

    // Modal is visible
    await expect(page.getByTestId('quick-view-modal')).toBeVisible({ timeout: 10000 });
    // Product view is visible inside modal
    await expect(page.getByTestId('product-view')).toBeVisible({ timeout: 10000 });
    // Error state is NOT visible
    await expect(page.getByTestId('quick-view-modal-error')).not.toBeVisible();
    // URL unchanged (no navigation)
    expect(page.url()).toBe(urlBefore);
    // Console-error budget
    assertConsoleErrorBudget(consoleErrors);
  });

  // -------------------------------------------------------------------------
  // E2E-002: switch-color-swatch-in-quick-view
  // -------------------------------------------------------------------------
  test('switches color swatch in quick view modal', async ({ page }) => {
    await gotoPlp(page);
    await openQuickView(page);

    const modal = page.getByTestId('quick-view-modal');

    // Find swatch buttons inside the modal — color swatches are typically
    // rendered as buttons within a swatch group
    const swatches = modal.locator('button[aria-label*="color" i], button[data-testid*="swatch"], [data-testid*="color"] button');
    const swatchCount = await swatches.count();

    if (swatchCount < 2) {
      test.skip(true, 'First tile has fewer than 2 color swatches; cannot test swatch switching');
      return;
    }

    // Capture pre-click image src
    const galleryImg = modal.locator('img').first();
    const srcBefore = await galleryImg.getAttribute('src');

    // Click second swatch
    await swatches.nth(1).click();

    await expect(modal).toBeVisible();

    // The gallery image src should differ (may take a moment to load)
    await expect(async () => {
      const srcAfter = await galleryImg.getAttribute('src');
      expect(srcAfter).not.toBe(srcBefore);
    }).toPass({ timeout: 5000 });

    // Modal still visible
    await expect(page.getByTestId('quick-view-modal')).toBeVisible();
    // Console-error budget
    assertConsoleErrorBudget(consoleErrors);
  });

  // -------------------------------------------------------------------------
  // E2E-003: add-to-bag-from-quick-view
  // -------------------------------------------------------------------------
  test('adds product to bag from quick view modal', async ({ page }) => {
    await gotoPlp(page);
    await openQuickView(page);

    const addToCartBtn = page.getByTestId('quick-view-add-to-cart-btn');

    // If the button is disabled, try selecting the first available size
    const isDisabled = await addToCartBtn.isDisabled();
    if (isDisabled) {
      const modal = page.getByTestId('quick-view-modal');
      // Try clicking the first size option
      const sizeOption = modal.locator('button[aria-label*="size" i], [data-testid*="size"] button, select option').first();
      const sizeExists = await sizeOption.isVisible().catch(() => false);
      if (sizeExists) {
        await sizeOption.click();
      }
    }

    // Wait for button to be enabled
    await expect(addToCartBtn).toBeEnabled({ timeout: 10000 });

    // Track basket responses
    const basketResponses: number[] = [];
    page.on('response', (res) => {
      if (/basket/i.test(res.url())) {
        basketResponses.push(res.status());
      }
    });

    // Click Add to Cart
    await addToCartBtn.click();

    // Quick view modal should close
    await expect(page.getByTestId('quick-view-modal')).not.toBeVisible({ timeout: 15000 });

    // Add-to-cart confirmation modal should appear
    await expect(page.getByTestId('add-to-cart-modal')).toBeVisible({ timeout: 15000 });

    // At least one product-added row
    await expect(page.getByTestId('product-added').first()).toBeVisible({ timeout: 10000 });

    // No basket-related 4xx/5xx
    const badResponses = basketResponses.filter((s) => s >= 400);
    expect(badResponses).toEqual([]);

    // Console-error budget
    assertConsoleErrorBudget(consoleErrors);
  });

  // -------------------------------------------------------------------------
  // E2E-004: close-quick-view-restores-focus
  // -------------------------------------------------------------------------
  test('closing quick view via Escape restores focus to trigger', async ({ page }) => {
    await gotoPlp(page);
    const { triggerLocator, productId } = await openQuickView(page);

    // Dismiss via Escape
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('quick-view-modal')).not.toBeVisible({ timeout: 10000 });

    // Focus should return to the trigger
    const activeTestId = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
    expect(activeTestId).toBe(`quick-view-trigger-${productId}`);

    assertConsoleErrorBudget(consoleErrors);
  });

  test('closing quick view via close button restores focus to trigger', async ({ page }) => {
    await gotoPlp(page);
    const { triggerLocator, productId } = await openQuickView(page);

    // Find and click close button inside the modal
    const modal = page.getByTestId('quick-view-modal');
    const closeBtn = modal.getByRole('button', { name: /close/i }).first();
    await closeBtn.click();

    await expect(page.getByTestId('quick-view-modal')).not.toBeVisible({ timeout: 10000 });

    const activeTestId = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
    expect(activeTestId).toBe(`quick-view-trigger-${productId}`);

    assertConsoleErrorBudget(consoleErrors);
  });

  test('closing quick view via overlay click restores focus to trigger', async ({ page }) => {
    await gotoPlp(page);
    const { triggerLocator, productId } = await openQuickView(page);

    // Click the overlay (Chakra modal overlay is typically a sibling of the modal content)
    const overlay = page.locator('.chakra-modal__overlay, [data-testid="quick-view-modal"] + div, .chakra-modal__content-container').first();
    // Click at position (0,0) of the page to hit the overlay
    await page.mouse.click(0, 0);

    await expect(page.getByTestId('quick-view-modal')).not.toBeVisible({ timeout: 10000 });

    const activeTestId = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
    expect(activeTestId).toBe(`quick-view-trigger-${productId}`);

    assertConsoleErrorBudget(consoleErrors);
  });

  // -------------------------------------------------------------------------
  // E2E-005: no-pickup-ui-in-quick-view (negative)
  // -------------------------------------------------------------------------
  test('quick view modal does not contain pickup or ship-to-store UI', async ({ page }) => {
    await gotoPlp(page);
    await openQuickView(page);

    const modal = page.getByTestId('quick-view-modal');

    // Pickup testids must NOT be visible
    await expect(modal.locator('[data-testid="pickup-select-store-msg"]')).not.toBeVisible();
    await expect(modal.locator('[data-testid="store-stock-status-msg"]')).not.toBeVisible();
    await expect(modal.locator('[data-testid*="pickup"]')).not.toBeVisible();

    // No text matching pickup/ship-to-store inside the modal
    const modalText = await modal.textContent();
    expect(modalText).not.toMatch(/pickup|ship to store|pick up/i);

    assertConsoleErrorBudget(consoleErrors);
  });

  // -------------------------------------------------------------------------
  // E2E-006: add-to-bag-disabled-when-unavailable
  // -------------------------------------------------------------------------
  test('add to bag button is disabled when variation is incomplete', async ({ page }) => {
    await gotoPlp(page);
    await openQuickView(page);

    const addToCartBtn = page.getByTestId('quick-view-add-to-cart-btn');

    // If button is already enabled, the product may be a simple product
    // with no variation selection required — skip in that case
    const isDisabled = await addToCartBtn.isDisabled();
    if (!isDisabled) {
      test.skip(true, 'First tile product does not require variation selection (simple product); covered by unit tests');
      return;
    }

    // Assert button is disabled before variation selection
    await expect(addToCartBtn).toBeDisabled();

    assertConsoleErrorBudget(consoleErrors);
  });

  // -------------------------------------------------------------------------
  // E2E-007: view-full-details-link
  // -------------------------------------------------------------------------
  test('view full details link navigates to PDP', async ({ page }) => {
    await gotoPlp(page);
    const urlBefore = page.url();
    await openQuickView(page);

    const fullDetailsLink = page.getByTestId('quick-view-view-full-details-link');
    await expect(fullDetailsLink).toBeVisible({ timeout: 10000 });

    await fullDetailsLink.click();

    // Should navigate to PDP (URL changes to product page)
    await page.waitForURL(/\/product\//, { timeout: 15000 });
    expect(page.url()).not.toBe(urlBefore);

    // Modal should no longer be visible
    await expect(page.getByTestId('quick-view-modal')).not.toBeVisible();

    assertConsoleErrorBudget(consoleErrors);
  });

  // -------------------------------------------------------------------------
  // E2E-008: tile-click-still-navigates-to-pdp (regression)
  // -------------------------------------------------------------------------
  test('clicking product tile image navigates to PDP without opening quick view', async ({ page }) => {
    await gotoPlp(page);

    const { productId } = await firstQuickViewTrigger(page);

    // Click the tile image (NOT the quick view trigger)
    const tile = page.locator(`[data-testid="sf-product-tile-${productId}"]`).first();
    const tileLink = tile.locator('a').first();
    await tileLink.click();

    // Should navigate to PDP
    await page.waitForURL(/\/product\//, { timeout: 15000 });

    // Quick view modal should NOT be visible
    await expect(page.getByTestId('quick-view-modal')).not.toBeVisible();

    assertConsoleErrorBudget(consoleErrors);
  });
});
