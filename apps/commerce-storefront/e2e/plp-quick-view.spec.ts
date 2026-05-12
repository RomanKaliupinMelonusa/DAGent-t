/**
 * PLP Quick View Modal — E2E Tests
 *
 * Contract: apps/commerce-storefront/.dagent/plp-quick-view/_kickoff/e2e-contract.md
 * Flows: E2E-001 through E2E-008
 *
 * Imports test/expect from ./fixtures (auto-use signals fixture) per §9.
 * Every test calls dismissOverlays + awaitHydrated before first interaction per §19/§22.
 * Console-error budget asserted in every test per §17.
 */

import { test, expect, awaitHydrated } from './fixtures';
import type { Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// BASELINE_NOISE_PATTERNS — mechanically derived from inputs/baseline.json
// Each entry corresponds to a console_errors[] entry with volatility: "persistent".
// Patterns are escaped literal substrings, NOT compiled regexes.
// ---------------------------------------------------------------------------
const BASELINE_NOISE_PATTERNS: RegExp[] = [
  /Warning: The result of getServerSnapshot should be cached to avoid an infinite loop/,
  /Warning: %s: Support for defaultProps will be removed from function components in a future major release\. Use JavaScript default parameters instead\.%s PageDesignerProvider/,
  /Failed to load resource: net::ERR_NAME_NOT_RESOLVED/,
  /retail-react-app\.use-datacloud\._handleApiError ERROR \[DataCloudApi\] Error sending Data Cloud event/,
  /Failed to load resource: the server responded with a status of 403 \(Forbidden\)/,
  /r: 403 Forbidden/,
];

// ---------------------------------------------------------------------------
// Category path used across all flows
// ---------------------------------------------------------------------------
const PLP_PATH = '/category/womens-clothing-dresses';

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

/**
 * Navigate to the PLP, dismiss overlays, and await hydration.
 */
async function gotoPlp(page: Page): Promise<void> {
  await page.goto(PLP_PATH, { waitUntil: 'domcontentloaded' });
  await dismissOverlays(page);
  await awaitHydrated(page);
}

/**
 * Return the first quick-view trigger on the PLP and its product ID.
 */
async function firstQuickViewTrigger(page: Page): Promise<{ locator: ReturnType<Page['locator']>; productId: string }> {
  const trigger = page.locator('[data-testid^="quick-view-trigger-"]').first();
  await trigger.waitFor({ state: 'visible', timeout: 10_000 });
  const testid = await trigger.getAttribute('data-testid');
  const productId = testid!.replace('quick-view-trigger-', '');
  return { locator: trigger, productId };
}

/**
 * Open Quick View on the first product tile. Returns the trigger locator
 * and product ID for focus-restoration assertions.
 */
async function openQuickView(page: Page): Promise<{ triggerLocator: ReturnType<Page['locator']>; productId: string }> {
  const { locator: triggerLocator, productId } = await firstQuickViewTrigger(page);
  await triggerLocator.click();

  // Three-outcome diagnostic pattern (§12)
  const modal = page.getByTestId('quick-view-modal');
  const errorState = page.getByTestId('quick-view-modal-error');
  const crashPage = page.getByRole('heading', { name: /this page isn't working/i });

  const winner = await Promise.race([
    modal.waitFor({ state: 'visible', timeout: 15_000 }).then(() => 'modal' as const),
    crashPage.waitFor({ state: 'visible', timeout: 15_000 }).then(() => 'crash' as const),
  ]);

  if (winner === 'crash') {
    const stack = await page.locator('pre').textContent().catch(() => 'no stack');
    throw new Error(`PWA Kit crash page detected after clicking quick-view trigger. Stack: ${stack}`);
  }

  return { triggerLocator, productId };
}

/**
 * Assert console-error budget: all console errors that are NOT baseline
 * noise must be empty.
 */
function assertConsoleErrorBudget(consoleErrors: string[]): void {
  const novel = consoleErrors.filter(
    (e) => !BASELINE_NOISE_PATTERNS.some((re) => re.test(e)),
  );
  expect(novel).toEqual([]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('PLP Quick View Modal', () => {
  // Per-test console error collection for budget assertions.
  // The auto-use `signals` fixture handles triage attachments on failure;
  // this local collection drives the §17 budget assertion.
  let consoleErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        consoleErrors.push(msg.text());
      }
    });
  });

  // -----------------------------------------------------------------------
  // E2E-001: open-quick-view-from-tile (P1, US1)
  // -----------------------------------------------------------------------
  test('E2E-001: opens Quick View modal from product tile', async ({ page }) => {
    await gotoPlp(page);
    const urlBefore = page.url();

    await openQuickView(page);

    // Modal is visible with product content, no error state
    await expect(page.getByTestId('quick-view-modal')).toBeVisible();
    await expect(page.getByTestId('product-view')).toBeVisible();
    await expect(page.getByTestId('quick-view-modal-error')).not.toBeVisible();

    // URL unchanged — trigger did NOT navigate away from PLP
    expect(page.url()).toBe(urlBefore);

    assertConsoleErrorBudget(consoleErrors);
  });

  // -----------------------------------------------------------------------
  // E2E-002: switch-color-swatch-in-quick-view (P1, US1)
  // -----------------------------------------------------------------------
  test('E2E-002: switches color swatch inside Quick View modal', async ({ page }) => {
    await gotoPlp(page);
    await openQuickView(page);

    const modal = page.getByTestId('quick-view-modal');

    // Look for a color swatch group inside the modal.
    // PWA Kit renders swatches as radio buttons inside a fieldset/radiogroup.
    // Color swatches are in a group labelled "Color" (or similar).
    const colorGroup = modal.getByRole('radiogroup', { name: /color/i });
    const hasColorGroup = await colorGroup.isVisible().catch(() => false);

    test.skip(!hasColorGroup, 'No color swatch group visible on the opened product — skipping');

    const colorSwatches = colorGroup.getByRole('radio');
    const swatchCount = await colorSwatches.count();

    test.skip(swatchCount < 2, 'Only one color swatch available — need at least 2 to switch');

    // Capture the current gallery image src
    const galleryImg = modal.locator('img').first();
    const srcBefore = await galleryImg.getAttribute('src');

    // Click the second color swatch
    await colorSwatches.nth(1).click();

    // Wait for the image to update (src should differ)
    await expect(async () => {
      const srcAfter = await galleryImg.getAttribute('src');
      expect(srcAfter).not.toBe(srcBefore);
    }).toPass({ timeout: 5_000 });

    // Modal still visible
    await expect(page.getByTestId('quick-view-modal')).toBeVisible();

    assertConsoleErrorBudget(consoleErrors);
  });

  // -----------------------------------------------------------------------
  // E2E-003: add-to-bag-from-quick-view (P1, US2)
  // -----------------------------------------------------------------------
  test('E2E-003: adds item to bag from Quick View modal', async ({ page }) => {
    await gotoPlp(page);
    await openQuickView(page);

    const modal = page.getByTestId('quick-view-modal');
    const addToCartBtn = page.getByTestId('quick-view-add-to-cart-btn');

    // Select first available size if size swatches are present
    const sizeGroup = modal.getByRole('radiogroup', { name: /size/i });
    const hasSizeGroup = await sizeGroup.isVisible().catch(() => false);
    if (hasSizeGroup) {
      const sizeSwatches = sizeGroup.getByRole('radio');
      const sizeCount = await sizeSwatches.count();
      // Click the first available size
      for (let i = 0; i < sizeCount; i++) {
        const swatch = sizeSwatches.nth(i);
        const isDisabled = await swatch.isDisabled().catch(() => true);
        if (!isDisabled) {
          await swatch.click();
          break;
        }
      }
    }

    // Select first available color if color swatches are present and none selected
    const colorGroup = modal.getByRole('radiogroup', { name: /color/i });
    const hasColorGroup = await colorGroup.isVisible().catch(() => false);
    if (hasColorGroup) {
      const colorSwatches = colorGroup.getByRole('radio');
      const colorCount = await colorSwatches.count();
      for (let i = 0; i < colorCount; i++) {
        const swatch = colorSwatches.nth(i);
        const isDisabled = await swatch.isDisabled().catch(() => true);
        if (!isDisabled) {
          await swatch.click();
          break;
        }
      }
    }

    // Wait for add-to-cart button to be enabled
    await expect(addToCartBtn).toBeEnabled({ timeout: 10_000 });

    // Track basket network responses
    const basketErrors: string[] = [];
    page.on('response', (res) => {
      if (/baskets/i.test(res.url()) && res.status() >= 400) {
        basketErrors.push(`${res.request().method()} ${res.url()} -> ${res.status()}`);
      }
    });

    // Click Add to Cart
    await addToCartBtn.click();

    // Quick View modal should close
    await expect(page.getByTestId('quick-view-modal')).not.toBeVisible({ timeout: 15_000 });

    // Add-to-cart confirmation modal should appear
    await expect(page.getByTestId('add-to-cart-modal')).toBeVisible({ timeout: 15_000 });

    // At least one product-added row
    const addedRows = page.getByTestId('product-added');
    await expect(addedRows.first()).toBeVisible();

    // No basket-related 4xx/5xx
    expect(basketErrors).toEqual([]);

    assertConsoleErrorBudget(consoleErrors);
  });

  // -----------------------------------------------------------------------
  // E2E-004: close-quick-view-restores-focus (P2)
  // -----------------------------------------------------------------------
  test('E2E-004: closing Quick View restores focus to trigger (Escape)', async ({ page }) => {
    await gotoPlp(page);
    const { productId } = await openQuickView(page);

    // Dismiss via Escape
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('quick-view-modal')).not.toBeVisible({ timeout: 5_000 });

    // Focus should return to the originating trigger
    const activeTestId = await page.evaluate(() =>
      document.activeElement?.getAttribute('data-testid'),
    );
    expect(activeTestId).toBe(`quick-view-trigger-${productId}`);

    assertConsoleErrorBudget(consoleErrors);
  });

  test('E2E-004: closing Quick View restores focus to trigger (close button)', async ({ page }) => {
    await gotoPlp(page);
    const { productId } = await openQuickView(page);

    // Dismiss via close button — Chakra modals render a close button
    const modal = page.getByTestId('quick-view-modal');
    const closeBtn = modal.getByRole('button', { name: /close/i }).first();
    await closeBtn.click();
    await expect(page.getByTestId('quick-view-modal')).not.toBeVisible({ timeout: 5_000 });

    const activeTestId = await page.evaluate(() =>
      document.activeElement?.getAttribute('data-testid'),
    );
    expect(activeTestId).toBe(`quick-view-trigger-${productId}`);

    assertConsoleErrorBudget(consoleErrors);
  });

  test('E2E-004: closing Quick View restores focus to trigger (overlay click)', async ({ page }) => {
    await gotoPlp(page);
    const { productId } = await openQuickView(page);

    // Dismiss via overlay click — Chakra modal overlay
    // Click at the edge of the viewport (outside the modal dialog)
    const modal = page.getByTestId('quick-view-modal');
    const box = await modal.boundingBox();
    if (box) {
      // Click to the left of the modal (on the overlay)
      await page.mouse.click(Math.max(box.x - 20, 5), box.y + box.height / 2);
    } else {
      // Fallback: press Escape
      await page.keyboard.press('Escape');
    }
    await expect(page.getByTestId('quick-view-modal')).not.toBeVisible({ timeout: 5_000 });

    const activeTestId = await page.evaluate(() =>
      document.activeElement?.getAttribute('data-testid'),
    );
    expect(activeTestId).toBe(`quick-view-trigger-${productId}`);

    assertConsoleErrorBudget(consoleErrors);
  });

  // -----------------------------------------------------------------------
  // E2E-005: no-pickup-ui-in-quick-view (P1, negative)
  // -----------------------------------------------------------------------
  test('E2E-005: Quick View modal does not contain pickup/ship-to-store UI', async ({ page }) => {
    await gotoPlp(page);
    await openQuickView(page);

    const modal = page.getByTestId('quick-view-modal');

    // Assert none of the pickup testids are visible
    await expect(modal.locator('[data-testid="pickup-select-store-msg"]')).not.toBeVisible();
    await expect(modal.locator('[data-testid="store-stock-status-msg"]')).not.toBeVisible();
    await expect(modal.locator('[data-testid*="pickup"]')).not.toBeVisible();

    // Assert no text matching pickup/ship-to-store patterns inside the modal
    const modalText = await modal.textContent();
    expect(modalText).not.toMatch(/pickup|ship to store|pick up/i);

    assertConsoleErrorBudget(consoleErrors);
  });

  // -----------------------------------------------------------------------
  // E2E-006: add-to-bag-disabled-when-unavailable (P2, US3)
  // -----------------------------------------------------------------------
  test('E2E-006: Add to Bag is disabled when variation is incomplete', async ({ page }) => {
    await gotoPlp(page);
    await openQuickView(page);

    const modal = page.getByTestId('quick-view-modal');
    const addToCartBtn = page.getByTestId('quick-view-add-to-cart-btn');

    // Check if the product has size options (master product needing selection)
    const sizeGroup = modal.getByRole('radiogroup', { name: /size/i });
    const hasSizeGroup = await sizeGroup.isVisible().catch(() => false);

    // If no size group, the product may auto-select its only variant;
    // skip this test as the disabled-state scenario requires a master product.
    test.skip(!hasSizeGroup, 'Product has no size options — cannot test incomplete variation; covered by unit tests');

    // Before selecting size, button should be disabled
    await expect(addToCartBtn).toBeDisabled({ timeout: 5_000 });

    // Attempt to discover an OOS variation
    const sizeSwatches = sizeGroup.getByRole('radio');
    const sizeCount = await sizeSwatches.count();
    let foundOos = false;
    for (let i = 0; i < sizeCount; i++) {
      const swatch = sizeSwatches.nth(i);
      const isDisabled = await swatch.isDisabled().catch(() => false);
      if (isDisabled) {
        // This swatch is disabled — likely OOS. Try to force-click it
        // (Playwright allows clicking disabled elements via force).
        await swatch.click({ force: true }).catch(() => {});
        const inventoryMsg = modal.getByTestId('inventory-message');
        const hasInventoryMsg = await inventoryMsg.isVisible({ timeout: 2_000 }).catch(() => false);
        if (hasInventoryMsg) {
          await expect(addToCartBtn).toBeDisabled();
          await expect(inventoryMsg).toBeVisible();
          foundOos = true;
          break;
        }
      }
    }

    if (!foundOos) {
      // No OOS variation discoverable — the disabled-before-selection assertion
      // already passed above, skip the OOS sub-assertion
      test.info().annotations.push({
        type: 'info',
        description: 'No OOS variant discoverable; OOS path covered by unit tests',
      });
    }

    assertConsoleErrorBudget(consoleErrors);
  });

  // -----------------------------------------------------------------------
  // E2E-007: view-full-details-link (P3, US4)
  // -----------------------------------------------------------------------
  test('E2E-007: View Full Details navigates to PDP', async ({ page }) => {
    await gotoPlp(page);
    const { productId } = await openQuickView(page);

    const link = page.getByTestId('quick-view-view-full-details-link');
    await expect(link).toBeVisible();

    await link.click();

    // URL should change to a PDP pattern
    await page.waitForURL(/\/product\//, { timeout: 15_000 });
    expect(page.url()).toContain('/product/');

    // Modal should no longer be visible
    await expect(page.getByTestId('quick-view-modal')).not.toBeVisible();

    assertConsoleErrorBudget(consoleErrors);
  });

  // -----------------------------------------------------------------------
  // E2E-008: tile-click-still-navigates-to-pdp (P2, US1 regression)
  // -----------------------------------------------------------------------
  test('E2E-008: clicking tile image navigates to PDP (regression)', async ({ page }) => {
    await gotoPlp(page);

    // Click the first tile's image (NOT the quick-view trigger)
    const tileImage = page.getByTestId('product-tile-image').first();
    await tileImage.waitFor({ state: 'visible', timeout: 10_000 });

    await tileImage.click();

    // URL should change to PDP
    await page.waitForURL(/\/product\//, { timeout: 15_000 });
    expect(page.url()).toContain('/product/');

    // Quick View modal should NOT be visible
    await expect(page.getByTestId('quick-view-modal')).not.toBeVisible();

    assertConsoleErrorBudget(consoleErrors);
  });
});
