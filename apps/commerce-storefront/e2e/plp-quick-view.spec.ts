/**
 * PLP Quick View Modal — E2E Tests
 *
 * Contract: .dagent/plp-quick-view/_kickoff/e2e-contract.md
 * Flows: E2E-001 through E2E-008
 */
import { test, expect, awaitHydrated } from './fixtures';
import type { Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Baseline noise patterns — mechanically derived from baseline.json
// persistent console_errors only. See e2e-guidelines §17.
// ---------------------------------------------------------------------------
const BASELINE_NOISE_PATTERNS: RegExp[] = [
  /Warning: The result of getServerSnapshot should be cached to avoid an infinite loop/,
  /Warning: %s: Support for defaultProps will be removed from function components in a future major release\. Use JavaScript default parameters instead\.%s PageDesignerProvider/,
  /Failed to load resource: net::ERR_NAME_NOT_RESOLVED/,
  /retail-react-app\.use-datacloud\._handleApiError ERROR \[DataCloudApi\] Error sending Data Cloud event \{\}/,
  /Failed to load resource: the server responded with a status of 403 \(Forbidden\)/,
  /r: 403 Forbidden/,
];

// ---------------------------------------------------------------------------
// PLP category path used by this spec
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
 * Navigate to the PLP, await hydration, and dismiss overlays.
 */
async function gotoPlp(page: Page): Promise<void> {
  await page.goto(PLP_PATH, { waitUntil: 'domcontentloaded' });
  await dismissOverlays(page);
  await awaitHydrated(page);
}

/**
 * Locate the first quick-view trigger on the PLP and extract its product ID.
 */
async function firstQuickViewTrigger(page: Page): Promise<{
  trigger: ReturnType<Page['getByTestId']>;
  productId: string;
}> {
  const trigger = page.locator('[data-testid^="quick-view-trigger-"]').first();
  await expect(trigger).toBeVisible({ timeout: 10_000 });
  const testid = await trigger.getAttribute('data-testid');
  const productId = testid!.replace('quick-view-trigger-', '');
  return { trigger, productId };
}

/**
 * Open Quick View for the first tile: click the trigger and wait for the modal.
 */
async function openQuickView(page: Page): Promise<{
  trigger: ReturnType<Page['getByTestId']>;
  productId: string;
}> {
  const { trigger, productId } = await firstQuickViewTrigger(page);
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();

  // Three-outcome diagnostic (§12)
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

  return { trigger, productId };
}

// ---------------------------------------------------------------------------
// Console-error capture — per-test bucket
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
// Cold-start warm-up hook (§23)
// ---------------------------------------------------------------------------
test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await page.goto(PLP_PATH, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await awaitHydrated(page, { timeout: 30_000 });
  await page.close();
});

// ---------------------------------------------------------------------------
// Helper: assert console-error budget (§17)
// ---------------------------------------------------------------------------
function assertConsoleErrorBudget() {
  const unexpected = consoleErrors.filter(
    (e) => !BASELINE_NOISE_PATTERNS.some((re) => re.test(e)),
  );
  expect(unexpected).toEqual([]);
}

// ===================================================================
// Flow E2E-001: open-quick-view-from-tile (P1)
// ===================================================================
test('E2E-001: open quick view from tile', async ({ page }) => {
  await gotoPlp(page);
  const urlBefore = page.url();

  const { productId } = await openQuickView(page);

  // Modal visible with product-view inside
  await expect(page.getByTestId('quick-view-modal')).toBeVisible();
  await expect(
    page.getByTestId('quick-view-modal').getByTestId('product-view'),
  ).toBeVisible();

  // Error state NOT visible
  await expect(page.getByTestId('quick-view-modal-error')).not.toBeVisible();

  // URL unchanged — no navigation away from PLP
  expect(page.url()).toBe(urlBefore);

  assertConsoleErrorBudget();
});

// ===================================================================
// Flow E2E-002: switch-color-swatch-in-quick-view (P1)
// ===================================================================
test('E2E-002: switch color swatch in quick view', async ({ page }) => {
  await gotoPlp(page);
  await openQuickView(page);

  const modal = page.getByTestId('quick-view-modal');

  // Locate color swatch group — look for a fieldset or group labeled "Color"
  const colorSwatchGroup = modal.locator(
    'fieldset, [role="radiogroup"]',
  ).filter({ hasText: /color/i });

  const colorSwatchCount = await colorSwatchGroup.count();
  if (colorSwatchCount === 0) {
    test.skip(true, 'No color swatch group visible in the opened Quick View modal');
    return;
  }

  // Find clickable swatch buttons within the color group
  const swatches = colorSwatchGroup.first().getByRole('radio');
  const swatchCount = await swatches.count();

  if (swatchCount < 2) {
    test.skip(true, 'Only one color swatch available — cannot test switching');
    return;
  }

  // Capture current gallery image src
  const galleryImage = modal.locator('img').first();
  const srcBefore = await galleryImage.getAttribute('src');

  // Click the second color swatch
  await swatches.nth(1).click();

  // Wait briefly for image to update
  await expect(async () => {
    const srcAfter = await galleryImage.getAttribute('src');
    expect(srcAfter).not.toBe(srcBefore);
  }).toPass({ timeout: 5_000 });

  // Modal still visible
  await expect(page.getByTestId('quick-view-modal')).toBeVisible();

  assertConsoleErrorBudget();
});

// ===================================================================
// Flow E2E-003: add-to-bag-from-quick-view (P1)
// ===================================================================
test('E2E-003: add to bag from quick view', async ({ page }) => {
  await gotoPlp(page);
  await openQuickView(page);

  const modal = page.getByTestId('quick-view-modal');

  // Select first available size if a size selector exists
  const sizeGroup = modal.locator(
    'fieldset, [role="radiogroup"]',
  ).filter({ hasText: /size/i });
  const sizeGroupCount = await sizeGroup.count();
  if (sizeGroupCount > 0) {
    const sizeOptions = sizeGroup.first().getByRole('radio');
    const sizeCount = await sizeOptions.count();
    if (sizeCount > 0) {
      // Pick the first available (non-disabled) size
      for (let i = 0; i < sizeCount; i++) {
        const option = sizeOptions.nth(i);
        const isDisabled = await option.isDisabled().catch(() => false);
        if (!isDisabled) {
          await option.click();
          break;
        }
      }
    }
  }

  // Track basket-related responses
  const basketResponses: { url: string; status: number }[] = [];
  page.on('response', (res) => {
    if (/baskets/i.test(res.url())) {
      basketResponses.push({ url: res.url(), status: res.status() });
    }
  });

  // Click Add to Cart
  const addBtn = page.getByTestId('quick-view-add-to-cart-btn');
  await expect(addBtn).toBeEnabled({ timeout: 5_000 });
  await addBtn.click();

  // Quick View modal should close
  await expect(page.getByTestId('quick-view-modal')).not.toBeVisible({ timeout: 15_000 });

  // Add-to-cart confirmation modal should appear
  await expect(page.getByTestId('add-to-cart-modal')).toBeVisible({ timeout: 15_000 });

  // At least one product-added row
  await expect(
    page.getByTestId('add-to-cart-modal').getByTestId('product-added').first(),
  ).toBeVisible();

  // No 4xx/5xx basket responses
  const failedBasket = basketResponses.filter((r) => r.status >= 400);
  expect(failedBasket).toEqual([]);

  assertConsoleErrorBudget();
});

// ===================================================================
// Flow E2E-004: close-quick-view-restores-focus (P2)
// ===================================================================
test('E2E-004: close quick view via Escape restores focus', async ({ page }) => {
  await gotoPlp(page);
  const { productId } = await openQuickView(page);

  // Dismiss via Escape
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('quick-view-modal')).not.toBeVisible({ timeout: 5_000 });

  // Focus returned to the trigger
  const activeTestId = await page.evaluate(() =>
    document.activeElement?.getAttribute('data-testid'),
  );
  expect(activeTestId).toBe(`quick-view-trigger-${productId}`);

  assertConsoleErrorBudget();
});

test('E2E-004b: close quick view via close button restores focus', async ({ page }) => {
  await gotoPlp(page);
  const { productId } = await openQuickView(page);

  // Find and click the close button inside the modal
  const modal = page.getByTestId('quick-view-modal');
  const closeBtn = modal.getByRole('button', { name: /close/i }).first();
  await closeBtn.click();

  await expect(page.getByTestId('quick-view-modal')).not.toBeVisible({ timeout: 5_000 });

  const activeTestId = await page.evaluate(() =>
    document.activeElement?.getAttribute('data-testid'),
  );
  expect(activeTestId).toBe(`quick-view-trigger-${productId}`);

  assertConsoleErrorBudget();
});

test('E2E-004c: close quick view via overlay click restores focus', async ({ page }) => {
  await gotoPlp(page);
  const { productId } = await openQuickView(page);

  // Click the overlay (Chakra modal overlay is a sibling of the modal content)
  const overlay = page.locator('.chakra-modal__overlay').first();
  // Force click on overlay — it may be behind the modal content
  await overlay.click({ position: { x: 10, y: 10 }, force: true });

  await expect(page.getByTestId('quick-view-modal')).not.toBeVisible({ timeout: 5_000 });

  const activeTestId = await page.evaluate(() =>
    document.activeElement?.getAttribute('data-testid'),
  );
  expect(activeTestId).toBe(`quick-view-trigger-${productId}`);

  assertConsoleErrorBudget();
});

// ===================================================================
// Flow E2E-005: no-pickup-ui-in-quick-view (P1, negative)
// ===================================================================
test('E2E-005: no pickup UI in quick view', async ({ page }) => {
  await gotoPlp(page);
  await openQuickView(page);

  const modal = page.getByTestId('quick-view-modal');

  // None of the pickup-related testids should be visible
  await expect(modal.locator('[data-testid="pickup-select-store-msg"]')).not.toBeVisible();
  await expect(modal.locator('[data-testid="store-stock-status-msg"]')).not.toBeVisible();

  // No element with testid containing "pickup"
  const pickupElements = modal.locator('[data-testid*="pickup"]');
  expect(await pickupElements.count()).toBe(0);

  // No text matching pickup / ship to store / pick up inside the modal
  const modalText = await modal.textContent();
  expect(modalText).not.toMatch(/pickup|ship to store|pick up/i);

  assertConsoleErrorBudget();
});

// ===================================================================
// Flow E2E-006: add-to-bag-disabled-when-unavailable (P2)
// ===================================================================
test('E2E-006: add to bag disabled when unavailable', async ({ page }) => {
  await gotoPlp(page);
  await openQuickView(page);

  const modal = page.getByTestId('quick-view-modal');
  const addBtn = page.getByTestId('quick-view-add-to-cart-btn');

  // Check if size selection is required (master product)
  const sizeGroup = modal.locator(
    'fieldset, [role="radiogroup"]',
  ).filter({ hasText: /size/i });
  const sizeGroupCount = await sizeGroup.count();

  if (sizeGroupCount === 0) {
    test.skip(true, 'Product has no size variations — cannot test disabled state for incomplete selection');
    return;
  }

  // Before selecting a size, button should be disabled
  await expect(addBtn).toBeDisabled({ timeout: 5_000 });

  // Attempt to find an out-of-stock size variant
  const sizeOptions = sizeGroup.first().getByRole('radio');
  const sizeCount = await sizeOptions.count();
  let foundOos = false;

  for (let i = 0; i < sizeCount; i++) {
    const option = sizeOptions.nth(i);
    const isDisabled = await option.isDisabled().catch(() => false);
    if (isDisabled) {
      // This is likely an OOS variant — click it (force) and verify
      await option.click({ force: true });
      foundOos = true;

      // Button should remain disabled
      await expect(addBtn).toBeDisabled({ timeout: 3_000 });

      // Inventory message visible
      await expect(
        modal.getByTestId('inventory-message'),
      ).toBeVisible({ timeout: 5_000 });
      break;
    }
  }

  if (!foundOos) {
    // No OOS variant discoverable at runtime — that's OK
    // At minimum we verified the button was disabled before selection
  }

  assertConsoleErrorBudget();
});

// ===================================================================
// Flow E2E-007: view-full-details-link (P3)
// ===================================================================
test('E2E-007: view full details navigates to PDP', async ({ page }) => {
  await gotoPlp(page);
  const { productId } = await openQuickView(page);

  const link = page.getByTestId('quick-view-view-full-details-link');
  await expect(link).toBeVisible();
  await link.click();

  // Should navigate to PDP — URL changes
  await page.waitForURL(/\/product\//, { timeout: 15_000 });
  expect(page.url()).toMatch(/\/product\//);

  // Modal should no longer be visible
  await expect(page.getByTestId('quick-view-modal')).not.toBeVisible();

  assertConsoleErrorBudget();
});

// ===================================================================
// Flow E2E-008: tile-click-still-navigates-to-pdp (P2, regression)
// ===================================================================
test('E2E-008: tile click still navigates to PDP', async ({ page }) => {
  await gotoPlp(page);

  // Get the first product tile's image link
  const firstTile = page.locator('[data-testid^="sf-product-tile-"]').first();
  await expect(firstTile).toBeVisible({ timeout: 10_000 });

  // Click the tile image (not the quick view trigger)
  const tileImage = firstTile.getByTestId('product-tile-image').first();
  await tileImage.click();

  // Should navigate to PDP
  await page.waitForURL(/\/product\//, { timeout: 15_000 });
  expect(page.url()).toMatch(/\/product\//);

  // Quick View modal should NOT be visible
  await expect(page.getByTestId('quick-view-modal')).not.toBeVisible();

  assertConsoleErrorBudget();
});
