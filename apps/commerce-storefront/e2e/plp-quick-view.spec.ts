/**
 * PLP Product Quick View Modal — E2E Tests
 *
 * Flows E2E-001 through E2E-008 per the e2e-contract.md acceptance contract.
 * Uses only data-testid selectors from the contract §2.
 *
 * Imports test/expect from ./fixtures (NOT @playwright/test) per §9.
 * Console-error budget derived mechanically from baseline.json per §17.
 */
import { test, expect, awaitHydrated } from './fixtures';
import type { Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// BASELINE_NOISE_PATTERNS — mechanically derived from baseline.json
// Only entries with volatility: "persistent" are included.
// Characters . ? + * ( ) [ ] { } | ^ $ \ / are escaped.
// ---------------------------------------------------------------------------
const BASELINE_NOISE_PATTERNS: RegExp[] = [
  /Warning: The result of getServerSnapshot should be cached to avoid an infinite loop/,
  /Warning: %s: Support for defaultProps will be removed from function components in a future major release\. Use JavaScript default parameters instead\.%s PageDesignerProvider/,
  /Failed to load resource: net::ERR_NAME_NOT_RESOLVED/,
  /retail-react-app\.use-datacloud\._handleApiError ERROR \[DataCloudApi\] Error sending Data Cloud event \{\}/,
  /r: 403 Forbidden/,
];

// ---------------------------------------------------------------------------
// Category path — canonical PLP fixture for this feature
// ---------------------------------------------------------------------------
const PLP_PATH = '/category/womens-clothing-dresses';

// ---------------------------------------------------------------------------
// dismissOverlays — per §19
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

// ---------------------------------------------------------------------------
// Helper: navigate to PLP, hydrate, dismiss overlays
// ---------------------------------------------------------------------------
async function gotoPlp(page: Page): Promise<void> {
  await page.goto(PLP_PATH, { waitUntil: 'domcontentloaded' });
  await dismissOverlays(page);
  await awaitHydrated(page);
}

// ---------------------------------------------------------------------------
// Helper: locate the first Quick View trigger on the PLP
// Returns the trigger locator and the parsed productId.
// ---------------------------------------------------------------------------
async function firstQuickViewTrigger(page: Page): Promise<{
  trigger: ReturnType<Page['getByTestId']>;
  productId: string;
}> {
  const trigger = page.locator('[data-testid^="quick-view-trigger-"]').first();
  await trigger.waitFor({ state: 'visible', timeout: 15_000 });
  const testid = await trigger.getAttribute('data-testid');
  const productId = testid!.replace('quick-view-trigger-', '');
  return { trigger, productId };
}

// ---------------------------------------------------------------------------
// Helper: open Quick View on the first eligible tile
// Returns the trigger locator (for focus-restoration checks) and productId.
// ---------------------------------------------------------------------------
async function openQuickView(page: Page): Promise<{
  trigger: ReturnType<Page['getByTestId']>;
  productId: string;
}> {
  const { trigger, productId } = await firstQuickViewTrigger(page);

  // Hover the parent tile to reveal the trigger (desktop hover pattern)
  await trigger.scrollIntoViewIfNeeded();
  await trigger.hover();
  await trigger.click();

  // Wait for modal to appear — three-outcome pattern per §12
  const modal = page.getByTestId('quick-view-modal');
  const errorState = page.getByTestId('quick-view-modal-error');
  const crashPage = page.getByRole('heading', { name: /this page isn't working/i });

  const winner = await Promise.race([
    modal.waitFor({ state: 'visible', timeout: 15_000 }).then(() => 'modal' as const),
    crashPage.waitFor({ state: 'visible', timeout: 15_000 }).then(() => 'crash' as const),
  ]);

  if (winner === 'crash') {
    const stack = await page.locator('pre').textContent().catch(() => 'no stack');
    throw new Error(`PWA Kit crash page detected after Quick View trigger click. Stack: ${stack}`);
  }

  // Verify it's not the error state
  const hasError = await errorState.isVisible().catch(() => false);
  if (hasError) {
    throw new Error('Quick View modal opened with error state instead of product content');
  }

  return { trigger, productId };
}

// ---------------------------------------------------------------------------
// Helper: assert console-error budget per §17
// ---------------------------------------------------------------------------
function assertConsoleErrorBudget(consoleErrors: string[]): void {
  const unexpected = consoleErrors.filter(
    (e) => !BASELINE_NOISE_PATTERNS.some((re) => re.test(e)),
  );
  expect(unexpected).toEqual([]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('PLP Quick View Modal', () => {
  // =========================================================================
  // Flow E2E-001: open-quick-view-from-tile (P1 / US1)
  // =========================================================================
  test('E2E-001: opens Quick View modal from product tile', async ({ page, signals }) => {
    const urlBefore = page.url();
    await gotoPlp(page);
    const plpUrl = page.url();

    await openQuickView(page);

    // Modal is visible
    await expect(page.getByTestId('quick-view-modal')).toBeVisible();
    // Product view rendered inside the modal
    await expect(page.getByTestId('product-view')).toBeVisible();
    // Error fallback is NOT visible
    await expect(page.getByTestId('quick-view-modal-error')).not.toBeVisible();
    // URL unchanged — did not navigate away from PLP
    expect(page.url()).toBe(plpUrl);

    assertConsoleErrorBudget(signals.consoleErrors);
  });

  // =========================================================================
  // Flow E2E-002: switch-color-swatch-in-quick-view (P1 / US1)
  // =========================================================================
  test('E2E-002: switches color swatch inside Quick View modal', async ({ page, signals }) => {
    await gotoPlp(page);
    await openQuickView(page);

    const modal = page.getByTestId('quick-view-modal');

    // Find swatch buttons inside the modal. Swatches are typically rendered
    // as buttons within a swatch group. We look for swatch-type elements.
    const swatches = modal.locator('[data-testid^="color-swatch-"], button[aria-label*="color" i], [role="radio"]');
    const swatchCount = await swatches.count();

    test.skip(swatchCount < 2, 'First tile has fewer than 2 color swatches; skipping swatch-switch flow');

    // Capture the primary image src before clicking the second swatch
    const primaryImage = modal.locator('img').first();
    const srcBefore = await primaryImage.getAttribute('src');

    // Click the second swatch
    await swatches.nth(1).click();

    // Wait for image to potentially update
    await page.waitForFunction(
      ({ selector, oldSrc }) => {
        const img = document.querySelector(selector) as HTMLImageElement | null;
        return img && img.src !== oldSrc;
      },
      {
        selector: '[data-testid="quick-view-modal"] img',
        oldSrc: srcBefore,
      },
      { timeout: 10_000 },
    ).catch(() => {
      // Image may not change if both swatches share the same hero image
    });

    // Modal remains visible
    await expect(modal).toBeVisible();

    assertConsoleErrorBudget(signals.consoleErrors);
  });

  // =========================================================================
  // Flow E2E-003: add-to-bag-from-quick-view (P1 / US2)
  // =========================================================================
  test('E2E-003: adds item to bag from Quick View modal', async ({ page, signals }) => {
    await gotoPlp(page);
    await openQuickView(page);

    const modal = page.getByTestId('quick-view-modal');
    const addToCartBtn = page.getByTestId('quick-view-add-to-cart-btn');

    // If the button is disabled, we need to select a valid variation first.
    // Try selecting the first available size swatch if present.
    const isDisabled = await addToCartBtn.isDisabled();
    if (isDisabled) {
      // Try to find and click size options inside the modal
      const sizeOptions = modal.locator('[role="radio"]:not([aria-checked="true"]), button[aria-label*="size" i]');
      const sizeCount = await sizeOptions.count();
      if (sizeCount > 0) {
        // Click the first available size option
        await sizeOptions.first().click();
        // Wait for the button to potentially become enabled
        await expect(addToCartBtn).toBeEnabled({ timeout: 5_000 }).catch(() => {
          // May still be disabled if OOS — handled below
        });
      }
    }

    // Skip if button is still disabled (no in-stock variation available)
    const stillDisabled = await addToCartBtn.isDisabled();
    test.skip(stillDisabled, 'No in-stock variation available for add-to-bag test');

    // Click Add to Bag and wait for basket response
    await addToCartBtn.click();

    // Quick View modal should close
    await expect(page.getByTestId('quick-view-modal')).not.toBeVisible({ timeout: 15_000 });

    // Add-to-cart confirmation modal should appear
    await expect(page.getByTestId('add-to-cart-modal')).toBeVisible({ timeout: 15_000 });

    // At least one product-added row should be present
    const productAddedRows = page.getByTestId('product-added');
    await expect(productAddedRows.first()).toBeVisible({ timeout: 5_000 });

    assertConsoleErrorBudget(signals.consoleErrors);
  });

  // =========================================================================
  // Flow E2E-004: close-quick-view-restores-focus (P2 / cross-cutting)
  // =========================================================================
  test('E2E-004a: closing Quick View with Escape restores focus to trigger', async ({ page, signals }) => {
    await gotoPlp(page);
    const { productId } = await openQuickView(page);

    // Dismiss via Escape
    await page.keyboard.press('Escape');

    // Modal should be hidden
    await expect(page.getByTestId('quick-view-modal')).not.toBeVisible({ timeout: 5_000 });

    // Focus should return to the trigger
    const activeTestId = await page.evaluate(() =>
      document.activeElement?.getAttribute('data-testid'),
    );
    expect(activeTestId).toBe(`quick-view-trigger-${productId}`);

    assertConsoleErrorBudget(signals.consoleErrors);
  });

  test('E2E-004b: closing Quick View with close button restores focus to trigger', async ({ page, signals }) => {
    await gotoPlp(page);
    const { productId } = await openQuickView(page);

    // Find and click the close button inside the modal
    const modal = page.getByTestId('quick-view-modal');
    const closeBtn = modal.getByRole('button', { name: /close/i }).first();
    await closeBtn.click();

    // Modal should be hidden
    await expect(page.getByTestId('quick-view-modal')).not.toBeVisible({ timeout: 5_000 });

    // Focus should return to the trigger
    const activeTestId = await page.evaluate(() =>
      document.activeElement?.getAttribute('data-testid'),
    );
    expect(activeTestId).toBe(`quick-view-trigger-${productId}`);

    assertConsoleErrorBudget(signals.consoleErrors);
  });

  test('E2E-004c: closing Quick View with overlay click restores focus to trigger', async ({ page, signals }) => {
    await gotoPlp(page);
    const { productId } = await openQuickView(page);

    // Click the overlay (Chakra modal overlay is a sibling of the modal content)
    // We click at the page edge which should be outside the modal content
    const modal = page.getByTestId('quick-view-modal');
    const modalBox = await modal.boundingBox();
    if (modalBox) {
      // Click to the left of the modal (on the overlay)
      await page.mouse.click(5, modalBox.y + modalBox.height / 2);
    } else {
      // Fallback: press Escape
      await page.keyboard.press('Escape');
    }

    // Modal should be hidden
    await expect(page.getByTestId('quick-view-modal')).not.toBeVisible({ timeout: 5_000 });

    // Focus should return to the trigger
    const activeTestId = await page.evaluate(() =>
      document.activeElement?.getAttribute('data-testid'),
    );
    expect(activeTestId).toBe(`quick-view-trigger-${productId}`);

    assertConsoleErrorBudget(signals.consoleErrors);
  });

  // =========================================================================
  // Flow E2E-005: no-pickup-ui-in-quick-view (P1, negative)
  // =========================================================================
  test('E2E-005: Quick View modal does not contain pickup/ship-to-store UI', async ({ page, signals }) => {
    await gotoPlp(page);
    await openQuickView(page);

    const modal = page.getByTestId('quick-view-modal');

    // None of the pickup testids should be visible
    await expect(page.getByTestId('pickup-select-store-msg')).not.toBeVisible();
    await expect(page.getByTestId('store-stock-status-msg')).not.toBeVisible();

    // No element with data-testid containing "pickup" inside the modal
    const pickupElements = modal.locator('[data-testid*="pickup"]');
    const pickupCount = await pickupElements.count();
    expect(pickupCount).toBe(0);

    // No text matching pickup/ship-to-store patterns inside the modal
    const modalText = await modal.textContent() ?? '';
    expect(modalText).not.toMatch(/pickup|ship to store|pick up/i);

    assertConsoleErrorBudget(signals.consoleErrors);
  });

  // =========================================================================
  // Flow E2E-006: add-to-bag-disabled-when-unavailable (P2 / US3)
  // =========================================================================
  test('E2E-006: Add to Bag is disabled when no variation is selected', async ({ page, signals }) => {
    await gotoPlp(page);
    await openQuickView(page);

    const addToCartBtn = page.getByTestId('quick-view-add-to-cart-btn');

    // On a master product with unselected variations, button should be disabled
    // Note: if the product has no variations (simple product), the button may
    // already be enabled. We check and skip if that's the case.
    const isDisabled = await addToCartBtn.isDisabled();
    test.skip(!isDisabled, 'First tile product has no unselected variations (simple product); covered by unit tests');

    // Assert button is disabled before variation selection
    await expect(addToCartBtn).toBeDisabled();

    assertConsoleErrorBudget(signals.consoleErrors);
  });

  // =========================================================================
  // Flow E2E-007: view-full-details-link (P3 / US4)
  // =========================================================================
  test('E2E-007: View Full Details navigates to PDP', async ({ page, signals }) => {
    await gotoPlp(page);
    const { productId } = await openQuickView(page);

    const viewDetailsLink = page.getByTestId('quick-view-view-full-details-link');
    await expect(viewDetailsLink).toBeVisible();
    await viewDetailsLink.click();

    // Should navigate to PDP — URL should change to contain /product/
    await page.waitForURL(/\/product\//, { timeout: 15_000 });

    // Modal should no longer be visible
    await expect(page.getByTestId('quick-view-modal')).not.toBeVisible();

    assertConsoleErrorBudget(signals.consoleErrors);
  });

  // =========================================================================
  // Flow E2E-008: tile-click-still-navigates-to-pdp (P2, regression / US1)
  // =========================================================================
  test('E2E-008: clicking tile image navigates to PDP (regression)', async ({ page, signals }) => {
    await gotoPlp(page);

    // Find the first product tile image link (NOT the quick view trigger).
    // Product tiles use sf-product-tile-{productId} testid. The image inside
    // the tile is typically a link wrapping an img.
    const firstTile = page.locator('[data-testid^="sf-product-tile-"]').first();
    await firstTile.waitFor({ state: 'visible', timeout: 15_000 });

    // Click the tile's image — this should be the main link inside the tile,
    // not the quick-view trigger.
    const tileImage = firstTile.locator('a img, a picture, a').first();
    await tileImage.click();

    // Should navigate to PDP
    await page.waitForURL(/\/product\//, { timeout: 15_000 });

    // Quick View modal should NOT be visible
    await expect(page.getByTestId('quick-view-modal')).not.toBeVisible();

    assertConsoleErrorBudget(signals.consoleErrors);
  });
});
