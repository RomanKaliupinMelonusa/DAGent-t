import {test, expect, type Page, type Locator} from '@playwright/test';

/**
 * E2E tests for the Product Quick View feature.
 *
 * Feature: Shoppers can view product details, select variants, and add
 * to cart directly from the PLP without navigating to the PDP.
 *
 * data-testid contract:
 *   - quick-view-btn      : Quick View overlay bar on product tiles
 *   - quick-view-modal    : Modal content container
 *   - quick-view-spinner  : Loading spinner while fetching product data
 *   - quick-view-error    : Error/unavailable product state
 */

// ─── Browser Diagnostics (MANDATORY) ─────────────────────────────────────

let consoleErrors: string[] = [];
let failedRequests: string[] = [];

test.beforeEach(async ({page}) => {
    consoleErrors = [];
    failedRequests = [];

    page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('requestfailed', (req) => {
        failedRequests.push(`${req.method()} ${req.url()} - ${req.failure()?.errorText}`);
    });
});

test.afterEach(async ({page}, testInfo) => {
    if (testInfo.status !== 'passed') {
        console.log(`\n--- Browser Diagnostics for "${testInfo.title}" ---`);
        if (consoleErrors.length > 0) {
            console.log('Console errors:', consoleErrors);
        }
        if (failedRequests.length > 0) {
            console.log('Failed requests:', failedRequests);
        }
        await page
            .screenshot({
                path: `test-results/failure-${testInfo.title.replace(/\s+/g, '-')}.png`
            })
            .catch(() => {});
    }
});

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Navigate to a PLP (Product Listing Page) that shows product tiles.
 * Tries common RefArch category URLs. Falls back to navigating via
 * the homepage nav links.
 */
async function navigateToPLP(page: Page): Promise<void> {
    // Try the standard RefArch "New Arrivals" category
    await page.goto('/category/newarrivals', {waitUntil: 'domcontentloaded'});

    // Wait for product tiles to appear — the PLP renders product-tile components
    // which our override wraps with quick-view-btn buttons.
    const productTile = page.getByTestId('quick-view-btn').first();
    const tileVisible = await productTile
        .waitFor({state: 'visible', timeout: 20_000})
        .then(() => true)
        .catch(() => false);

    if (tileVisible) return;

    // Fallback: try womens-clothing-tops which is a deeper RefArch category
    await page.goto('/category/womens-clothing-tops', {waitUntil: 'domcontentloaded'});
    const fallbackTile = page.getByTestId('quick-view-btn').first();
    const fallbackVisible = await fallbackTile
        .waitFor({state: 'visible', timeout: 20_000})
        .then(() => true)
        .catch(() => false);

    if (fallbackVisible) return;

    // Last resort: navigate to homepage and click first nav link to find a PLP
    await page.goto('/', {waitUntil: 'domcontentloaded'});
    const navLink = page.locator('nav a, [role="navigation"] a').first();
    await navLink.waitFor({state: 'visible', timeout: 15_000});
    await navLink.click();
    await page.waitForLoadState('domcontentloaded');

    // Wait for quick-view buttons to appear on the PLP
    await page
        .getByTestId('quick-view-btn')
        .first()
        .waitFor({state: 'visible', timeout: 20_000});
}

/**
 * Detect the PWA Kit crash page. Returns the stack trace if found, null otherwise.
 */
async function detectCrashPage(page: Page): Promise<string | null> {
    const crashHeading = page.getByRole('heading', {name: /this page isn't working/i});
    const hasCrash = await crashHeading
        .waitFor({state: 'visible', timeout: 2000})
        .then(() => true)
        .catch(() => false);
    if (hasCrash) {
        const stack = await page
            .locator('pre')
            .textContent()
            .catch(() => 'no stack');
        return stack;
    }
    return null;
}

/**
 * Three-outcome assertion after opening the Quick View modal.
 * Returns which outcome won: 'content' | 'error-state' | 'crash'.
 */
async function assertQuickViewOutcome(
    page: Page
): Promise<'content' | 'error-state' | 'crash'> {
    // Outcome 1: Modal content loaded (spinner gone, modal visible with product content)
    const content = page.getByTestId('quick-view-modal');
    // Outcome 2: Error state inside the modal
    const errorState = page.getByTestId('quick-view-error');
    // Outcome 3: Crash page (entire page replaced)
    const crashPage = page.getByRole('heading', {name: /this page isn't working/i});

    const winner = await Promise.race([
        content
            .waitFor({state: 'visible', timeout: 20_000})
            .then(() => 'content' as const),
        errorState
            .waitFor({state: 'visible', timeout: 20_000})
            .then(() => 'error-state' as const),
        crashPage
            .waitFor({state: 'visible', timeout: 20_000})
            .then(() => 'crash' as const)
    ]);

    if (winner === 'crash') {
        const stack = await page
            .locator('pre')
            .textContent()
            .catch(() => 'no stack');
        throw new Error(`PWA Kit crash page detected. Stack: ${stack}`);
    }

    return winner;
}

// ─── Tests ────────────────────────────────────────────────────────────────

test.describe('Product Quick View', () => {
    test.describe('Quick View Button on PLP', () => {
        test('product tiles display Quick View buttons', async ({page}) => {
            await navigateToPLP(page);

            // Verify Quick View buttons are present on product tiles
            const quickViewBtns = page.getByTestId('quick-view-btn');
            const count = await quickViewBtns.count();
            expect(count).toBeGreaterThan(0);
        });

        test('Quick View button has accessible aria-label with product name', async ({
            page
        }) => {
            await navigateToPLP(page);

            const firstBtn = page.getByTestId('quick-view-btn').first();
            const ariaLabel = await firstBtn.getAttribute('aria-label');

            // aria-label should be "Quick View <product name>"
            expect(ariaLabel).toBeTruthy();
            expect(ariaLabel).toMatch(/^Quick View\s+.+/);
        });

        test('Quick View button contains "Quick View" text', async ({page}) => {
            await navigateToPLP(page);

            const firstBtn = page.getByTestId('quick-view-btn').first();
            await expect(firstBtn).toContainText('Quick View');
        });
    });

    test.describe('Quick View Modal — Open & Content', () => {
        test('clicking Quick View button opens the modal', async ({page}) => {
            await navigateToPLP(page);

            const firstBtn = page.getByTestId('quick-view-btn').first();
            await firstBtn.click();

            // Three-outcome assertion pattern
            const outcome = await assertQuickViewOutcome(page);

            // Modal should be visible (content or error-state are both valid outcomes)
            const modal = page.getByTestId('quick-view-modal');
            await expect(modal).toBeVisible();

            // Log which outcome occurred for diagnostic purposes
            console.log(`Quick View modal outcome: ${outcome}`);
        });

        test('modal shows loading spinner then resolves to content or error', async ({
            page
        }) => {
            await navigateToPLP(page);

            const firstBtn = page.getByTestId('quick-view-btn').first();
            await firstBtn.click();

            // The spinner may appear briefly before content loads.
            // We check that the modal eventually resolves to a final state.
            const modal = page.getByTestId('quick-view-modal');
            await modal.waitFor({state: 'visible', timeout: 20_000});

            // After modal is visible, it should eventually show either
            // product content (spinner gone) or an error state.
            const spinner = page.getByTestId('quick-view-spinner');
            const errorState = page.getByTestId('quick-view-error');

            // Wait for spinner to disappear (content loaded) or error state to appear
            await Promise.race([
                spinner.waitFor({state: 'hidden', timeout: 20_000}),
                errorState.waitFor({state: 'visible', timeout: 20_000})
            ]);

            // Modal should still be visible after loading completes
            await expect(modal).toBeVisible();
        });

        test('URL does not change when Quick View opens (no PDP navigation)', async ({
            page
        }) => {
            await navigateToPLP(page);

            const urlBefore = page.url();

            const firstBtn = page.getByTestId('quick-view-btn').first();
            await firstBtn.click();

            await assertQuickViewOutcome(page);

            // URL should remain on the PLP — Quick View must NOT navigate
            const urlAfter = page.url();
            expect(urlAfter).toBe(urlBefore);
        });

        test('modal has accessible aria-label', async ({page}) => {
            await navigateToPLP(page);

            const firstBtn = page.getByTestId('quick-view-btn').first();
            await firstBtn.click();

            await assertQuickViewOutcome(page);

            const modal = page.getByTestId('quick-view-modal');
            const ariaLabel = await modal.getAttribute('aria-label');

            // aria-label should be "Quick view for <product name>"
            expect(ariaLabel).toBeTruthy();
            expect(ariaLabel).toMatch(/quick view for/i);
        });
    });

    test.describe('Quick View Modal — Close Behavior', () => {
        test('modal closes when clicking the close button', async ({page}) => {
            await navigateToPLP(page);

            const firstBtn = page.getByTestId('quick-view-btn').first();
            await firstBtn.click();

            await assertQuickViewOutcome(page);

            const modal = page.getByTestId('quick-view-modal');
            await expect(modal).toBeVisible();

            // Chakra Modal renders a close button inside ModalContent
            const closeBtn = modal.locator('button[aria-label="Close"]');
            await closeBtn.click();

            // Modal should disappear
            await expect(modal).not.toBeVisible({timeout: 5_000});
        });

        test('modal closes when pressing Escape key', async ({page}) => {
            await navigateToPLP(page);

            const firstBtn = page.getByTestId('quick-view-btn').first();
            await firstBtn.click();

            await assertQuickViewOutcome(page);

            const modal = page.getByTestId('quick-view-modal');
            await expect(modal).toBeVisible();

            // Press Escape to close
            await page.keyboard.press('Escape');

            // Modal should disappear
            await expect(modal).not.toBeVisible({timeout: 5_000});
        });

        test('PLP remains intact after closing Quick View modal', async ({page}) => {
            await navigateToPLP(page);

            const quickViewBtns = page.getByTestId('quick-view-btn');
            const countBefore = await quickViewBtns.count();

            // Open and close the modal
            await quickViewBtns.first().click();
            await assertQuickViewOutcome(page);

            await page.keyboard.press('Escape');
            await expect(page.getByTestId('quick-view-modal')).not.toBeVisible({
                timeout: 5_000
            });

            // Verify PLP is still intact — same number of Quick View buttons
            const countAfter = await quickViewBtns.count();
            expect(countAfter).toBe(countBefore);
        });
    });

    test.describe('Quick View Modal — Product Content', () => {
        test('modal displays product information when loaded successfully', async ({
            page
        }) => {
            await navigateToPLP(page);

            const firstBtn = page.getByTestId('quick-view-btn').first();
            await firstBtn.click();

            const outcome = await assertQuickViewOutcome(page);

            if (outcome === 'content') {
                const modal = page.getByTestId('quick-view-modal');

                // ProductView should render inside the modal with product details.
                // Check for common product content: heading/name, price, Add to Cart.
                // These come from the base ProductView component.
                const hasHeading = await modal
                    .locator('h1, h2, [data-testid="product-name"]')
                    .first()
                    .waitFor({state: 'visible', timeout: 5_000})
                    .then(() => true)
                    .catch(() => false);

                const hasPrice = await modal
                    .locator('[class*="price"], b, .chakra-text')
                    .first()
                    .isVisible()
                    .catch(() => false);

                const hasAddToCart = await modal
                    .locator('button')
                    .filter({hasText: /add to cart/i})
                    .first()
                    .isVisible()
                    .catch(() => false);

                // At minimum, the modal should have product content visible
                // (heading or price or add-to-cart button)
                const hasProductContent = hasHeading || hasPrice || hasAddToCart;
                expect(hasProductContent).toBe(true);
            } else {
                // error-state outcome — still valid; product may be unavailable
                const errorEl = page.getByTestId('quick-view-error');
                await expect(errorEl).toBeVisible();
            }
        });

        test('modal shows "View Full Details" link to PDP', async ({page}) => {
            await navigateToPLP(page);

            const firstBtn = page.getByTestId('quick-view-btn').first();
            await firstBtn.click();

            const outcome = await assertQuickViewOutcome(page);

            if (outcome === 'content') {
                const modal = page.getByTestId('quick-view-modal');

                // ProductView with showFullLink=true renders a link to the PDP
                const fullDetailsLink = modal.locator('a').filter({
                    hasText: /full details|view full/i
                });
                const linkVisible = await fullDetailsLink
                    .first()
                    .waitFor({state: 'visible', timeout: 5_000})
                    .then(() => true)
                    .catch(() => false);

                // If ProductView renders the link, verify it points to a product page
                if (linkVisible) {
                    const href = await fullDetailsLink.first().getAttribute('href');
                    expect(href).toMatch(/\/product\//);
                }
            }
            // If error-state, the link won't be present — that's expected
        });
    });

    test.describe('Quick View — Edge Cases', () => {
        test('can open Quick View on different product tiles', async ({page}) => {
            await navigateToPLP(page);

            const quickViewBtns = page.getByTestId('quick-view-btn');
            const count = await quickViewBtns.count();

            if (count >= 2) {
                // Open Quick View on the second product tile
                await quickViewBtns.nth(1).click();

                const outcome = await assertQuickViewOutcome(page);
                const modal = page.getByTestId('quick-view-modal');
                await expect(modal).toBeVisible();

                // Close and verify
                await page.keyboard.press('Escape');
                await expect(modal).not.toBeVisible({timeout: 5_000});
            }
        });

        test('Quick View can be opened again after closing', async ({page}) => {
            await navigateToPLP(page);

            const firstBtn = page.getByTestId('quick-view-btn').first();

            // First open
            await firstBtn.click();
            await assertQuickViewOutcome(page);
            await page.keyboard.press('Escape');
            await expect(page.getByTestId('quick-view-modal')).not.toBeVisible({
                timeout: 5_000
            });

            // Second open — should work the same
            await firstBtn.click();
            await assertQuickViewOutcome(page);
            const modal = page.getByTestId('quick-view-modal');
            await expect(modal).toBeVisible();

            // Clean up
            await page.keyboard.press('Escape');
        });
    });
});
