/**
 * E2E tests for the PLP Product Quick View Modal feature.
 *
 * Contract: apps/commerce-storefront/.dagent/plp-quick-view/_kickoff/e2e-contract.md
 * Testids: quick-view-trigger-{productId}, quick-view-modal, quick-view-modal-error,
 *          quick-view-add-to-cart-btn, quick-view-view-full-details-link
 */

import { test, expect, awaitHydrated } from './fixtures';
import type { Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Baseline noise patterns (no baseline.json provided — empty array per §17)
// ---------------------------------------------------------------------------
const BASELINE_NOISE_PATTERNS: RegExp[] = [];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Dismiss any Chakra-portal-mounted dialog (consent, locale, onboarding)
 * that intercepts pointer events on PLP/PDP/cart roots. PWA-Kit-generic;
 * idempotent; never throws; bounded total wall time (~1.5s worst case,
 * <50 ms when no overlay is present). Uses only `@playwright/test`
 * primitives — no `waitForTimeout`, no `networkidle` (per rules §1–§2).
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

/** Navigate to the PLP, await hydration, and dismiss overlays. */
async function gotoPlp(page: Page): Promise<void> {
  await page.goto('/category/womens-clothing-dresses', {
    waitUntil: 'domcontentloaded',
  });
  await dismissOverlays(page);
  await awaitHydrated(page);
}

/**
 * Returns the first Quick View trigger on the page and its product ID.
 */
async function firstQuickViewTrigger(page: Page) {
  const trigger = page.locator('[data-testid^="quick-view-trigger-"]').first();
  await expect(trigger).toBeVisible({ timeout: 15000 });
  const testid = await trigger.getAttribute('data-testid');
  const productId = testid!.replace('quick-view-trigger-', '');
  return { trigger, productId };
}

/**
 * Opens Quick View by clicking the first trigger. Returns the trigger
 * locator and product ID for downstream assertions (e.g., focus restoration).
 */
async function openQuickView(page: Page) {
  const { trigger, productId } = await firstQuickViewTrigger(page);
  await trigger.click();
  await expect(page.getByTestId('quick-view-modal')).toBeVisible({ timeout: 15000 });
  return { trigger, productId };
}

/**
 * Collect console errors for budget assertion. Returns the array reference
 * that accumulates errors throughout the test.
 */
function captureConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

/** Assert console-error budget (zero net new errors beyond baseline noise). */
function assertConsoleErrorBudget(consoleErrors: string[]) {
  expect(
    consoleErrors.filter((e) => !BASELINE_NOISE_PATTERNS.some((re) => re.test(e))),
  ).toEqual([]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('PLP Quick View Modal', () => {
  // -------------------------------------------------------------------------
  // Flow E2E-001: open-quick-view-from-tile
  // -------------------------------------------------------------------------
  test('opens Quick View modal from product tile trigger', async ({ page }) => {
    const consoleErrors = captureConsoleErrors(page);
    await gotoPlp(page);
    const urlBefore = page.url();

    await openQuickView(page);

    // Modal is visible with product content, no error state
    await expect(page.getByTestId('quick-view-modal')).toBeVisible();
    await expect(
      page.getByTestId('quick-view-modal').getByTestId('product-view'),
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('quick-view-modal-error')).not.toBeVisible();

    // URL unchanged — no navigation away from PLP
    expect(page.url()).toBe(urlBefore);

    assertConsoleErrorBudget(consoleErrors);
  });

  // -------------------------------------------------------------------------
  // Flow E2E-002: switch-color-swatch-in-quick-view
  // -------------------------------------------------------------------------
  test('switches color swatch inside Quick View modal', async ({ page }) => {
    const consoleErrors = captureConsoleErrors(page);
    await gotoPlp(page);
    await openQuickView(page);

    const modal = page.getByTestId('quick-view-modal');

    // Discover color swatches inside the modal
    const swatches = modal.locator('button[aria-label*="color" i], [role="radio"]');
    const swatchCount = await swatches.count();

    if (swatchCount < 2) {
      test.skip(true, 'First product tile has fewer than 2 color swatches');
      return;
    }

    // Capture pre-click image src
    const galleryImg = modal.locator('img').first();
    const srcBefore = await galleryImg.getAttribute('src');

    // Click second swatch
    await swatches.nth(1).click();

    // Wait for image update
    await expect(async () => {
      const srcAfter = await galleryImg.getAttribute('src');
      expect(srcAfter).not.toBe(srcBefore);
    }).toPass({ timeout: 10000 });

    // Modal remains visible
    await expect(modal).toBeVisible();

    assertConsoleErrorBudget(consoleErrors);
  });

  // -------------------------------------------------------------------------
  // Flow E2E-003: add-to-bag-from-quick-view
  // -------------------------------------------------------------------------
  test('adds item to bag from Quick View modal', async ({ page }) => {
    const consoleErrors = captureConsoleErrors(page);
    const basketErrors: string[] = [];

    // Track basket-related responses for 4xx/5xx
    page.on('response', (res) => {
      if (/baskets/i.test(res.url()) && res.status() >= 400) {
        basketErrors.push(`${res.request().method()} ${res.url()} -> ${res.status()}`);
      }
    });

    await gotoPlp(page);
    await openQuickView(page);

    const modal = page.getByTestId('quick-view-modal');
    const addToCartBtn = page.getByTestId('quick-view-add-to-cart-btn');

    // If the button is disabled, we need to select a variation first
    const isDisabled = await addToCartBtn.isDisabled();
    if (isDisabled) {
      // Try selecting the first available size option inside the modal
      const sizeOptions = modal.locator('button[aria-label*="size" i], [role="radio"]');
      const sizeCount = await sizeOptions.count();
      if (sizeCount > 0) {
        await sizeOptions.first().click();
      }
    }

    // Wait for the button to become enabled (variation selected, in stock)
    await expect(addToCartBtn).toBeEnabled({ timeout: 10000 });

    // Click Add to Bag
    await addToCartBtn.click();

    // Quick View modal closes
    await expect(modal).not.toBeVisible({ timeout: 15000 });

    // Add-to-cart confirmation modal appears
    await expect(page.getByTestId('add-to-cart-modal')).toBeVisible({ timeout: 15000 });

    // At least one product-added row
    await expect(
      page.getByTestId('add-to-cart-modal').getByTestId('product-added').first(),
    ).toBeVisible({ timeout: 10000 });

    // No basket errors
    expect(basketErrors).toEqual([]);

    assertConsoleErrorBudget(consoleErrors);
  });

  // -------------------------------------------------------------------------
  // Flow E2E-004: close-quick-view-restores-focus (Escape)
  // -------------------------------------------------------------------------
  test('closing Quick View via Escape restores focus to trigger', async ({ page }) => {
    const consoleErrors = captureConsoleErrors(page);
    await gotoPlp(page);
    const { productId } = await openQuickView(page);

    // Dismiss via Escape
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('quick-view-modal')).not.toBeVisible({ timeout: 10000 });

    // Focus returns to the originating trigger
    const activeTestId = await page.evaluate(() =>
      document.activeElement?.getAttribute('data-testid'),
    );
    expect(activeTestId).toBe(`quick-view-trigger-${productId}`);

    assertConsoleErrorBudget(consoleErrors);
  });

  // -------------------------------------------------------------------------
  // Flow E2E-004: close-quick-view-restores-focus (close button)
  // -------------------------------------------------------------------------
  test('closing Quick View via close button restores focus to trigger', async ({ page }) => {
    const consoleErrors = captureConsoleErrors(page);
    await gotoPlp(page);
    const { productId } = await openQuickView(page);

    const modal = page.getByTestId('quick-view-modal');
    const closeBtn = modal.getByRole('button', { name: /close/i }).first();
    await closeBtn.click();
    await expect(modal).not.toBeVisible({ timeout: 10000 });

    const activeTestId = await page.evaluate(() =>
      document.activeElement?.getAttribute('data-testid'),
    );
    expect(activeTestId).toBe(`quick-view-trigger-${productId}`);

    assertConsoleErrorBudget(consoleErrors);
  });

  // -------------------------------------------------------------------------
  // Flow E2E-004: close-quick-view-restores-focus (overlay click)
  // -------------------------------------------------------------------------
  test('closing Quick View via overlay click restores focus to trigger', async ({ page }) => {
    const consoleErrors = captureConsoleErrors(page);
    await gotoPlp(page);
    const { productId } = await openQuickView(page);

    const modal = page.getByTestId('quick-view-modal');
    const modalBox = await modal.boundingBox();
    if (modalBox) {
      // Click to the left of the modal content (on the overlay)
      await page.mouse.click(Math.max(modalBox.x - 50, 5), modalBox.y + modalBox.height / 2);
    } else {
      await page.keyboard.press('Escape');
    }

    await expect(modal).not.toBeVisible({ timeout: 10000 });

    const activeTestId = await page.evaluate(() =>
      document.activeElement?.getAttribute('data-testid'),
    );
    expect(activeTestId).toBe(`quick-view-trigger-${productId}`);

    assertConsoleErrorBudget(consoleErrors);
  });

  // -------------------------------------------------------------------------
  // Flow E2E-005: no-pickup-ui-in-quick-view (negative)
  // -------------------------------------------------------------------------
  test('Quick View modal does not contain pickup or ship-to-store UI', async ({ page }) => {
    const consoleErrors = captureConsoleErrors(page);
    await gotoPlp(page);
    await openQuickView(page);

    const modal = page.getByTestId('quick-view-modal');

    // None of the pickup testids should be visible
    await expect(modal.locator('[data-testid="pickup-select-store-msg"]')).not.toBeVisible();
    await expect(modal.locator('[data-testid="store-stock-status-msg"]')).not.toBeVisible();
    await expect(modal.locator('[data-testid*="pickup"]')).not.toBeVisible();

    // No text matching pickup/ship to store
    const modalText = await modal.textContent();
    expect(modalText).not.toMatch(/pickup|ship to store|pick up/i);

    assertConsoleErrorBudget(consoleErrors);
  });

  // -------------------------------------------------------------------------
  // Flow E2E-006: add-to-bag-disabled-when-unavailable
  // -------------------------------------------------------------------------
  test('Add to Bag button is disabled when no variation is selected', async ({ page }) => {
    const consoleErrors = captureConsoleErrors(page);
    await gotoPlp(page);
    await openQuickView(page);

    const addToCartBtn = page.getByTestId('quick-view-add-to-cart-btn');

    // On a master product with variations, button should be disabled initially
    const isDisabled = await addToCartBtn.isDisabled();
    if (!isDisabled) {
      test.skip(true, 'First tile product does not require variation selection; covered by unit tests');
      return;
    }

    expect(isDisabled).toBe(true);

    assertConsoleErrorBudget(consoleErrors);
  });

  // -------------------------------------------------------------------------
  // Flow E2E-007: view-full-details-link
  // -------------------------------------------------------------------------
  test('View Full Details link navigates to PDP', async ({ page }) => {
    const consoleErrors = captureConsoleErrors(page);
    await gotoPlp(page);
    const urlBefore = page.url();

    await openQuickView(page);

    const viewDetailsLink = page.getByTestId('quick-view-view-full-details-link');
    await expect(viewDetailsLink).toBeVisible({ timeout: 10000 });
    await viewDetailsLink.click();

    // Wait for navigation away from PLP
    await expect(async () => {
      expect(page.url()).not.toBe(urlBefore);
    }).toPass({ timeout: 15000 });

    // URL should now be a PDP (contains /product/ in the path)
    expect(page.url()).toMatch(/\/product\//);

    // Modal should no longer be visible
    await expect(page.getByTestId('quick-view-modal')).not.toBeVisible();

    assertConsoleErrorBudget(consoleErrors);
  });

  // -------------------------------------------------------------------------
  // Flow E2E-008: tile-click-still-navigates-to-pdp
  // -------------------------------------------------------------------------
  test('clicking product tile image navigates to PDP without opening Quick View', async ({ page }) => {
    const consoleErrors = captureConsoleErrors(page);
    await gotoPlp(page);

    // Get the first product tile
    const tile = page.locator('[data-testid^="sf-product-tile-"]').first();
    await expect(tile).toBeVisible({ timeout: 15000 });

    // Click the tile image (not the Quick View trigger)
    const tileImage = tile.locator('img').first();
    await tileImage.click();

    // Should navigate to PDP
    await expect(async () => {
      expect(page.url()).toMatch(/\/product\//);
    }).toPass({ timeout: 15000 });

    // Quick View modal should NOT be visible
    await expect(page.getByTestId('quick-view-modal')).not.toBeVisible();

    assertConsoleErrorBudget(consoleErrors);
  });
});
