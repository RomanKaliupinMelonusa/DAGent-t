import { test, expect, type Page } from '@playwright/test';

/**
 * E2E tests for the Product Quick View feature.
 *
 * Validates the overlay bar trigger on product tiles and the Quick View modal
 * that allows shoppers to preview product details, select variants, and add
 * to cart directly from the PLP without navigating to the PDP.
 *
 * data-testid contract:
 *   - quick-view-btn      → overlay bar button on each product tile
 *   - quick-view-modal    → modal content container
 *   - quick-view-spinner  → loading spinner inside modal
 *   - quick-view-error    → error state for unavailable products
 */

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
 * Navigate to a PLP (category listing) page that shows product tiles.
 * Tries a well-known category URL first, falls back to discovering
 * a category link from the homepage navigation.
 */
async function navigateToPLP(page: Page): Promise<void> {
  // Try navigating to a known category path (RefArch sandbox)
  await page.goto('/category/newarrivals', { waitUntil: 'domcontentloaded' });

  // Wait for Quick View buttons to appear on product tiles
  const quickViewBtn = page.getByTestId('quick-view-btn').first();
  const btnVisible = await quickViewBtn
    .waitFor({ state: 'visible', timeout: 20_000 })
    .then(() => true)
    .catch(() => false);

  if (!btnVisible) {
    // Fallback: navigate via homepage category links
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const navLink = page.locator('nav a, [role="navigation"] a').first();
    await navLink.waitFor({ state: 'visible', timeout: 15_000 });
    await navLink.click();
    await page.waitForLoadState('domcontentloaded');

    // Wait for Quick View buttons on the new PLP
    await page
      .getByTestId('quick-view-btn')
      .first()
      .waitFor({ state: 'visible', timeout: 20_000 });
  }
}

/**
 * Detect the PWA Kit crash page. Throws a structured error with the
 * stack trace if detected.
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
  test.describe('Quick View Button on PLP', () => {
    test('product tiles on PLP display the Quick View overlay bar', async ({ page }) => {
      await navigateToPLP(page);
      await assertNoCrashPage(page, 'navigating to PLP');

      // The Quick View button should be present on at least one product tile
      const quickViewButtons = page.getByTestId('quick-view-btn');
      const count = await quickViewButtons.count();
      expect(count).toBeGreaterThan(0);

      // Verify the button contains the expected "Quick View" text
      const firstButton = quickViewButtons.first();
      await expect(firstButton).toContainText('Quick View');
    });

    test('Quick View button has accessible aria-label', async ({ page }) => {
      await navigateToPLP(page);
      await assertNoCrashPage(page, 'navigating to PLP');

      const firstButton = page.getByTestId('quick-view-btn').first();
      const ariaLabel = await firstButton.getAttribute('aria-label');
      expect(ariaLabel).toBeTruthy();
      expect(ariaLabel).toMatch(/Quick View/i);
    });

    test('Quick View button click does not navigate away from PLP', async ({ page }) => {
      await navigateToPLP(page);
      await assertNoCrashPage(page, 'navigating to PLP');

      const urlBefore = page.url();
      const quickViewBtn = page.getByTestId('quick-view-btn').first();

      // Force click — on desktop the bar may be hidden until hover
      await quickViewBtn.click({ force: true });

      // URL should remain on PLP (no PDP navigation)
      expect(page.url()).toBe(urlBefore);
    });
  });

  test.describe('Quick View Modal', () => {
    test('clicking Quick View opens the modal', async ({ page }) => {
      await navigateToPLP(page);
      await assertNoCrashPage(page, 'navigating to PLP');

      const quickViewBtn = page.getByTestId('quick-view-btn').first();
      await quickViewBtn.click({ force: true });

      // Three-Outcome Assertion Pattern (MANDATORY for modals)
      const content = page.getByTestId('quick-view-modal');
      const errorState = page.getByTestId('quick-view-error');
      const crashPage = page.getByRole('heading', { name: /this page isn't working/i });

      const winner = await Promise.race([
        content.waitFor({ state: 'visible', timeout: 15000 }).then(() => 'content' as const),
        errorState.waitFor({ state: 'visible', timeout: 15000 }).then(() => 'error-state' as const),
        crashPage.waitFor({ state: 'visible', timeout: 15000 }).then(() => 'crash' as const),
      ]);

      if (winner === 'crash') {
        const stack = await page.locator('pre').textContent().catch(() => 'no stack');
        throw new Error(`PWA Kit crash page detected after opening Quick View. Stack: ${stack}`);
      }

      // Either content loaded or we got a graceful error state — both valid
      expect(['content', 'error-state']).toContain(winner);

      // The modal container should be visible
      await expect(page.getByTestId('quick-view-modal')).toBeVisible();
    });

    test('modal resolves from loading state to product content or error', async ({ page }) => {
      await navigateToPLP(page);
      await assertNoCrashPage(page, 'navigating to PLP');

      const quickViewBtn = page.getByTestId('quick-view-btn').first();
      await quickViewBtn.click({ force: true });

      // Wait for modal to appear
      const modal = page.getByTestId('quick-view-modal');
      await modal.waitFor({ state: 'visible', timeout: 15000 });

      // Wait for spinner to disappear (may have already gone)
      const spinner = page.getByTestId('quick-view-spinner');
      await spinner.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});

      // After loading resolves, modal should still be visible with content
      await expect(modal).toBeVisible();

      // Verify either product content or error state is shown
      const hasError = await page.getByTestId('quick-view-error').isVisible().catch(() => false);
      if (!hasError) {
        // Product content loaded — modal body should have visible content
        const modalBody = modal.locator('.chakra-modal__body').first();
        await expect(modalBody).toBeVisible();
      }
    });

    test('modal has accessible aria-label with product name', async ({ page }) => {
      await navigateToPLP(page);
      await assertNoCrashPage(page, 'navigating to PLP');

      const quickViewBtn = page.getByTestId('quick-view-btn').first();
      await quickViewBtn.click({ force: true });

      const modal = page.getByTestId('quick-view-modal');
      await modal.waitFor({ state: 'visible', timeout: 15000 });

      const ariaLabel = await modal.getAttribute('aria-label');
      expect(ariaLabel).toBeTruthy();
      // Should contain "Quick view for" prefix (intl message)
      expect(ariaLabel!.toLowerCase()).toContain('quick view for');
    });

    test('modal can be closed with the close button', async ({ page }) => {
      await navigateToPLP(page);
      await assertNoCrashPage(page, 'navigating to PLP');

      const quickViewBtn = page.getByTestId('quick-view-btn').first();
      await quickViewBtn.click({ force: true });

      const modal = page.getByTestId('quick-view-modal');
      await modal.waitFor({ state: 'visible', timeout: 15000 });

      // Click the Chakra ModalCloseButton
      const closeButton = modal.locator('button[aria-label="Close"]');
      await closeButton.click();

      // Modal should disappear
      await expect(modal).toBeHidden({ timeout: 5000 });
    });

    test('modal can be closed with Escape key', async ({ page }) => {
      await navigateToPLP(page);
      await assertNoCrashPage(page, 'navigating to PLP');

      const quickViewBtn = page.getByTestId('quick-view-btn').first();
      await quickViewBtn.click({ force: true });

      const modal = page.getByTestId('quick-view-modal');
      await modal.waitFor({ state: 'visible', timeout: 15000 });

      // Press Escape
      await page.keyboard.press('Escape');

      // Modal should disappear
      await expect(modal).toBeHidden({ timeout: 5000 });
    });

    test('modal shows product details when loaded successfully', async ({ page }) => {
      await navigateToPLP(page);
      await assertNoCrashPage(page, 'navigating to PLP');

      const quickViewBtn = page.getByTestId('quick-view-btn').first();
      await quickViewBtn.click({ force: true });

      // Three-Outcome pattern
      const modal = page.getByTestId('quick-view-modal');
      const crashPage = page.getByRole('heading', { name: /this page isn't working/i });

      const winner = await Promise.race([
        modal.waitFor({ state: 'visible', timeout: 15000 }).then(() => 'modal' as const),
        crashPage.waitFor({ state: 'visible', timeout: 15000 }).then(() => 'crash' as const),
      ]);

      if (winner === 'crash') {
        const stack = await page.locator('pre').textContent().catch(() => 'no stack');
        throw new Error(`PWA Kit crash page detected. Stack: ${stack}`);
      }

      // Wait for spinner to resolve
      const spinner = page.getByTestId('quick-view-spinner');
      await spinner.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});

      // Check if error state
      const hasError = await page.getByTestId('quick-view-error').isVisible().catch(() => false);
      if (hasError) {
        test.skip(true, 'Product unavailable in sandbox — cannot verify product details');
        return;
      }

      // ProductView should render with product information
      // Look for Add to Cart button — always present in ProductView
      const addToCartBtn = modal.getByRole('button', { name: /add to cart/i });
      const hasAddToCart = await addToCartBtn.isVisible().catch(() => false);

      // Look for "View Full Details" link (showFullLink=true)
      const fullDetailsLink = modal.getByRole('link', { name: /full details/i });
      const hasFullDetails = await fullDetailsLink.isVisible().catch(() => false);

      // At least one product UI element should be present
      expect(hasAddToCart || hasFullDetails).toBeTruthy();
    });

    test('"View Full Details" link points to PDP', async ({ page }) => {
      await navigateToPLP(page);
      await assertNoCrashPage(page, 'navigating to PLP');

      const quickViewBtn = page.getByTestId('quick-view-btn').first();
      await quickViewBtn.click({ force: true });

      const modal = page.getByTestId('quick-view-modal');
      await modal.waitFor({ state: 'visible', timeout: 15000 });

      // Wait for loading to finish
      const spinner = page.getByTestId('quick-view-spinner');
      await spinner.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});

      // Skip if product unavailable
      const hasError = await page.getByTestId('quick-view-error').isVisible().catch(() => false);
      if (hasError) {
        test.skip(true, 'Product unavailable in sandbox — cannot test PDP link');
        return;
      }

      // Find "View Full Details" link
      const fullDetailsLink = modal.getByRole('link', { name: /full details/i });
      const linkVisible = await fullDetailsLink.isVisible().catch(() => false);

      if (linkVisible) {
        const href = await fullDetailsLink.getAttribute('href');
        expect(href).toBeTruthy();
        // Link should point to a product page (/product/...)
        expect(href).toMatch(/\/product\//);
      }
    });
  });

  test.describe('Edge Cases', () => {
    test('PLP remains functional after opening and closing Quick View', async ({ page }) => {
      await navigateToPLP(page);
      await assertNoCrashPage(page, 'navigating to PLP');

      // Open Quick View
      const quickViewBtn = page.getByTestId('quick-view-btn').first();
      await quickViewBtn.click({ force: true });

      const modal = page.getByTestId('quick-view-modal');
      await modal.waitFor({ state: 'visible', timeout: 15000 });

      // Close modal
      await page.keyboard.press('Escape');
      await expect(modal).toBeHidden({ timeout: 5000 });

      // PLP should still be intact
      await assertNoCrashPage(page, 'closing Quick View modal');
      const buttonsAfter = page.getByTestId('quick-view-btn');
      const countAfter = await buttonsAfter.count();
      expect(countAfter).toBeGreaterThan(0);
    });

    test('multiple Quick View open/close cycles work correctly', async ({ page }) => {
      await navigateToPLP(page);
      await assertNoCrashPage(page, 'navigating to PLP');

      const quickViewBtn = page.getByTestId('quick-view-btn').first();
      const modal = page.getByTestId('quick-view-modal');

      // Cycle 1: open then close
      await quickViewBtn.click({ force: true });
      await modal.waitFor({ state: 'visible', timeout: 15000 });
      await page.keyboard.press('Escape');
      await expect(modal).toBeHidden({ timeout: 5000 });

      // Cycle 2: open then close again
      await quickViewBtn.click({ force: true });
      await modal.waitFor({ state: 'visible', timeout: 15000 });
      await page.keyboard.press('Escape');
      await expect(modal).toBeHidden({ timeout: 5000 });

      // PLP still functional
      await assertNoCrashPage(page, 'multiple Quick View cycles');
    });
  });
});
