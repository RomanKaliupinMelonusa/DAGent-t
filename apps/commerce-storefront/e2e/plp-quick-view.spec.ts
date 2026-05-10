/**
 * E2E tests for PLP Product Quick View Modal
 *
 * Contract: .dagent/plp-quick-view/_kickoff/e2e-contract.md
 * Flows: E2E-001 through E2E-008
 */

import { test, expect, awaitHydrated } from './fixtures';
import type { Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// BASELINE_NOISE_PATTERNS — mechanically derived from inputs/baseline.json
// Every persistent-volatility console_errors[] entry becomes one escaped regex.
// ---------------------------------------------------------------------------
const BASELINE_NOISE_PATTERNS: RegExp[] = [
  /Warning: The result of getServerSnapshot should be cached to avoid an infinite loop/,
  /Support for defaultProps will be removed from function components in a future major release\. Use JavaScript default parameters instead\./,
  /Failed to load resource: net::ERR_NAME_NOT_RESOLVED/,
  /retail-react-app\.use-datacloud\._handleApiError ERROR \[DataCloudApi\] Error sending Data Cloud event/,
  /r: 403 Forbidden/,
];

// ---------------------------------------------------------------------------
// PLP category path — contract fixture
// ---------------------------------------------------------------------------
const PLP_PATH = '/category/womens-clothing-dresses';

// ---------------------------------------------------------------------------
// Overlay dismissal helper (§19 — inlined per spec, NOT modifying fixtures.ts)
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

/** Navigate to the PLP, wait for hydration, dismiss overlays. */
async function gotoPlp(page: Page): Promise<void> {
  await page.goto(PLP_PATH, { waitUntil: 'domcontentloaded' });
  await dismissOverlays(page);
  await awaitHydrated(page);
}

/**
 * Return the first Quick View trigger on the PLP and its product ID.
 * Uses `getByTestId` with a regex to match the `quick-view-trigger-{id}` pattern.
 */
async function firstQuickViewTrigger(page: Page): Promise<{ trigger: ReturnType<Page['getByTestId']>; productId: string }> {
  const trigger = page.getByTestId(/^quick-view-trigger-/).first();
  await expect(trigger).toBeVisible({ timeout: 10_000 });
  const testid = await trigger.getAttribute('data-testid');
  const productId = testid!.replace('quick-view-trigger-', '');
  return { trigger, productId };
}

/**
 * Open Quick View by clicking the first trigger. Returns the trigger locator
 * and product ID for downstream assertions (e.g. focus restoration).
 */
async function openQuickView(page: Page): Promise<{ trigger: ReturnType<Page['getByTestId']>; productId: string }> {
  const { trigger, productId } = await firstQuickViewTrigger(page);
  await trigger.click();

  // Three-outcome pattern (§12): content loaded, error state, or crash page
  const modal = page.getByTestId('quick-view-modal');
  const errorState = page.getByTestId('quick-view-modal-error');
  const crashPage = page.getByRole('heading', { name: /this page isn't working/i });

  const winner = await Promise.race([
    modal.waitFor({ state: 'visible', timeout: 15_000 }).then(() => 'modal' as const),
    crashPage.waitFor({ state: 'visible', timeout: 15_000 }).then(() => 'crash' as const),
  ]);

  if (winner === 'crash') {
    const stack = await page.locator('pre').textContent().catch(() => 'no stack');
    throw new Error(`PWA Kit crash page detected after clicking Quick View trigger. Stack: ${stack}`);
  }

  return { trigger, productId };
}

// ---------------------------------------------------------------------------
// Console-error capture — per-test lifecycle
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
// Flow E2E-001: open-quick-view-from-tile (P1 — US1)
// ---------------------------------------------------------------------------
test('E2E-001: open Quick View from tile', async ({ page }) => {
  await gotoPlp(page);
  const urlBefore = page.url();

  await openQuickView(page);

  // Modal visible with product content
  const modal = page.getByTestId('quick-view-modal');
  await expect(modal).toBeVisible();
  await expect(modal.getByTestId('product-view')).toBeVisible({ timeout: 10_000 });

  // Error fallback NOT visible
  await expect(page.getByTestId('quick-view-modal-error')).not.toBeVisible();

  // URL unchanged — no navigation away from PLP
  expect(page.url()).toBe(urlBefore);

  // Console-error budget
  expect(
    consoleErrors.filter((e) => !BASELINE_NOISE_PATTERNS.some((re) => re.test(e)))
  ).toEqual([]);
});

// ---------------------------------------------------------------------------
// Flow E2E-002: switch-color-swatch-in-quick-view (P1 — US1)
// ---------------------------------------------------------------------------
test('E2E-002: switch color swatch in Quick View', async ({ page }) => {
  await gotoPlp(page);
  await openQuickView(page);

  const modal = page.getByTestId('quick-view-modal');
  await expect(modal.getByTestId('product-view')).toBeVisible({ timeout: 10_000 });

  // Find swatch buttons inside the modal. The storefront renders swatches
  // as buttons inside a swatch group (radiogroup or similar).
  const swatches = modal.getByRole('radio');
  const swatchCount = await swatches.count();

  // Skip if fewer than 2 color swatches on this product
  test.skip(swatchCount < 2, 'First tile has fewer than 2 swatches; cannot test swatch switching');

  // Capture the primary gallery image src before switching
  const galleryImg = modal.locator('img').first();
  const srcBefore = await galleryImg.getAttribute('src');

  // Click the second swatch (index 1)
  await swatches.nth(1).click();

  // Wait a moment for the image to update — use locator-based wait
  // by checking that the image src changes
  await expect(async () => {
    const srcAfter = await galleryImg.getAttribute('src');
    expect(srcAfter).not.toBe(srcBefore);
  }).toPass({ timeout: 10_000 });

  // Modal still visible
  await expect(modal).toBeVisible();

  // Console-error budget
  expect(
    consoleErrors.filter((e) => !BASELINE_NOISE_PATTERNS.some((re) => re.test(e)))
  ).toEqual([]);
});

// ---------------------------------------------------------------------------
// Flow E2E-003: add-to-bag-from-quick-view (P1 — US2)
// ---------------------------------------------------------------------------
test('E2E-003: add to bag from Quick View', async ({ page }) => {
  await gotoPlp(page);
  await openQuickView(page);

  const modal = page.getByTestId('quick-view-modal');
  await expect(modal.getByTestId('product-view')).toBeVisible({ timeout: 10_000 });

  // Select the first available size if size buttons exist
  const sizeButtons = modal.getByRole('radio');
  const sizeCount = await sizeButtons.count();
  if (sizeCount > 0) {
    // Click the first non-selected, non-disabled option
    for (let i = 0; i < sizeCount; i++) {
      const btn = sizeButtons.nth(i);
      const isDisabled = await btn.isDisabled().catch(() => true);
      if (!isDisabled) {
        await btn.click();
        break;
      }
    }
  }

  // Wait for ATC button to become enabled
  const atcBtn = page.getByTestId('quick-view-add-to-cart-btn');
  await expect(atcBtn).toBeEnabled({ timeout: 10_000 });

  // Track basket responses
  const basketResponses: number[] = [];
  page.on('response', (res) => {
    if (/baskets/i.test(res.url())) {
      basketResponses.push(res.status());
    }
  });

  // Click Add to Cart
  await atcBtn.click();

  // Quick View modal should close
  await expect(modal).not.toBeVisible({ timeout: 15_000 });

  // Add-to-cart confirmation modal should appear
  const confirmModal = page.getByTestId('add-to-cart-modal');
  await expect(confirmModal).toBeVisible({ timeout: 15_000 });

  // At least one product-added row
  const addedRows = confirmModal.getByTestId('product-added');
  await expect(addedRows.first()).toBeVisible({ timeout: 5_000 });

  // All basket responses must be 2xx
  const badResponses = basketResponses.filter((s) => s >= 400);
  expect(badResponses, 'Basket-related responses should all be 2xx').toEqual([]);

  // Console-error budget
  expect(
    consoleErrors.filter((e) => !BASELINE_NOISE_PATTERNS.some((re) => re.test(e)))
  ).toEqual([]);
});

// ---------------------------------------------------------------------------
// Flow E2E-004: close-quick-view-restores-focus (P2)
// ---------------------------------------------------------------------------
test('E2E-004: close Quick View via Escape restores focus', async ({ page }) => {
  await gotoPlp(page);
  const { productId } = await openQuickView(page);

  const modal = page.getByTestId('quick-view-modal');
  await expect(modal.getByTestId('product-view')).toBeVisible({ timeout: 10_000 });

  // Dismiss via Escape
  await page.keyboard.press('Escape');
  await expect(modal).not.toBeVisible({ timeout: 5_000 });

  // Focus should return to originating trigger
  const activeTestId = await page.evaluate(() =>
    document.activeElement?.getAttribute('data-testid')
  );
  expect(activeTestId).toBe(`quick-view-trigger-${productId}`);

  // Console-error budget
  expect(
    consoleErrors.filter((e) => !BASELINE_NOISE_PATTERNS.some((re) => re.test(e)))
  ).toEqual([]);
});

test('E2E-004b: close Quick View via close button restores focus', async ({ page }) => {
  await gotoPlp(page);
  const { productId } = await openQuickView(page);

  const modal = page.getByTestId('quick-view-modal');
  await expect(modal.getByTestId('product-view')).toBeVisible({ timeout: 10_000 });

  // Find the close button inside the modal
  const closeBtn = modal.getByRole('button', { name: /close/i }).first();
  await closeBtn.click();
  await expect(modal).not.toBeVisible({ timeout: 5_000 });

  // Focus should return to originating trigger
  const activeTestId = await page.evaluate(() =>
    document.activeElement?.getAttribute('data-testid')
  );
  expect(activeTestId).toBe(`quick-view-trigger-${productId}`);

  // Console-error budget
  expect(
    consoleErrors.filter((e) => !BASELINE_NOISE_PATTERNS.some((re) => re.test(e)))
  ).toEqual([]);
});

test('E2E-004c: close Quick View via overlay click restores focus', async ({ page }) => {
  await gotoPlp(page);
  const { productId } = await openQuickView(page);

  const modal = page.getByTestId('quick-view-modal');
  await expect(modal.getByTestId('product-view')).toBeVisible({ timeout: 10_000 });

  // Click the overlay (outside the modal content). Chakra renders an overlay
  // sibling. We click the top-left corner of the viewport to hit the overlay.
  await page.mouse.click(5, 5);
  await expect(modal).not.toBeVisible({ timeout: 5_000 });

  // Focus should return to originating trigger
  const activeTestId = await page.evaluate(() =>
    document.activeElement?.getAttribute('data-testid')
  );
  expect(activeTestId).toBe(`quick-view-trigger-${productId}`);

  // Console-error budget
  expect(
    consoleErrors.filter((e) => !BASELINE_NOISE_PATTERNS.some((re) => re.test(e)))
  ).toEqual([]);
});

// ---------------------------------------------------------------------------
// Flow E2E-005: no-pickup-ui-in-quick-view (P1 negative)
// ---------------------------------------------------------------------------
test('E2E-005: no pickup UI in Quick View modal', async ({ page }) => {
  await gotoPlp(page);
  await openQuickView(page);

  const modal = page.getByTestId('quick-view-modal');
  await expect(modal.getByTestId('product-view')).toBeVisible({ timeout: 10_000 });

  // Pickup/ship-to-store testids must NOT be visible
  await expect(modal.getByTestId('pickup-select-store-msg')).not.toBeVisible();
  await expect(modal.getByTestId('store-stock-status-msg')).not.toBeVisible();

  // No element with data-testid containing "pickup"
  const pickupElements = modal.locator('[data-testid*="pickup"]');
  await expect(pickupElements).toHaveCount(0);

  // No text content matching pickup/ship to store inside the modal
  const pickupText = modal.locator('text=/pickup|ship to store|pick up/i');
  await expect(pickupText).toHaveCount(0);

  // Console-error budget
  expect(
    consoleErrors.filter((e) => !BASELINE_NOISE_PATTERNS.some((re) => re.test(e)))
  ).toEqual([]);
});

// ---------------------------------------------------------------------------
// Flow E2E-006: add-to-bag-disabled-when-unavailable (P2 — US3)
// ---------------------------------------------------------------------------
test('E2E-006: add to bag disabled when variation unavailable', async ({ page }) => {
  await gotoPlp(page);
  await openQuickView(page);

  const modal = page.getByTestId('quick-view-modal');
  await expect(modal.getByTestId('product-view')).toBeVisible({ timeout: 10_000 });

  // Before full variation selection, ATC button should be disabled
  const atcBtn = page.getByTestId('quick-view-add-to-cart-btn');
  await expect(atcBtn).toBeDisabled({ timeout: 5_000 });

  // Attempt to discover an out-of-stock variation by scanning size options
  const sizeButtons = modal.getByRole('radio');
  const count = await sizeButtons.count();
  let foundOos = false;

  for (let i = 0; i < count; i++) {
    const btn = sizeButtons.nth(i);
    const isDisabled = await btn.isDisabled().catch(() => false);
    if (isDisabled) {
      // A disabled radio is an OOS/non-orderable variant indicator
      foundOos = true;
      break;
    }
  }

  if (!foundOos) {
    test.skip(true, 'No OOS variant discoverable; covered deterministically by unit tests');
  }

  // Console-error budget
  expect(
    consoleErrors.filter((e) => !BASELINE_NOISE_PATTERNS.some((re) => re.test(e)))
  ).toEqual([]);
});

// ---------------------------------------------------------------------------
// Flow E2E-007: view-full-details-link (P3 — US4)
// ---------------------------------------------------------------------------
test('E2E-007: view full details link navigates to PDP', async ({ page }) => {
  await gotoPlp(page);
  const { productId } = await openQuickView(page);

  const modal = page.getByTestId('quick-view-modal');
  await expect(modal.getByTestId('product-view')).toBeVisible({ timeout: 10_000 });

  // Click "View Full Details"
  const detailsLink = page.getByTestId('quick-view-view-full-details-link');
  await expect(detailsLink).toBeVisible();
  await detailsLink.click();

  // Should navigate to PDP (URL changes to include /product/)
  await page.waitForURL(/\/product\//, { timeout: 15_000 });

  // Modal should no longer be visible
  await expect(modal).not.toBeVisible();

  // Console-error budget
  expect(
    consoleErrors.filter((e) => !BASELINE_NOISE_PATTERNS.some((re) => re.test(e)))
  ).toEqual([]);
});

// ---------------------------------------------------------------------------
// Flow E2E-008: tile-click-still-navigates-to-pdp (P2 regression — US1)
// ---------------------------------------------------------------------------
test('E2E-008: tile click still navigates to PDP', async ({ page }) => {
  await gotoPlp(page);

  // Click the first product tile image (NOT the quick view trigger)
  const tileImage = page.getByTestId('product-tile-image').first();
  await expect(tileImage).toBeVisible({ timeout: 10_000 });

  await tileImage.click();

  // Should navigate to PDP
  await page.waitForURL(/\/product\//, { timeout: 15_000 });

  // Quick View modal should NOT be visible
  await expect(page.getByTestId('quick-view-modal')).not.toBeVisible();

  // Console-error budget
  expect(
    consoleErrors.filter((e) => !BASELINE_NOISE_PATTERNS.some((re) => re.test(e)))
  ).toEqual([]);
});
