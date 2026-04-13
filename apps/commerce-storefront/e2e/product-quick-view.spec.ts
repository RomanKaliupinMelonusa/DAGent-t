import { test, expect, type Page } from '@playwright/test';

/**
 * E2E tests for the Product Quick View feature.
 *
 * Feature: Quick View overlay bar on Product Tiles (PLP) that opens a modal
 * with full product details, variant selectors, and Add to Cart — without
 * navigating away from the PLP.
 *
 * Data-testid contract:
 *   - quick-view-btn     → overlay bar button on each product tile
 *   - quick-view-modal   → the modal content container
 *   - quick-view-spinner → loading spinner inside the modal
 *   - quick-view-error   → error state when product is unavailable
 */

// ─── PLP URL ──────────────────────────────────────────────────────────────
// Use the search page as a reliable PLP that always renders product tiles.
// The RefArch demo catalog ships with products matching common search terms.
const PLP_URL = '/search?q=dress';
const PLP_URL_ALT = '/search?q=shirt';

// ─── Browser Diagnostics (MANDATORY) ─────────────────────────────────────

let consoleErrors: string[] = [];
let failedRequests: string[] = [];

test.beforeEach(async ({ page }) => {
  consoleErrors = [];
  failedRequests = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('requestfailed', (req) => {
    failedRequests.push(`${req.method()} ${req.url()} - ${req.failure()?.errorText}`);
  });
});

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== 'passed') {
    console.log(`\n--- Browser Diagnostics for "${testInfo.title}" ---`);
    if (consoleErrors.length > 0) {
      console.log('Console errors:', consoleErrors);
    }
    if (failedRequests.length > 0) {
      console.log('Failed requests:', failedRequests);
    }
    await page.screenshot({
      path: `test-results/failure-${testInfo.title.replace(/\s+/g, '-')}.png`,
    });
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Navigate to a PLP and wait for at least one Quick View button to appear.
 * Falls back to an alternative search query if the primary returns no results.
 */
async function navigateToPLP(page: Page): Promise<void> {
  await page.goto(PLP_URL, { waitUntil: 'domcontentloaded' });

  // Wait for Quick View buttons to render on product tiles
  const quickViewBtn = page.getByTestId('quick-view-btn').first();
  const hasTiles = await quickViewBtn
    .waitFor({ state: 'visible', timeout: 20_000 })
    .then(() => true)
    .catch(() => false);

  if (!hasTiles) {
    // Fallback to alternative search term
    await page.goto(PLP_URL_ALT, { waitUntil: 'domcontentloaded' });
    await quickViewBtn.waitFor({ state: 'visible', timeout: 20_000 });
  }
}

/**
 * Detect PWA Kit crash page after an action.
 */
async function assertNoCrashPage(page: Page, actionDescription: string): Promise<void> {
  const crashHeading = page.getByRole('heading', { name: /this page isn't working/i });
  const hasCrash = await crashHeading
    .waitFor({ state: 'visible', timeout: 2000 })
    .then(() => true)
    .catch(() => false);

  if (hasCrash) {
    const stack = await page.locator('pre').textContent().catch(() => 'no stack');
    throw new Error(
      `PWA Kit crash page detected after "${actionDescription}". Stack: ${stack}`
    );
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────

test.describe('Product Quick View', () => {
  test('Quick View buttons appear on product tiles on the PLP', async ({ page }) => {
    await navigateToPLP(page);

    // Verify at least one Quick View button is visible
    const quickViewButtons = page.getByTestId('quick-view-btn');
    await expect(quickViewButtons.first()).toBeVisible();

    // Verify the button has correct aria-label pattern
    const ariaLabel = await quickViewButtons.first().getAttribute('aria-label');
    expect(ariaLabel).toMatch(/^Quick View /);
  });

  test('clicking Quick View button opens the modal', async ({ page }) => {
    await navigateToPLP(page);

    const quickViewBtn = page.getByTestId('quick-view-btn').first();
    await quickViewBtn.click();

    // Three-outcome assertion: modal visible, crash page, or timeout
    const modal = page.getByTestId('quick-view-modal');
    const crashPage = page.getByRole('heading', { name: /this page isn't working/i });

    const winner = await Promise.race([
      modal.waitFor({ state: 'visible', timeout: 15_000 }).then(() => 'modal' as const),
      crashPage
        .waitFor({ state: 'visible', timeout: 15_000 })
        .then(() => 'crash' as const),
    ]);

    if (winner === 'crash') {
      const stack = await page.locator('pre').textContent().catch(() => 'no stack');
      throw new Error(`PWA Kit crash page detected after clicking Quick View. Stack: ${stack}`);
    }

    // Modal should be visible — either with product content or error state
    await expect(modal).toBeVisible();

    // Modal must have an aria-label for accessibility
    const modalAriaLabel = await modal.getAttribute('aria-label');
    expect(modalAriaLabel).toMatch(/Quick view for .+/);
  });

  test('Quick View modal shows loading spinner then product content or error', async ({ page }) => {
    await navigateToPLP(page);

    const quickViewBtn = page.getByTestId('quick-view-btn').first();
    await quickViewBtn.click();

    // Wait for modal to appear
    const modal = page.getByTestId('quick-view-modal');
    await modal.waitFor({ state: 'visible', timeout: 15_000 });

    // Three-outcome assertion for modal body content
    const spinner = page.getByTestId('quick-view-spinner');
    const errorState = page.getByTestId('quick-view-error');
    const crashPage = page.getByRole('heading', { name: /this page isn't working/i });

    // First, we may see a spinner (loading state)
    const spinnerVisible = await spinner
      .waitFor({ state: 'visible', timeout: 3_000 })
      .then(() => true)
      .catch(() => false);

    if (spinnerVisible) {
      // Spinner appeared — wait for it to disappear (product loaded or error)
      await spinner.waitFor({ state: 'hidden', timeout: 20_000 });
    }

    // After loading, check what the modal shows
    // ProductView renders a form or product-view container inside the modal
    const productContent = modal.locator('form, [class*="productView"], img, button:has-text("Add to Cart"), [data-testid="product-view"]').first();
    const errorView = page.getByTestId('quick-view-error');

    const outcome = await Promise.race([
      productContent
        .waitFor({ state: 'visible', timeout: 10_000 })
        .then(() => 'product' as const),
      errorView
        .waitFor({ state: 'visible', timeout: 10_000 })
        .then(() => 'error' as const),
      crashPage
        .waitFor({ state: 'visible', timeout: 10_000 })
        .then(() => 'crash' as const),
    ]);

    if (outcome === 'crash') {
      const stack = await page.locator('pre').textContent().catch(() => 'no stack');
      throw new Error(`PWA Kit crash page detected in Quick View modal. Stack: ${stack}`);
    }

    // Both product and error states are valid outcomes
    expect(['product', 'error']).toContain(outcome);
  });

  test('Quick View modal can be closed via the close button', async ({ page }) => {
    await navigateToPLP(page);

    const quickViewBtn = page.getByTestId('quick-view-btn').first();
    await quickViewBtn.click();

    const modal = page.getByTestId('quick-view-modal');
    await modal.waitFor({ state: 'visible', timeout: 15_000 });

    // Click the close button (Chakra ModalCloseButton renders with aria-label "Close")
    const closeButton = modal.getByRole('button', { name: /close/i });
    await expect(closeButton).toBeVisible();
    await closeButton.click();

    // Modal should be hidden after closing
    await expect(modal).toBeHidden({ timeout: 5_000 });
  });

  test('Quick View modal can be closed by pressing Escape', async ({ page }) => {
    await navigateToPLP(page);

    const quickViewBtn = page.getByTestId('quick-view-btn').first();
    await quickViewBtn.click();

    const modal = page.getByTestId('quick-view-modal');
    await modal.waitFor({ state: 'visible', timeout: 15_000 });

    // Press Escape to close
    await page.keyboard.press('Escape');

    // Modal should be hidden after Escape
    await expect(modal).toBeHidden({ timeout: 5_000 });
  });

  test('user stays on PLP after opening and closing Quick View', async ({ page }) => {
    await navigateToPLP(page);

    // Capture current URL before opening modal
    const urlBefore = page.url();

    const quickViewBtn = page.getByTestId('quick-view-btn').first();
    await quickViewBtn.click();

    const modal = page.getByTestId('quick-view-modal');
    await modal.waitFor({ state: 'visible', timeout: 15_000 });

    // Close the modal
    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden({ timeout: 5_000 });

    await assertNoCrashPage(page, 'closing Quick View modal');

    // URL should not have changed — user is still on the PLP
    expect(page.url()).toBe(urlBefore);

    // Quick View buttons should still be visible on the page
    await expect(page.getByTestId('quick-view-btn').first()).toBeVisible();
  });

  test('Quick View button click does not navigate to PDP', async ({ page }) => {
    await navigateToPLP(page);

    // Capture current URL
    const urlBefore = page.url();

    // Click Quick View — this should NOT trigger the tile link navigation
    const quickViewBtn = page.getByTestId('quick-view-btn').first();
    await quickViewBtn.click();

    // Wait for modal to appear, confirming no navigation
    const modal = page.getByTestId('quick-view-modal');
    await modal.waitFor({ state: 'visible', timeout: 15_000 });

    // URL should be the same (not navigated to a /product/ page)
    expect(page.url()).toBe(urlBefore);
    expect(page.url()).not.toMatch(/\/product\//);
  });

  test('Quick View buttons have accessible aria-labels with product names', async ({ page }) => {
    await navigateToPLP(page);

    const quickViewButtons = page.getByTestId('quick-view-btn');
    const count = await quickViewButtons.count();

    // Check at least the first few buttons have meaningful aria-labels
    const checksToRun = Math.min(count, 3);
    for (let i = 0; i < checksToRun; i++) {
      const ariaLabel = await quickViewButtons.nth(i).getAttribute('aria-label');
      expect(ariaLabel).toBeTruthy();
      // aria-label should be "Quick View <productName>" — not just "Quick View "
      expect(ariaLabel).toMatch(/^Quick View .+/);
    }
  });
});
