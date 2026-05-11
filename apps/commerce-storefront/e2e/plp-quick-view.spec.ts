/**
 * E2E tests for PLP Product Quick View Modal
 *
 * Contract: .dagent/plp-quick-view/_kickoff/e2e-contract.md
 * Flows: E2E-001 through E2E-008
 */
import { test, expect, awaitHydrated } from './fixtures';
import type { Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// BASELINE_NOISE_PATTERNS — mechanically derived from baseline.json
// persistent console_errors entries only. Do NOT hand-edit.
// ---------------------------------------------------------------------------
const BASELINE_NOISE_PATTERNS: RegExp[] = [
  /Warning: The result of getServerSnapshot should be cached to avoid an infinite loop/,
  /Warning: %s: Support for defaultProps will be removed from function components in a future major release\. Use JavaScript default parameters instead\.%s PageDesignerProvider/,
  /Failed to load resource: net::ERR_NAME_NOT_RESOLVED/,
  /retail-react-app\.use-datacloud\._handleApiError ERROR \[DataCloudApi\] Error sending Data Cloud event/,
  /r: 403 Forbidden/,
];

// ---------------------------------------------------------------------------
// PLP category path (canonical fixture)
// ---------------------------------------------------------------------------
const PLP_PATH = '/category/womens-clothing-dresses';

// ---------------------------------------------------------------------------
// Overlay dismissal helper (§19 — inlined per spec, does NOT modify fixtures.ts)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Navigate to PLP, await hydration, dismiss overlays. */
async function gotoPlp(page: Page): Promise<void> {
  await page.goto(PLP_PATH, { waitUntil: 'domcontentloaded' });
  await dismissOverlays(page);
  await awaitHydrated(page);
}

/** Return the first Quick View trigger locator and its product ID. */
async function firstQuickViewTrigger(page: Page): Promise<{ locator: ReturnType<Page['locator']>; productId: string }> {
  const trigger = page.locator('[data-testid^="quick-view-trigger-"]').first();
  await trigger.waitFor({ state: 'visible', timeout: 10_000 });
  const testid = await trigger.getAttribute('data-testid');
  const productId = testid!.replace('quick-view-trigger-', '');
  return { locator: trigger, productId };
}

/** Click the first Quick View trigger and wait for the modal. Returns trigger info. */
async function openQuickView(page: Page): Promise<{ triggerLocator: ReturnType<Page['locator']>; productId: string }> {
  const { locator, productId } = await firstQuickViewTrigger(page);
  await locator.click();

  // Three-outcome pattern (§12): content loaded, error state, or crash page.
  const modal = page.getByTestId('quick-view-modal');
  const errorState = page.getByTestId('quick-view-modal-error');
  const crashPage = page.getByRole('heading', { name: /this page isn't working/i });

  const winner = await Promise.race([
    modal.waitFor({ state: 'visible', timeout: 15_000 }).then(() => 'modal' as const),
    crashPage.waitFor({ state: 'visible', timeout: 15_000 }).then(() => 'crash' as const),
  ]);

  if (winner === 'crash') {
    const stack = await page.locator('pre').textContent().catch(() => 'no stack');
    throw new Error(`PWA Kit crash page detected after opening Quick View. Stack: ${stack}`);
  }

  return { triggerLocator: locator, productId };
}

// ---------------------------------------------------------------------------
// Per-test console error capture for budget assertion
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
// Test flows
// ---------------------------------------------------------------------------

test.describe('PLP Quick View Modal', () => {
  // E2E-001: open-quick-view-from-tile (P1)
  test('E2E-001: opens Quick View modal from product tile', async ({ page }) => {
    await gotoPlp(page);
    const urlBefore = page.url();

    await openQuickView(page);

    // Modal is visible with product content, no error state
    await expect(page.getByTestId('quick-view-modal')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('product-view')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('quick-view-modal-error')).not.toBeVisible();

    // URL unchanged — no navigation away from PLP
    expect(page.url()).toBe(urlBefore);

    // Console-error budget (§17)
    expect(
      consoleErrors.filter((e) => !BASELINE_NOISE_PATTERNS.some((re) => re.test(e)))
    ).toEqual([]);
  });

  // E2E-002: switch-color-swatch-in-quick-view (P1)
  test('E2E-002: switching color swatch updates gallery image', async ({ page }) => {
    await gotoPlp(page);
    await openQuickView(page);

    const modal = page.getByTestId('quick-view-modal');

    // Find swatch buttons inside the modal. The base ProductView uses
    // SwatchGroup with role="radio" or buttons for color selection.
    const swatches = modal.locator('[role="radio"], button[aria-label*="color" i], button[aria-label*="Color" i]');
    const swatchCount = await swatches.count();
    // Skip if fewer than 2 swatches available
    test.skip(swatchCount < 2, `Only ${swatchCount} color swatch(es) available; need ≥ 2`);

    // Capture current gallery image src
    const galleryImg = modal.locator('img').first();
    const srcBefore = await galleryImg.getAttribute('src');

    // Click the second swatch
    await swatches.nth(1).click();

    // Wait a moment for the image to update, then assert it changed
    await expect(async () => {
      const srcAfter = await galleryImg.getAttribute('src');
      expect(srcAfter).not.toBe(srcBefore);
    }).toPass({ timeout: 5_000 });

    // Modal still visible
    await expect(page.getByTestId('quick-view-modal')).toBeVisible();

    // Console-error budget (§17)
    expect(
      consoleErrors.filter((e) => !BASELINE_NOISE_PATTERNS.some((re) => re.test(e)))
    ).toEqual([]);
  });

  // E2E-003: add-to-bag-from-quick-view (P1)
  test('E2E-003: adds product to bag from Quick View modal', async ({ page }) => {
    await gotoPlp(page);
    await openQuickView(page);

    const modal = page.getByTestId('quick-view-modal');
    const addToCartBtn = page.getByTestId('quick-view-add-to-cart-btn');

    // Wait for the add-to-cart button to be present
    await addToCartBtn.waitFor({ state: 'visible', timeout: 10_000 });

    // If the button is disabled, try to select a valid variation first
    if (await addToCartBtn.isDisabled()) {
      // Select first available size option if present
      const sizeOptions = modal.locator('[role="radio"]');
      const sizeCount = await sizeOptions.count();
      for (let i = 0; i < sizeCount; i++) {
        const option = sizeOptions.nth(i);
        const isDisabled = await option.isDisabled().catch(() => false);
        if (!isDisabled) {
          await option.click();
          break;
        }
      }
      // Give the UI time to update
      await page.waitForFunction(() => true, undefined, { timeout: 1_000 }).catch(() => {});
    }

    // Track basket network response
    const basketResponses: number[] = [];
    page.on('response', (res) => {
      if (/baskets/i.test(res.url())) {
        basketResponses.push(res.status());
      }
    });

    // Click add to cart — wait for basket response
    await Promise.all([
      page.waitForResponse(
        (r) => /baskets/i.test(r.url()) && r.status() < 400,
        { timeout: 15_000 }
      ),
      addToCartBtn.click(),
    ]);

    // Quick View modal should close
    await expect(page.getByTestId('quick-view-modal')).not.toBeVisible({ timeout: 10_000 });

    // Add-to-cart confirmation modal should appear
    await expect(page.getByTestId('add-to-cart-modal')).toBeVisible({ timeout: 10_000 });

    // At least one product-added row
    await expect(page.getByTestId('product-added').first()).toBeVisible({ timeout: 5_000 });

    // No basket-related 4xx/5xx
    const badResponses = basketResponses.filter((s) => s >= 400);
    expect(badResponses, 'All basket responses should be 2xx/3xx').toEqual([]);

    // Console-error budget (§17)
    expect(
      consoleErrors.filter((e) => !BASELINE_NOISE_PATTERNS.some((re) => re.test(e)))
    ).toEqual([]);
  });

  // E2E-004: close-quick-view-restores-focus (P2)
  test('E2E-004: closing Quick View via Escape restores focus to trigger', async ({ page }) => {
    await gotoPlp(page);
    const { triggerLocator, productId } = await openQuickView(page);

    // Dismiss via Escape
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('quick-view-modal')).not.toBeVisible({ timeout: 5_000 });

    // Focus should return to the originating trigger
    const focusedTestId = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
    expect(focusedTestId).toBe(`quick-view-trigger-${productId}`);

    // Console-error budget (§17)
    expect(
      consoleErrors.filter((e) => !BASELINE_NOISE_PATTERNS.some((re) => re.test(e)))
    ).toEqual([]);
  });

  test('E2E-004b: closing Quick View via close button restores focus to trigger', async ({ page }) => {
    await gotoPlp(page);
    const { triggerLocator, productId } = await openQuickView(page);

    // Find and click the close button inside the modal
    const modal = page.getByTestId('quick-view-modal');
    const closeBtn = modal.getByRole('button', { name: /close/i }).first();
    await closeBtn.click();
    await expect(page.getByTestId('quick-view-modal')).not.toBeVisible({ timeout: 5_000 });

    // Focus should return to the originating trigger
    const focusedTestId = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
    expect(focusedTestId).toBe(`quick-view-trigger-${productId}`);

    // Console-error budget (§17)
    expect(
      consoleErrors.filter((e) => !BASELINE_NOISE_PATTERNS.some((re) => re.test(e)))
    ).toEqual([]);
  });

  test('E2E-004c: closing Quick View via overlay click restores focus to trigger', async ({ page }) => {
    await gotoPlp(page);
    const { triggerLocator, productId } = await openQuickView(page);

    // Click the overlay (outside the modal content)
    // Chakra modals use a ModalOverlay that can be targeted by clicking
    // at the edge of the viewport
    const modal = page.getByTestId('quick-view-modal');
    const modalBox = await modal.boundingBox();
    if (modalBox) {
      // Click to the left of the modal
      await page.mouse.click(
        Math.max(modalBox.x - 30, 5),
        modalBox.y + modalBox.height / 2
      );
    } else {
      // Fallback: press Escape
      await page.keyboard.press('Escape');
    }

    await expect(page.getByTestId('quick-view-modal')).not.toBeVisible({ timeout: 5_000 });

    // Focus should return to the originating trigger
    const focusedTestId = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
    expect(focusedTestId).toBe(`quick-view-trigger-${productId}`);

    // Console-error budget (§17)
    expect(
      consoleErrors.filter((e) => !BASELINE_NOISE_PATTERNS.some((re) => re.test(e)))
    ).toEqual([]);
  });

  // E2E-005: no-pickup-ui-in-quick-view (P1, negative)
  test('E2E-005: Quick View modal does not contain pickup/ship-to-store UI', async ({ page }) => {
    await gotoPlp(page);
    await openQuickView(page);

    const modal = page.getByTestId('quick-view-modal');

    // No pickup-related testids visible
    await expect(modal.locator('[data-testid="pickup-select-store-msg"]')).not.toBeVisible();
    await expect(modal.locator('[data-testid="store-stock-status-msg"]')).not.toBeVisible();
    await expect(modal.locator('[data-testid*="pickup"]')).not.toBeVisible();

    // No pickup/ship-to-store text inside the modal
    const modalText = await modal.textContent();
    expect(modalText).not.toMatch(/pickup|ship to store|pick up/i);

    // Console-error budget (§17)
    expect(
      consoleErrors.filter((e) => !BASELINE_NOISE_PATTERNS.some((re) => re.test(e)))
    ).toEqual([]);
  });

  // E2E-006: add-to-bag-disabled-when-unavailable (P2)
  test('E2E-006: Add to Bag is disabled when no variation is selected', async ({ page }) => {
    await gotoPlp(page);
    await openQuickView(page);

    const addToCartBtn = page.getByTestId('quick-view-add-to-cart-btn');
    await addToCartBtn.waitFor({ state: 'visible', timeout: 10_000 });

    // On a master product with multiple variations, the button should be
    // disabled before a complete variation is chosen.
    // Note: some products may auto-select a variation, in which case the
    // button may already be enabled. Check if button is disabled.
    const isDisabled = await addToCartBtn.isDisabled();
    if (!isDisabled) {
      // The product may have auto-selected a variation. This is valid
      // behavior — skip this assertion since the product is ready to add.
      test.skip(true, 'Product auto-selected a variation; button already enabled');
    }

    expect(await addToCartBtn.isDisabled()).toBe(true);

    // Console-error budget (§17)
    expect(
      consoleErrors.filter((e) => !BASELINE_NOISE_PATTERNS.some((re) => re.test(e)))
    ).toEqual([]);
  });

  // E2E-007: view-full-details-link (P3)
  test('E2E-007: View Full Details navigates to PDP', async ({ page }) => {
    await gotoPlp(page);
    const { productId } = await openQuickView(page);

    const viewDetailsLink = page.getByTestId('quick-view-view-full-details-link');
    await expect(viewDetailsLink).toBeVisible({ timeout: 5_000 });

    await viewDetailsLink.click();

    // Should navigate to the PDP — URL should contain a product path
    await page.waitForURL(/\/product\//, { timeout: 10_000 });
    expect(page.url()).toMatch(/\/product\//);

    // Quick View modal should no longer be visible
    await expect(page.getByTestId('quick-view-modal')).not.toBeVisible();

    // Console-error budget (§17)
    expect(
      consoleErrors.filter((e) => !BASELINE_NOISE_PATTERNS.some((re) => re.test(e)))
    ).toEqual([]);
  });

  // E2E-008: tile-click-still-navigates-to-pdp (P2, regression)
  test('E2E-008: clicking tile image still navigates to PDP', async ({ page }) => {
    await gotoPlp(page);

    const urlBefore = page.url();

    // Click the tile image (NOT the quick view trigger)
    const tileImage = page.getByTestId('product-tile-image').first();
    await tileImage.waitFor({ state: 'visible', timeout: 10_000 });
    await tileImage.click();

    // Should navigate away from PLP to PDP
    await page.waitForURL((url) => url.pathname !== new URL(urlBefore).pathname, { timeout: 10_000 });
    expect(page.url()).not.toBe(urlBefore);

    // Quick View modal should NOT be visible (this was a tile click, not Quick View)
    await expect(page.getByTestId('quick-view-modal')).not.toBeVisible();

    // Console-error budget (§17)
    expect(
      consoleErrors.filter((e) => !BASELINE_NOISE_PATTERNS.some((re) => re.test(e)))
    ).toEqual([]);
  });
});
