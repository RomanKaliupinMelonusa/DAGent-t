/**
 * PLP Quick View Modal — E2E Tests
 *
 * Contract: .dagent/plp-quick-view/_kickoff/e2e-contract.md
 * Flows: E2E-001 through E2E-008
 *
 * Imports test/expect from ./fixtures (auto-use signals fixture).
 * Uses only contracted data-testid selectors — no CSS/XPath selectors.
 */

import { test, expect, awaitHydrated } from './fixtures';
import type { Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// BASELINE_NOISE_PATTERNS — mechanically derived from inputs/baseline.json
// Every persistent console_errors entry → escaped regex literal.
// ---------------------------------------------------------------------------

const BASELINE_NOISE_PATTERNS: RegExp[] = [
  /Warning: The result of getServerSnapshot should be cached to avoid an infinite loop/,
  /Support for defaultProps will be removed from function components in a future major release\. Use JavaScript default parameters instead/,
  /Failed to load resource: net::ERR_NAME_NOT_RESOLVED/,
  /retail-react-app\.use-datacloud\._handleApiError ERROR \[DataCloudApi\] Error sending Data Cloud event/,
  /Failed to load resource: the server responded with a status of 403 \(Forbidden\)/,
  /r: 403 Forbidden/,
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Dismiss any Chakra-portal-mounted dialog (consent, locale, onboarding)
 * that intercepts pointer events on PLP/PDP/cart roots. PWA-Kit-generic;
 * idempotent; never throws; bounded total wall time (~1.5s worst case,
 * <50 ms when no overlay is present). Uses only `@playwright/test`
 * primitives — no `waitForTimeout`, no `networkidle`.
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

/** PLP category path used across all tests. */
const PLP_PATH = '/category/womens-clothing-dresses';

/**
 * Navigate to the PLP, dismiss overlays, then await hydration.
 * Every test MUST call this before any interaction.
 */
async function gotoPlp(page: Page): Promise<void> {
  await page.goto(PLP_PATH, { waitUntil: 'domcontentloaded' });
  await dismissOverlays(page);
  await awaitHydrated(page);
}

/**
 * Returns the first Quick View trigger on the PLP and its parsed productId.
 */
async function firstQuickViewTrigger(page: Page) {
  const trigger = page.getByTestId(/^quick-view-trigger-/).first();
  await trigger.waitFor({ state: 'visible', timeout: 10_000 });
  const testid = await trigger.getAttribute('data-testid');
  const productId = testid!.replace('quick-view-trigger-', '');
  return { trigger, productId };
}

/**
 * Opens Quick View by clicking the first trigger. Returns trigger locator
 * and productId for downstream assertions (e.g. focus restoration).
 * Uses three-outcome diagnostic pattern (§12).
 */
async function openQuickView(page: Page) {
  const { trigger, productId } = await firstQuickViewTrigger(page);
  await trigger.click();

  const modal = page.getByTestId('quick-view-modal');
  const errorState = page.getByTestId('quick-view-modal-error');
  const crashPage = page.getByRole('heading', { name: /this page isn't working/i });

  const winner = await Promise.race([
    modal.waitFor({ state: 'visible', timeout: 15_000 }).then(() => 'content' as const),
    errorState.waitFor({ state: 'visible', timeout: 15_000 }).then(() => 'error-state' as const),
    crashPage.waitFor({ state: 'visible', timeout: 15_000 }).then(() => 'crash' as const),
  ]);

  if (winner === 'crash') {
    const stack = await page.locator('pre').textContent().catch(() => 'no stack');
    throw new Error(`PWA Kit crash page detected after opening Quick View. Stack: ${stack}`);
  }

  return { trigger, productId, winner };
}

/**
 * Collects console errors from the signals fixture bucket, filtering
 * baseline noise. Returns un-allowed errors.
 */
function getConsoleErrors(signals: { consoleErrors: string[] }): string[] {
  return signals.consoleErrors.filter(
    (e) => !BASELINE_NOISE_PATTERNS.some((re) => re.test(e)),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('PLP Quick View Modal', () => {
  // =========================================================================
  // E2E-001: open-quick-view-from-tile (P1, US1)
  // =========================================================================
  test('E2E-001: open quick view from tile', async ({ page, signals }) => {
    await gotoPlp(page);
    const urlBefore = page.url();

    const { winner } = await openQuickView(page);
    expect(winner).toBe('content');

    // Modal is visible with product-view inside
    await expect(page.getByTestId('quick-view-modal')).toBeVisible();
    await expect(
      page.getByTestId('quick-view-modal').getByTestId('product-view'),
    ).toBeVisible();

    // Error fallback is NOT visible
    await expect(page.getByTestId('quick-view-modal-error')).not.toBeVisible();

    // URL unchanged — no navigation away from PLP
    expect(page.url()).toBe(urlBefore);

    // Console-error budget
    const consoleErrors = getConsoleErrors(signals);
    expect(consoleErrors).toEqual([]);
  });

  // =========================================================================
  // E2E-002: switch-color-swatch-in-quick-view (P1, US1)
  // =========================================================================
  test('E2E-002: switch color swatch in quick view', async ({ page, signals }) => {
    await gotoPlp(page);
    await openQuickView(page);

    const modal = page.getByTestId('quick-view-modal');

    // Find the color swatch radiogroup by inspecting each radiogroup's
    // label/aria-label for "color". Contract says to identify by swatch
    // group (fieldset/label/name), not positional index.
    const allRadioGroups = await modal.getByRole('radiogroup').all();
    let colorRadios: Awaited<ReturnType<typeof modal.getByRole<'radio'>['all']>> = [];
    let foundColorGroup = false;

    for (const group of allRadioGroups) {
      const groupText = await group.textContent().catch(() => '');
      const ariaLabel = await group.getAttribute('aria-label').catch(() => '');
      if (/color/i.test(groupText ?? '') || /color/i.test(ariaLabel ?? '')) {
        colorRadios = await group.getByRole('radio').all();
        foundColorGroup = true;
        break;
      }
    }

    if (!foundColorGroup || colorRadios.length === 0) {
      test.skip(true, 'No color swatch group visible in Quick View modal for this product');
      return;
    }

    if (colorRadios.length < 2) {
      test.skip(true, 'Only one color swatch present — cannot test switching');
      return;
    }

    // Capture pre-click image src
    const heroImg = modal.locator('img').first();
    const srcBefore = await heroImg.getAttribute('src');

    // Click the second color swatch
    await colorRadios[1].click();

    // Wait for the image to update — poll for a changed src
    await expect(async () => {
      const srcAfter = await heroImg.getAttribute('src');
      expect(srcAfter).not.toBe(srcBefore);
    }).toPass({ timeout: 5_000 });

    // Modal remains visible
    await expect(modal).toBeVisible();

    // Console-error budget
    const consoleErrors = getConsoleErrors(signals);
    expect(consoleErrors).toEqual([]);
  });

  // =========================================================================
  // E2E-003: add-to-bag-from-quick-view (P1, US2)
  // =========================================================================
  test('E2E-003: add to bag from quick view', async ({ page, signals }) => {
    await gotoPlp(page);
    await openQuickView(page);

    const modal = page.getByTestId('quick-view-modal');
    const addToCartBtn = page.getByTestId('quick-view-add-to-cart-btn');

    // If the button is disabled, select a valid variation first.
    // Try selecting the first available option in each radiogroup.
    const isDisabled = await addToCartBtn.isDisabled().catch(() => false);
    if (isDisabled) {
      const radioGroups = await modal.getByRole('radiogroup').all();
      for (const group of radioGroups) {
        const radios = await group.getByRole('radio').all();
        for (const radio of radios) {
          await radio.click();
          // Wait for button state to update
          const nowEnabled = await addToCartBtn.isEnabled().catch(() => false);
          if (nowEnabled) break;
        }
      }
    }

    // Track basket-related network responses
    const basketErrors: string[] = [];
    page.on('response', (res) => {
      if (/baskets/i.test(res.url()) && res.status() >= 400) {
        basketErrors.push(`${res.request().method()} ${res.url()} -> ${res.status()}`);
      }
    });

    // Click Add to Cart
    await addToCartBtn.click();

    // Three-outcome: add-to-cart confirmation, or crash
    const addToCartModal = page.getByTestId('add-to-cart-modal');
    const crashPage = page.getByRole('heading', { name: /this page isn't working/i });

    const outcome = await Promise.race([
      addToCartModal.waitFor({ state: 'visible', timeout: 15_000 }).then(() => 'confirmation' as const),
      crashPage.waitFor({ state: 'visible', timeout: 15_000 }).then(() => 'crash' as const),
    ]);

    if (outcome === 'crash') {
      const stack = await page.locator('pre').textContent().catch(() => 'no stack');
      throw new Error(`PWA Kit crash page after Add to Cart. Stack: ${stack}`);
    }

    // Quick View modal should be hidden after successful add
    await expect(modal).not.toBeVisible();

    // Add-to-cart confirmation modal visible with at least one product-added row
    await expect(addToCartModal).toBeVisible();
    await expect(addToCartModal.getByTestId('product-added').first()).toBeVisible();

    // No basket-related 4xx/5xx
    expect(basketErrors).toEqual([]);

    // Console-error budget
    const consoleErrors = getConsoleErrors(signals);
    expect(consoleErrors).toEqual([]);
  });

  // =========================================================================
  // E2E-004: close-quick-view-restores-focus (P2)
  // =========================================================================
  test('E2E-004: close via Escape restores focus', async ({ page, signals }) => {
    await gotoPlp(page);
    const { productId } = await openQuickView(page);

    await expect(page.getByTestId('quick-view-modal')).toBeVisible();

    // Dismiss via Escape
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('quick-view-modal')).not.toBeVisible();

    // Focus should return to the trigger
    const activeTestId = await page.evaluate(() =>
      document.activeElement?.getAttribute('data-testid'),
    );
    expect(activeTestId).toBe(`quick-view-trigger-${productId}`);

    // Console-error budget
    const consoleErrors = getConsoleErrors(signals);
    expect(consoleErrors).toEqual([]);
  });

  test('E2E-004: close via close button restores focus', async ({ page, signals }) => {
    await gotoPlp(page);
    const { productId } = await openQuickView(page);

    const modal = page.getByTestId('quick-view-modal');
    await expect(modal).toBeVisible();

    // Find and click the close button inside the modal
    const closeBtn = modal.getByRole('button', { name: /close/i }).first();
    await closeBtn.click();
    await expect(modal).not.toBeVisible();

    // Focus should return to the trigger
    const activeTestId = await page.evaluate(() =>
      document.activeElement?.getAttribute('data-testid'),
    );
    expect(activeTestId).toBe(`quick-view-trigger-${productId}`);

    // Console-error budget
    const consoleErrors = getConsoleErrors(signals);
    expect(consoleErrors).toEqual([]);
  });

  test('E2E-004: close via overlay click restores focus', async ({ page, signals }) => {
    await gotoPlp(page);
    const { productId } = await openQuickView(page);

    const modal = page.getByTestId('quick-view-modal');
    await expect(modal).toBeVisible();

    // Click the overlay (Chakra modal overlay sits behind the modal content).
    // Click at the edge of the viewport to hit the overlay.
    await page.mouse.click(5, 5);
    await expect(modal).not.toBeVisible({ timeout: 5_000 });

    // Focus should return to the trigger
    const activeTestId = await page.evaluate(() =>
      document.activeElement?.getAttribute('data-testid'),
    );
    expect(activeTestId).toBe(`quick-view-trigger-${productId}`);

    // Console-error budget
    const consoleErrors = getConsoleErrors(signals);
    expect(consoleErrors).toEqual([]);
  });

  // =========================================================================
  // E2E-005: no-pickup-ui-in-quick-view (P1, negative)
  // =========================================================================
  test('E2E-005: no pickup UI in quick view', async ({ page, signals }) => {
    await gotoPlp(page);
    await openQuickView(page);

    const modal = page.getByTestId('quick-view-modal');
    await expect(modal).toBeVisible();

    // Pickup-related testids must NOT be visible
    await expect(modal.getByTestId('pickup-select-store-msg')).not.toBeVisible();
    await expect(modal.getByTestId('store-stock-status-msg')).not.toBeVisible();

    // No element with data-testid containing "pickup"
    const pickupElements = await modal.locator('[data-testid*="pickup"]').all();
    for (const el of pickupElements) {
      await expect(el).not.toBeVisible();
    }

    // No text matching pickup/ship-to-store patterns inside the modal
    const modalText = await modal.textContent();
    expect(modalText).not.toMatch(/pickup|ship to store|pick up/i);

    // Console-error budget
    const consoleErrors = getConsoleErrors(signals);
    expect(consoleErrors).toEqual([]);
  });

  // =========================================================================
  // E2E-006: add-to-bag-disabled-when-unavailable (P2, US3)
  // =========================================================================
  test('E2E-006: add to bag disabled when unavailable', async ({ page, signals }) => {
    await gotoPlp(page);
    await openQuickView(page);

    const addToCartBtn = page.getByTestId('quick-view-add-to-cart-btn');
    const modal = page.getByTestId('quick-view-modal');

    // On a master product with unselected variations, button should be disabled
    const isInitiallyDisabled = await addToCartBtn.isDisabled().catch(() => false);

    // If already enabled (single-variant product with auto-selection), skip
    if (!isInitiallyDisabled) {
      test.skip(true, 'Product auto-selected a valid variation; cannot test disabled state');
      return;
    }

    await expect(addToCartBtn).toBeDisabled();

    // Attempt to find an OOS variation: scan radiogroups for inventory hints.
    const radioGroups = await modal.getByRole('radiogroup').all();
    let foundOos = false;

    for (const group of radioGroups) {
      const radios = await group.getByRole('radio').all();
      for (const radio of radios) {
        await radio.click();

        const inventoryMsg = modal.getByTestId('inventory-message');
        const isOos = await inventoryMsg.waitFor({ state: 'visible', timeout: 1_000 })
          .then(() => true)
          .catch(() => false);
        if (isOos) {
          // Verify button stays disabled with OOS selection
          await expect(addToCartBtn).toBeDisabled();
          await expect(inventoryMsg).toBeVisible();
          foundOos = true;
          break;
        }
      }
      if (foundOos) break;
    }

    if (!foundOos) {
      // No OOS variant discoverable at runtime — acceptable per contract
      test.skip(true, 'No OOS variant discoverable; covered deterministically by unit tests');
      return;
    }

    // Console-error budget
    const consoleErrors = getConsoleErrors(signals);
    expect(consoleErrors).toEqual([]);
  });

  // =========================================================================
  // E2E-007: view-full-details-link (P3, US4)
  // =========================================================================
  test('E2E-007: view full details link navigates to PDP', async ({ page, signals }) => {
    await gotoPlp(page);
    await openQuickView(page);

    const viewDetailsLink = page.getByTestId('quick-view-view-full-details-link');
    await expect(viewDetailsLink).toBeVisible();

    await viewDetailsLink.click();

    // Wait for navigation to PDP
    await page.waitForURL(/\/product\//, { timeout: 10_000 });

    // Modal should no longer be visible
    await expect(page.getByTestId('quick-view-modal')).not.toBeVisible();

    // URL should be a PDP
    expect(page.url()).toMatch(/\/product\//);

    // Console-error budget
    const consoleErrors = getConsoleErrors(signals);
    expect(consoleErrors).toEqual([]);
  });

  // =========================================================================
  // E2E-008: tile-click-still-navigates-to-pdp (P2, US1 regression)
  // =========================================================================
  test('E2E-008: tile click still navigates to PDP', async ({ page, signals }) => {
    await gotoPlp(page);

    // Get the first product tile
    const firstTile = page.getByTestId(/^sf-product-tile-/).first();
    await firstTile.waitFor({ state: 'visible', timeout: 10_000 });

    // Click the tile's image (NOT the quick view trigger).
    // The image inside the tile is the standard navigation target.
    const tileImage = firstTile.locator('img').first();
    await tileImage.click();

    // Should navigate to PDP
    await page.waitForURL(/\/product\//, { timeout: 10_000 });
    expect(page.url()).toMatch(/\/product\//);

    // Quick View modal should NOT be visible
    await expect(page.getByTestId('quick-view-modal')).not.toBeVisible();

    // Console-error budget
    const consoleErrors = getConsoleErrors(signals);
    expect(consoleErrors).toEqual([]);
  });
});
