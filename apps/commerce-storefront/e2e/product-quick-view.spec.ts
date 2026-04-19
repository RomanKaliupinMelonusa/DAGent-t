import {test, expect, type Page} from '@playwright/test';

/**
 * E2E tests for the Product Quick View feature.
 *
 * Validates the Quick View overlay bar on product tiles and the
 * QuickViewModal that opens when the bar is clicked. Tests run
 * against the local dev server (localhost:3000) via Playwright's
 * webServer configuration.
 *
 * data-testid contract:
 *   - quick-view-btn     → overlay bar button on each product tile
 *   - quick-view-modal   → modal content wrapper
 *   - quick-view-spinner → loading spinner inside modal
 *   - quick-view-error   → error/unavailable state inside modal
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
        failedRequests.push(
            `${req.method()} ${req.url()} - ${req.failure()?.errorText}`
        );
    });
});

test.afterEach(async ({page}, testInfo) => {
    if (testInfo.status !== 'passed') {
        console.log(
            `\n--- Browser Diagnostics for "${testInfo.title}" ---`
        );
        if (consoleErrors.length > 0) {
            console.log('Console errors:', consoleErrors);
        }
        if (failedRequests.length > 0) {
            console.log('Failed requests:', failedRequests);
        }
        await page
            .screenshot({
                path: `test-results/failure-${testInfo.title.replace(/\s+/g, '-')}.png`,
            })
            .catch(() => {
                /* screenshot may fail if page crashed */
            });
    }
});

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Navigate to a Product Listing Page (category page) with product tiles.
 * Tries known PLP routes, falling back to finding a nav category link.
 */
async function navigateToPLP(page: Page): Promise<void> {
    // Navigate to homepage first
    await page.goto('/', {waitUntil: 'domcontentloaded'});

    // Try to find a category nav link and click it to get to a PLP
    const navLink = page
        .locator('nav a, [role="navigation"] a')
        .first();

    if (await navLink.isVisible({timeout: 15_000})) {
        await navLink.click();
        await page.waitForLoadState('domcontentloaded');
    }

    // Wait for at least one product tile to appear (confirming PLP loaded)
    await page
        .locator('[data-testid="product-tile"], .product-tile, article')
        .first()
        .waitFor({state: 'visible', timeout: 30_000});
}

/**
 * Check for the PWA Kit crash page after an action.
 * Throws a structured error with the stack trace if detected.
 */
async function assertNoCrashPage(
    page: Page,
    actionDescription: string
): Promise<void> {
    const crashHeading = page.getByRole('heading', {
        name: /this page isn't working/i,
    });
    const hasCrash = await crashHeading
        .waitFor({state: 'visible', timeout: 2000})
        .then(() => true)
        .catch(() => false);
    if (hasCrash) {
        const stack = await page
            .locator('pre')
            .textContent()
            .catch(() => 'no stack');
        throw new Error(
            `PWA Kit crash page detected after "${actionDescription}". Stack: ${stack}`
        );
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────

test.describe('Product Quick View', () => {
    test.describe('Quick View Button on PLP', () => {
        test('product tiles display the Quick View overlay button', async ({
            page,
        }) => {
            await navigateToPLP(page);

            // At least one Quick View button should be present on the PLP
            const quickViewBtns = page.getByTestId('quick-view-btn');
            await quickViewBtns.first().waitFor({state: 'attached', timeout: 15_000});

            const count = await quickViewBtns.count();
            expect(count).toBeGreaterThan(0);
        });

        test('Quick View button has accessible aria-label', async ({
            page,
        }) => {
            await navigateToPLP(page);

            const quickViewBtn = page.getByTestId('quick-view-btn').first();
            await quickViewBtn.waitFor({state: 'attached', timeout: 15_000});

            const ariaLabel = await quickViewBtn.getAttribute('aria-label');
            expect(ariaLabel).toBeTruthy();
            expect(ariaLabel).toMatch(/Quick View/i);
        });

        test('Quick View button contains "Quick View" text', async ({
            page,
        }) => {
            await navigateToPLP(page);

            const quickViewBtn = page.getByTestId('quick-view-btn').first();
            await quickViewBtn.waitFor({state: 'attached', timeout: 15_000});

            await expect(quickViewBtn).toContainText('Quick View');
        });
    });

    test.describe('Quick View Modal', () => {
        test('clicking Quick View opens the modal with product details', async ({
            page,
        }) => {
            await navigateToPLP(page);

            // Record current URL to verify no navigation occurs
            const plpUrl = page.url();

            // Click the first Quick View button
            const quickViewBtn = page.getByTestId('quick-view-btn').first();
            await quickViewBtn.waitFor({state: 'visible', timeout: 15_000});
            await quickViewBtn.click();

            // Three-outcome assertion pattern (MANDATORY for modals)
            const content = page.getByTestId('quick-view-modal');
            const errorState = page.getByTestId('quick-view-error');
            const crashPage = page.getByRole('heading', {
                name: /this page isn't working/i,
            });

            const winner = await Promise.race([
                content
                    .waitFor({state: 'visible', timeout: 15_000})
                    .then(() => 'content' as const),
                errorState
                    .waitFor({state: 'visible', timeout: 15_000})
                    .then(() => 'error-state' as const),
                crashPage
                    .waitFor({state: 'visible', timeout: 15_000})
                    .then(() => 'crash' as const),
            ]);

            if (winner === 'crash') {
                const stack = await page
                    .locator('pre')
                    .textContent()
                    .catch(() => 'no stack');
                throw new Error(
                    `PWA Kit crash page detected after clicking Quick View. Stack: ${stack}`
                );
            }

            // Modal should be visible (either content or error state)
            expect(['content', 'error-state']).toContain(winner);

            // URL should not have changed (no PDP navigation)
            expect(page.url()).toBe(plpUrl);
        });

        test('modal shows loading spinner then product content', async ({
            page,
        }) => {
            await navigateToPLP(page);

            const quickViewBtn = page.getByTestId('quick-view-btn').first();
            await quickViewBtn.waitFor({state: 'visible', timeout: 15_000});
            await quickViewBtn.click();

            // The modal should appear — spinner may flash briefly then content loads
            const modal = page.getByTestId('quick-view-modal');
            await modal.waitFor({state: 'visible', timeout: 15_000});

            await assertNoCrashPage(page, 'opening Quick View modal');

            // Wait for either spinner to disappear and content to load,
            // or error state to appear
            const spinner = page.getByTestId('quick-view-spinner');

            // If spinner is visible, wait for it to go away
            const spinnerVisible = await spinner
                .waitFor({state: 'visible', timeout: 3_000})
                .then(() => true)
                .catch(() => false);

            if (spinnerVisible) {
                // Spinner appeared — wait for it to disappear (product loading)
                await spinner.waitFor({state: 'hidden', timeout: 30_000});
            }

            // After loading, the modal should still be present with content
            await expect(modal).toBeVisible();
        });

        test('modal has accessible aria-label with product name', async ({
            page,
        }) => {
            await navigateToPLP(page);

            const quickViewBtn = page.getByTestId('quick-view-btn').first();
            await quickViewBtn.waitFor({state: 'visible', timeout: 15_000});
            await quickViewBtn.click();

            const modal = page.getByTestId('quick-view-modal');
            await modal.waitFor({state: 'visible', timeout: 15_000});

            const ariaLabel = await modal.getAttribute('aria-label');
            expect(ariaLabel).toBeTruthy();
            // Format is "Quick view for {productName}"
            expect(ariaLabel).toMatch(/Quick view for .+/i);
        });

        test('modal closes when close button is clicked', async ({page}) => {
            await navigateToPLP(page);

            const quickViewBtn = page.getByTestId('quick-view-btn').first();
            await quickViewBtn.waitFor({state: 'visible', timeout: 15_000});
            await quickViewBtn.click();

            const modal = page.getByTestId('quick-view-modal');
            await modal.waitFor({state: 'visible', timeout: 15_000});

            // Click the modal close button (Chakra ModalCloseButton)
            const closeBtn = modal.locator('button[aria-label="Close"]');
            await closeBtn.waitFor({state: 'visible', timeout: 5_000});
            await closeBtn.click();

            // Modal should disappear
            await modal.waitFor({state: 'hidden', timeout: 10_000});
            await expect(modal).not.toBeVisible();
        });

        test('modal closes when Escape key is pressed', async ({page}) => {
            await navigateToPLP(page);

            const quickViewBtn = page.getByTestId('quick-view-btn').first();
            await quickViewBtn.waitFor({state: 'visible', timeout: 15_000});
            await quickViewBtn.click();

            const modal = page.getByTestId('quick-view-modal');
            await modal.waitFor({state: 'visible', timeout: 15_000});

            // Press Escape to close the modal
            await page.keyboard.press('Escape');

            // Modal should disappear
            await modal.waitFor({state: 'hidden', timeout: 10_000});
            await expect(modal).not.toBeVisible();
        });

        test('URL does not change after opening and closing Quick View', async ({
            page,
        }) => {
            await navigateToPLP(page);

            const plpUrl = page.url();

            // Open Quick View
            const quickViewBtn = page.getByTestId('quick-view-btn').first();
            await quickViewBtn.waitFor({state: 'visible', timeout: 15_000});
            await quickViewBtn.click();

            const modal = page.getByTestId('quick-view-modal');
            await modal.waitFor({state: 'visible', timeout: 15_000});

            // URL should still be the PLP
            expect(page.url()).toBe(plpUrl);

            // Close the modal
            await page.keyboard.press('Escape');
            await modal.waitFor({state: 'hidden', timeout: 10_000});

            // URL should still be the PLP after closing
            expect(page.url()).toBe(plpUrl);
        });
    });

    test.describe('Quick View Modal Content', () => {
        test('modal displays product details after loading', async ({
            page,
        }) => {
            await navigateToPLP(page);

            const quickViewBtn = page.getByTestId('quick-view-btn').first();
            await quickViewBtn.waitFor({state: 'visible', timeout: 15_000});
            await quickViewBtn.click();

            const modal = page.getByTestId('quick-view-modal');
            await modal.waitFor({state: 'visible', timeout: 15_000});

            // Wait for spinner to disappear (content loaded)
            const spinner = page.getByTestId('quick-view-spinner');
            const spinnerVisible = await spinner
                .waitFor({state: 'visible', timeout: 3_000})
                .then(() => true)
                .catch(() => false);
            if (spinnerVisible) {
                await spinner.waitFor({state: 'hidden', timeout: 30_000});
            }

            await assertNoCrashPage(page, 'Quick View content load');

            // Check for error state — if product unavailable, that's a valid outcome
            const errorState = page.getByTestId('quick-view-error');
            const isError = await errorState
                .waitFor({state: 'visible', timeout: 2_000})
                .then(() => true)
                .catch(() => false);

            if (!isError) {
                // Product loaded successfully — verify key elements inside modal
                // ProductView should render product name (h2 heading)
                const productHeading = modal.locator('h2, [data-testid="product-name"]').first();
                await expect(productHeading).toBeVisible({timeout: 10_000});

                // ProductView should render an Add to Cart button
                const addToCartBtn = modal
                    .locator('button')
                    .filter({hasText: /add to cart/i})
                    .first();
                await expect(addToCartBtn).toBeVisible({timeout: 5_000});
            }
        });

        test('modal shows "View Full Details" link to PDP', async ({
            page,
        }) => {
            await navigateToPLP(page);

            const quickViewBtn = page.getByTestId('quick-view-btn').first();
            await quickViewBtn.waitFor({state: 'visible', timeout: 15_000});
            await quickViewBtn.click();

            const modal = page.getByTestId('quick-view-modal');
            await modal.waitFor({state: 'visible', timeout: 15_000});

            // Wait for content to load
            const spinner = page.getByTestId('quick-view-spinner');
            const spinnerVisible = await spinner
                .waitFor({state: 'visible', timeout: 3_000})
                .then(() => true)
                .catch(() => false);
            if (spinnerVisible) {
                await spinner.waitFor({state: 'hidden', timeout: 30_000});
            }

            await assertNoCrashPage(page, 'Quick View content load');

            // Check for error state
            const errorState = page.getByTestId('quick-view-error');
            const isError = await errorState
                .waitFor({state: 'visible', timeout: 2_000})
                .then(() => true)
                .catch(() => false);

            if (!isError) {
                // Look for "View Full Details" link inside the modal
                const fullDetailsLink = modal
                    .locator('a')
                    .filter({hasText: /full details/i})
                    .first();
                await expect(fullDetailsLink).toBeVisible({timeout: 5_000});

                // The link should point to a product page
                const href = await fullDetailsLink.getAttribute('href');
                expect(href).toMatch(/\/product\//);
            }
        });
    });

    test.describe('Edge Cases', () => {
        test('can open Quick View on multiple different products', async ({
            page,
        }) => {
            await navigateToPLP(page);

            const quickViewBtns = page.getByTestId('quick-view-btn');
            const count = await quickViewBtns.count();

            if (count >= 2) {
                // Open Quick View on first product
                await quickViewBtns.nth(0).click();
                const modal = page.getByTestId('quick-view-modal');
                await modal.waitFor({state: 'visible', timeout: 15_000});

                await assertNoCrashPage(page, 'opening first Quick View');

                // Close it
                await page.keyboard.press('Escape');
                await modal.waitFor({state: 'hidden', timeout: 10_000});

                // Open Quick View on second product
                await quickViewBtns.nth(1).click();
                await modal.waitFor({state: 'visible', timeout: 15_000});

                await assertNoCrashPage(page, 'opening second Quick View');

                // Modal should be showing for the second product
                await expect(modal).toBeVisible();

                // Close it
                await page.keyboard.press('Escape');
                await modal.waitFor({state: 'hidden', timeout: 10_000});
            }
        });
    });
});
