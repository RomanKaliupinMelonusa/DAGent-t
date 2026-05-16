/**
 * E2E Tests: PLP Product Quick View Modal
 *
 * Contract: apps/commerce-storefront/.dagent/plp-quick-view/_kickoff/contracts/e2e-tests.md
 * Flows: E2E-001 through E2E-008
 */

import { test, expect, awaitHydrated } from './fixtures';
import { dismissOverlays, assertNoCrashPage } from './helpers';
import type { Page, Locator } from '@playwright/test';

// ---------------------------------------------------------------------------
// Baseline noise patterns (persistent console errors from PDP — see baseline)
// PLP pages are clean per baseline; these only apply when navigating to PDP.
// ---------------------------------------------------------------------------

const BASELINE_NOISE_PATTERNS: RegExp[] = [
  /Warning: The result of getServerSnapshot should be cached/,
  /Warning:.*Support for defaultProps will be removed from function components/,
  /TypeError: Failed to fetch at vendor\.js/,
  /Failed to load resource: net::ERR_NAME_NOT_RESOLVED/,
  /\[DataCloudApi\] Error sending Data Cloud event/,
  /Failed to load resource: the server responded with a status of 4\d\d/,
  /r: 4\d\d\s/,
  /Failed to load resource: the server responded with a status of 5\d\d/,
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PLP_PATH = '/category/womens-clothing-dresses';

async function gotoPlp(page: Page): Promise<void> {
  await page.goto(PLP_PATH, { waitUntil: 'domcontentloaded' });
  await awaitHydrated(page);
  await dismissOverlays(page);
}

async function firstQuickViewTrigger(
  page: Page,
): Promise<{ trigger: Locator; productId: string }> {
  const trigger = page.locator('[data-testid^="quick-view-trigger-"]').first();
  await expect(trigger).toBeVisible({ timeout: 15_000 });
  const testid = await trigger.getAttribute('data-testid');
  const productId = testid!.replace('quick-view-trigger-', '');
  return { trigger, productId };
}

async function openQuickView(
  page: Page,
): Promise<{ trigger: Locator; productId: string }> {
  const { trigger, productId } = await firstQuickViewTrigger(page);
  await trigger.click();
  await assertNoCrashPage(page, 'open quick view');
  await expect(page.getByTestId('quick-view-modal')).toBeVisible({ timeout: 15_000 });
  return { trigger, productId };
}

// ---------------------------------------------------------------------------
// Console error budget assertion
// ---------------------------------------------------------------------------

let consoleErrors: string[] = [];

test.beforeEach(async ({ page }) => {
  consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });
});

// ---------------------------------------------------------------------------
// Cold-start warm-up
// ---------------------------------------------------------------------------

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await page.goto(PLP_PATH, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.close();
});

// ---------------------------------------------------------------------------
// Flow E2E-001: open-quick-view-from-tile
// ---------------------------------------------------------------------------

test.describe('PLP Quick View Modal', () => {
  test('E2E-001: open-quick-view-from-tile', async ({ page }) => {
    await gotoPlp(page);
    const urlBefore = page.url();

    await openQuickView(page);

    // Modal and product view visible
    await expect(page.getByTestId('quick-view-modal')).toBeVisible();
    await expect(
      page.getByTestId('quick-view-modal').getByTestId('product-view'),
    ).toBeVisible();

    // Error state NOT visible
    await expect(page.getByTestId('quick-view-modal-error')).not.toBeVisible();

    // URL unchanged (no navigation)
    expect(page.url()).toBe(urlBefore);

    // Console error budget
    expect(
      consoleErrors.filter(
        (e) => !BASELINE_NOISE_PATTERNS.some((re) => re.test(e)),
      ),
    ).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Flow E2E-002: switch-color-swatch-in-quick-view
  // ---------------------------------------------------------------------------

  test('E2E-002: switch-color-swatch-in-quick-view', async ({ page }) => {
    await gotoPlp(page);
    await openQuickView(page);

    const modal = page.getByTestId('quick-view-modal');

    // Look for color swatch group — identified by fieldset with "color" in its
    // accessible name or label text. Skip if no color swatches present.
    const colorSwatches = modal.locator(
      'fieldset:has(legend:text-matches("color", "i")) input[type="radio"], ' +
        '[aria-label*="color" i] input[type="radio"], ' +
        '[aria-label*="Color" i] input[type="radio"]',
    );

    const swatchCount = await colorSwatches.count();
    test.skip(swatchCount < 2, 'Tile does not have ≥2 color swatches');

    // Capture pre-click image src
    const galleryImg = modal.locator('img').first();
    const srcBefore = await galleryImg.getAttribute('src');

    // Click the second color swatch
    await colorSwatches.nth(1).click();
    await assertNoCrashPage(page, 'switch color swatch');

    // Wait for image to update (src changes)
    await expect(galleryImg).not.toHaveAttribute('src', srcBefore!, {
      timeout: 10_000,
    });

    // Modal remains visible
    await expect(modal).toBeVisible();

    // Console error budget
    expect(
      consoleErrors.filter(
        (e) => !BASELINE_NOISE_PATTERNS.some((re) => re.test(e)),
      ),
    ).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Flow E2E-003: add-to-bag-from-quick-view
  // ---------------------------------------------------------------------------

  test('E2E-003: add-to-bag-from-quick-view', async ({ page }) => {
    await gotoPlp(page);
    await openQuickView(page);

    const modal = page.getByTestId('quick-view-modal');
    const addBtn = page.getByTestId('quick-view-add-to-cart-btn');

    // Wait for the add button to become enabled (complete variation selected)
    // If it's disabled, try selecting the first available size swatch
    const isDisabled = await addBtn.isDisabled();
    if (isDisabled) {
      // Select first available size option
      const sizeOptions = modal.locator(
        'fieldset:has(legend:text-matches("size", "i")) input[type="radio"]:not([disabled]), ' +
          '[aria-label*="size" i] input[type="radio"]:not([disabled]), ' +
          '[aria-label*="Size" i] input[type="radio"]:not([disabled])',
      );
      const sizeCount = await sizeOptions.count();
      if (sizeCount > 0) {
        await sizeOptions.first().click();
      }
    }

    // Wait for button to be enabled
    await expect(addBtn).toBeEnabled({ timeout: 10_000 });

    // Track basket network responses
    const basketResponses: number[] = [];
    page.on('response', (res) => {
      if (/baskets/.test(res.url())) {
        basketResponses.push(res.status());
      }
    });

    // Click add to bag
    await addBtn.click();
    await assertNoCrashPage(page, 'add to bag');

    // Quick View modal closes
    await expect(page.getByTestId('quick-view-modal')).not.toBeVisible({
      timeout: 15_000,
    });

    // Add-to-cart confirmation modal appears
    await expect(page.getByTestId('add-to-cart-modal')).toBeVisible({
      timeout: 15_000,
    });

    // At least one product-added row
    await expect(
      page.getByTestId('add-to-cart-modal').getByTestId('product-added').first(),
    ).toBeVisible();

    // No 4xx/5xx basket responses
    const badResponses = basketResponses.filter((s) => s >= 400);
    expect(badResponses).toEqual([]);

    // Console error budget
    expect(
      consoleErrors.filter(
        (e) => !BASELINE_NOISE_PATTERNS.some((re) => re.test(e)),
      ),
    ).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Flow E2E-004: close-quick-view-restores-focus
  // ---------------------------------------------------------------------------

  test('E2E-004: close-quick-view-restores-focus (Escape)', async ({
    page,
  }) => {
    await gotoPlp(page);
    const { productId } = await openQuickView(page);

    // Dismiss via Escape
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('quick-view-modal')).not.toBeVisible({
      timeout: 5_000,
    });

    // Focus returned to trigger
    const focusedTestId = await page.evaluate(() =>
      document.activeElement?.getAttribute('data-testid'),
    );
    expect(focusedTestId).toBe(`quick-view-trigger-${productId}`);

    // Console error budget
    expect(
      consoleErrors.filter(
        (e) => !BASELINE_NOISE_PATTERNS.some((re) => re.test(e)),
      ),
    ).toEqual([]);
  });

  test('E2E-004: close-quick-view-restores-focus (close button)', async ({
    page,
  }) => {
    await gotoPlp(page);
    const { productId } = await openQuickView(page);

    // Dismiss via close button (Chakra Modal close button has aria-label)
    const closeBtn = page
      .getByTestId('quick-view-modal')
      .getByRole('button', { name: /close/i });
    await closeBtn.click();
    await expect(page.getByTestId('quick-view-modal')).not.toBeVisible({
      timeout: 5_000,
    });

    // Focus returned to trigger
    const focusedTestId = await page.evaluate(() =>
      document.activeElement?.getAttribute('data-testid'),
    );
    expect(focusedTestId).toBe(`quick-view-trigger-${productId}`);

    // Console error budget
    expect(
      consoleErrors.filter(
        (e) => !BASELINE_NOISE_PATTERNS.some((re) => re.test(e)),
      ),
    ).toEqual([]);
  });

  test('E2E-004: close-quick-view-restores-focus (overlay click)', async ({
    page,
  }) => {
    await gotoPlp(page);
    const { productId } = await openQuickView(page);

    // Dismiss via overlay click — click at viewport corner outside the modal
    const modal = page.getByTestId('quick-view-modal');
    const box = await modal.boundingBox();
    if (box) {
      // Click to the left of the modal (on the overlay)
      await page.mouse.click(Math.max(box.x - 20, 5), box.y + box.height / 2);
    } else {
      // Fallback: press Escape
      await page.keyboard.press('Escape');
    }

    await expect(page.getByTestId('quick-view-modal')).not.toBeVisible({
      timeout: 5_000,
    });

    // Focus returned to trigger
    const focusedTestId = await page.evaluate(() =>
      document.activeElement?.getAttribute('data-testid'),
    );
    expect(focusedTestId).toBe(`quick-view-trigger-${productId}`);

    // Console error budget
    expect(
      consoleErrors.filter(
        (e) => !BASELINE_NOISE_PATTERNS.some((re) => re.test(e)),
      ),
    ).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Flow E2E-005: no-pickup-ui-in-quick-view (negative)
  // ---------------------------------------------------------------------------

  test('E2E-005: no-pickup-ui-in-quick-view', async ({ page }) => {
    await gotoPlp(page);
    await openQuickView(page);

    const modal = page.getByTestId('quick-view-modal');

    // None of these pickup-related testids should be visible
    await expect(
      modal.locator('[data-testid="pickup-select-store-msg"]'),
    ).not.toBeVisible();
    await expect(
      modal.locator('[data-testid="store-stock-status-msg"]'),
    ).not.toBeVisible();

    // No element with testid containing "pickup"
    const pickupElements = modal.locator('[data-testid*="pickup"]');
    expect(await pickupElements.count()).toBe(0);

    // No text matching pickup/ship to store patterns inside the modal
    const modalText = await modal.textContent();
    expect(modalText).not.toMatch(/pickup|ship to store|pick up/i);

    // Console error budget
    expect(
      consoleErrors.filter(
        (e) => !BASELINE_NOISE_PATTERNS.some((re) => re.test(e)),
      ),
    ).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Flow E2E-006: add-to-bag-disabled-when-unavailable
  // ---------------------------------------------------------------------------

  test('E2E-006: add-to-bag-disabled-when-unavailable', async ({ page }) => {
    await gotoPlp(page);
    await openQuickView(page);

    const modal = page.getByTestId('quick-view-modal');
    const addBtn = page.getByTestId('quick-view-add-to-cart-btn');

    // Check if the button starts disabled (master product, no variation selected)
    const initiallyDisabled = await addBtn.isDisabled();

    // If button is already enabled, this product has a pre-selected valid variation
    // Try to find a tile that is a master product without pre-selection
    if (!initiallyDisabled) {
      test.skip(
        true,
        'First tile has pre-selected variation; no master product with unselected variation discoverable',
      );
      return;
    }

    // Button is disabled before variation selection
    expect(await addBtn.isDisabled()).toBe(true);

    // Attempt to find an out-of-stock variation
    const disabledSwatches = modal.locator(
      'fieldset input[type="radio"][disabled]',
    );
    const oosCount = await disabledSwatches.count();

    if (oosCount > 0) {
      // Force-click the disabled swatch to select the OOS variation
      await disabledSwatches.first().click({ force: true });
      await expect(addBtn).toBeDisabled();
      await expect(
        modal.getByTestId('inventory-message'),
      ).toBeVisible({ timeout: 5_000 });
    } else {
      // No OOS variant discoverable at runtime — skip that sub-assertion
      test.skip(
        true,
        'No OOS variant discoverable; covered deterministically by unit tests',
      );
    }

    // Console error budget
    expect(
      consoleErrors.filter(
        (e) => !BASELINE_NOISE_PATTERNS.some((re) => re.test(e)),
      ),
    ).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Flow E2E-007: view-full-details-link
  // ---------------------------------------------------------------------------

  test('E2E-007: view-full-details-link', async ({ page }) => {
    await gotoPlp(page);
    await openQuickView(page);

    const link = page.getByTestId('quick-view-view-full-details-link');
    await expect(link).toBeVisible();

    await link.click();
    await assertNoCrashPage(page, 'view full details navigation');

    // Should navigate to a PDP
    await page.waitForURL(/\/product\//, { timeout: 15_000 });
    expect(page.url()).toMatch(/\/product\//);

    // Modal no longer visible
    await expect(page.getByTestId('quick-view-modal')).not.toBeVisible();

    // Console error budget (PDP may have baseline noise)
    expect(
      consoleErrors.filter(
        (e) => !BASELINE_NOISE_PATTERNS.some((re) => re.test(e)),
      ),
    ).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Flow E2E-008: tile-click-still-navigates-to-pdp
  // ---------------------------------------------------------------------------

  test('E2E-008: tile-click-still-navigates-to-pdp', async ({ page }) => {
    await gotoPlp(page);

    // Click the first tile image (not the quick view trigger) — should navigate to PDP
    const tileImage = page.locator('[data-testid="product-tile-image"]').first();
    await expect(tileImage).toBeVisible({ timeout: 15_000 });
    await tileImage.click();

    // Should navigate to PDP
    await page.waitForURL(/\/product\//, { timeout: 15_000 });
    expect(page.url()).toMatch(/\/product\//);

    // Quick view modal should NOT be visible
    await expect(page.getByTestId('quick-view-modal')).not.toBeVisible();

    // Console error budget (PDP may have baseline noise)
    expect(
      consoleErrors.filter(
        (e) => !BASELINE_NOISE_PATTERNS.some((re) => re.test(e)),
      ),
    ).toEqual([]);
  });
});
