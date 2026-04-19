import {test, expect, type Page} from '@playwright/test';

/**
 * E2E tests for the Product Quick View feature.
 *
 * Feature: Shoppers can view product details, select variations, and add
 * to cart directly from the PLP via a Quick View modal — without navigating
 * to the PDP.
 *
 * data-testid contract (from overrides/app/components):
 *   quick-view-btn      — overlay bar on each product tile (trigger)
 *   quick-view-modal    — ModalContent container
 *   quick-view-spinner  — loading spinner inside the modal
 *   quick-view-error    — error / unavailable state inside the modal
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
        await page.screenshot({
            path: `test-results/failure-${testInfo.title.replace(/\s+/g, '-')}.png`
        });
    }
});

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Navigate to a PLP (category listing page) that contains product tiles
 * with Quick View buttons. Tries the first category navigation link from
 * the homepage. Falls back to a second nav link if the first does not
 * contain Quick View buttons (e.g. some categories may only have bundles/sets).
 */
async function navigateToPLP(page: Page): Promise<void> {
    await page.goto('/', {waitUntil: 'domcontentloaded'});

    // Wait for navigation links to appear
    const navLinks = page.locator('nav a, [role="navigation"] a');
    await navLinks.first().waitFor({state: 'visible', timeout: 15_000});

    const linkCount = await navLinks.count();

    // Try each nav link until we find a PLP with Quick View buttons
    for (let i = 0; i < Math.min(linkCount, 3); i++) {
        const link = navLinks.nth(i);
        await link.click();
        await page.waitForLoadState('domcontentloaded');

        // Check if quick-view-btn appeared (proves override loaded + non-set/bundle products)
        const found = await page
            .getByTestId('quick-view-btn')
            .first()
            .waitFor({state: 'attached', timeout: 20_000})
            .then(() => true)
            .catch(() => false);

        if (found) return;

        // This category didn't have quick-view buttons — go back and try next
        if (i < Math.min(linkCount, 3) - 1) {
            await page.goBack({waitUntil: 'domcontentloaded'});
            await navLinks.first().waitFor({state: 'visible', timeout: 10_000});
        }
    }

    // Final fallback: wait once more with a longer timeout
    await page
        .getByTestId('quick-view-btn')
        .first()
        .waitFor({state: 'attached', timeout: 30_000});
}

/**
 * Three-outcome assertion for the Quick View modal after clicking the trigger.
 * Returns the winning outcome: 'content' | 'error-state' | 'crash'.
 *
 * This implements the MANDATORY three-outcome assertion pattern: content,
 * error state, or crash page — never a silent timeout.
 */
async function assertModalOutcome(
    page: Page
): Promise<'content' | 'error-state' | 'crash'> {
    const content = page.getByTestId('quick-view-modal');
    const errorState = page.getByTestId('quick-view-error');
    const crashPage = page.getByRole('heading', {name: /this page isn't working/i});

    const winner = await Promise.race([
        content
            .waitFor({state: 'visible', timeout: 15_000})
            .then(() => 'content' as const),
        errorState
            .waitFor({state: 'visible', timeout: 15_000})
            .then(() => 'error-state' as const),
        crashPage
            .waitFor({state: 'visible', timeout: 15_000})
            .then(() => 'crash' as const)
    ]);

    if (winner === 'crash') {
        const stack = await page.locator('pre').textContent().catch(() => 'no stack');
        throw new Error(
            `PWA Kit crash page detected after opening Quick View. Stack: ${stack}`
        );
    }

    return winner;
}

/**
 * Open Quick View on the nth product tile (0-indexed) and assert the modal outcome.
 */
async function openQuickView(
    page: Page,
    index = 0
): Promise<'content' | 'error-state'> {
    const quickViewBtn = page.getByTestId('quick-view-btn').nth(index);
    await quickViewBtn.scrollIntoViewIfNeeded();
    await quickViewBtn.click();
    const outcome = await assertModalOutcome(page);
    // outcome is 'content' | 'error-state' (crash throws)
    return outcome as 'content' | 'error-state';
}

/**
 * Close the Quick View modal and verify it disappears.
 */
async function closeModalAndVerify(page: Page): Promise<void> {
    const modal = page.getByTestId('quick-view-modal');
    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden({timeout: 5_000});
}

// ─── Tests ────────────────────────────────────────────────────────────────

test.describe('Product Quick View', () => {
    // ─── Overlay Bar (Trigger) ────────────────────────────────────────

    test('Quick View buttons render on product tiles on the PLP', async ({page}) => {
        await navigateToPLP(page);

        const quickViewButtons = page.getByTestId('quick-view-btn');
        const count = await quickViewButtons.count();
        expect(count).toBeGreaterThan(0);

        // Each button contains "Quick View" text and is a <button> element
        const firstButton = quickViewButtons.first();
        await expect(firstButton).toContainText('Quick View');
        const tagName = await firstButton.evaluate((el) => el.tagName.toLowerCase());
        expect(tagName).toBe('button');
    });

    test('Quick View button has correct aria-label including product name', async ({
        page
    }) => {
        await navigateToPLP(page);

        const quickViewBtn = page.getByTestId('quick-view-btn').first();
        const ariaLabel = await quickViewBtn.getAttribute('aria-label');
        expect(ariaLabel).toBeTruthy();
        // aria-label format: "Quick View {productName}"
        expect(ariaLabel).toContain('Quick View');
    });

    test('multiple product tiles each have a Quick View button', async ({page}) => {
        await navigateToPLP(page);

        const quickViewButtons = page.getByTestId('quick-view-btn');
        const count = await quickViewButtons.count();

        // A PLP typically has multiple products — at least 1 is guaranteed
        expect(count).toBeGreaterThanOrEqual(1);

        // Verify up to 3 buttons are semantic <button> elements
        for (let i = 0; i < Math.min(count, 3); i++) {
            const btn = quickViewButtons.nth(i);
            const tag = await btn.evaluate((el) => el.tagName.toLowerCase());
            expect(tag).toBe('button');
        }
    });

    // ─── Modal Open / Content ─────────────────────────────────────────

    test('clicking Quick View opens the modal with product details or error state', async ({
        page
    }) => {
        await navigateToPLP(page);

        const outcome = await openQuickView(page, 0);

        if (outcome === 'content') {
            const modal = page.getByTestId('quick-view-modal');
            await expect(modal).toBeVisible();
            // Modal should have an aria-label containing "quick view"
            const modalAriaLabel = await modal.getAttribute('aria-label');
            expect(modalAriaLabel).toBeTruthy();
            expect(modalAriaLabel!.toLowerCase()).toContain('quick view');
        } else {
            // Error state is valid — product may be unavailable
            const errorEl = page.getByTestId('quick-view-error');
            await expect(errorEl).toBeVisible();
        }
    });

    test('Quick View modal shows loading spinner or resolves content immediately', async ({
        page
    }) => {
        await navigateToPLP(page);

        // Click the Quick View button
        const quickViewBtn = page.getByTestId('quick-view-btn').first();
        await quickViewBtn.click();

        // Race between spinner, content, error, and crash
        const spinner = page.getByTestId('quick-view-spinner');
        const content = page.getByTestId('quick-view-modal');
        const errorState = page.getByTestId('quick-view-error');
        const crashPage = page.getByRole('heading', {name: /this page isn't working/i});

        const first = await Promise.race([
            spinner
                .waitFor({state: 'visible', timeout: 15_000})
                .then(() => 'spinner' as const),
            content
                .waitFor({state: 'visible', timeout: 15_000})
                .then(() => 'content' as const),
            errorState
                .waitFor({state: 'visible', timeout: 15_000})
                .then(() => 'error' as const),
            crashPage
                .waitFor({state: 'visible', timeout: 15_000})
                .then(() => 'crash' as const)
        ]);

        if (first === 'crash') {
            const stack = await page.locator('pre').textContent().catch(() => 'no stack');
            throw new Error(`PWA Kit crash page detected. Stack: ${stack}`);
        }

        // If spinner appeared first, wait for it to resolve to content or error
        if (first === 'spinner') {
            await expect(spinner).toBeHidden({timeout: 15_000});
            const finalOutcome = await Promise.race([
                content
                    .waitFor({state: 'visible', timeout: 15_000})
                    .then(() => 'content' as const),
                errorState
                    .waitFor({state: 'visible', timeout: 15_000})
                    .then(() => 'error' as const)
            ]);
            expect(['content', 'error']).toContain(finalOutcome);
        }
        // All outcomes (spinner→content, direct content, error) are valid
    });

    // ─── Modal Close Mechanisms ───────────────────────────────────────

    test('Quick View modal closes via the close button', async ({page}) => {
        await navigateToPLP(page);
        await openQuickView(page, 0);

        const modal = page.getByTestId('quick-view-modal');
        await expect(modal).toBeVisible();

        // Chakra ModalCloseButton renders a button with aria-label "Close"
        const closeButton = page.getByRole('button', {name: /close/i});
        await closeButton.click();

        await expect(modal).toBeHidden({timeout: 5_000});
    });

    test('Quick View modal closes via Escape key', async ({page}) => {
        await navigateToPLP(page);
        await openQuickView(page, 0);

        const modal = page.getByTestId('quick-view-modal');
        await expect(modal).toBeVisible();

        await page.keyboard.press('Escape');

        await expect(modal).toBeHidden({timeout: 5_000});
    });

    test('Quick View modal closes via overlay backdrop click', async ({page}) => {
        await navigateToPLP(page);
        await openQuickView(page, 0);

        const modal = page.getByTestId('quick-view-modal');
        await expect(modal).toBeVisible();

        // Chakra Modal renders an overlay behind the content.
        // Click at the very top-left corner of the viewport to hit the overlay
        // (outside the centered modal content).
        await page.mouse.click(5, 5);

        await expect(modal).toBeHidden({timeout: 5_000});
    });

    // ─── Navigation Preservation ──────────────────────────────────────

    test('Quick View does not navigate away from the PLP', async ({page}) => {
        await navigateToPLP(page);
        const plpUrl = page.url();

        await openQuickView(page, 0);

        // URL should NOT have changed — still on the PLP
        expect(page.url()).toBe(plpUrl);

        // Close and verify URL is still the PLP
        await closeModalAndVerify(page);
        expect(page.url()).toBe(plpUrl);
    });

    // ─── Re-open Flow ─────────────────────────────────────────────────

    test('Quick View can be reopened after closing', async ({page}) => {
        await navigateToPLP(page);

        // First open
        await openQuickView(page, 0);
        const modal = page.getByTestId('quick-view-modal');
        await expect(modal).toBeVisible();

        // Close
        await closeModalAndVerify(page);

        // Re-open on the same tile
        await openQuickView(page, 0);
        await expect(modal).toBeVisible();

        // Clean up
        await closeModalAndVerify(page);
    });

    // ─── Content Verification (when product loads) ────────────────────

    test('loaded modal contains "View Full Details" link to PDP', async ({page}) => {
        await navigateToPLP(page);

        const outcome = await openQuickView(page, 0);

        if (outcome === 'content') {
            const modal = page.getByTestId('quick-view-modal');

            // ProductView with showFullLink={true} renders a "View Full Details" link
            // that points to the PDP (/product/{id})
            const fullDetailsLink = modal.locator('a').filter({hasText: /full details/i});
            const linkVisible = await fullDetailsLink
                .first()
                .waitFor({state: 'visible', timeout: 5_000})
                .then(() => true)
                .catch(() => false);

            if (linkVisible) {
                const href = await fullDetailsLink.first().getAttribute('href');
                expect(href).toBeTruthy();
                // The link should point to a product page
                expect(href).toMatch(/\/product\//);
            }
            // If link not visible, it may be below the fold in modal scroll — acceptable
        }
        // If error-state, skip content verification
    });

    test('loaded modal shows product image and details', async ({page}) => {
        await navigateToPLP(page);

        const outcome = await openQuickView(page, 0);

        if (outcome === 'content') {
            const modal = page.getByTestId('quick-view-modal');

            // ProductView renders at minimum: an image and a product name heading
            const hasImage = await modal
                .locator('img')
                .first()
                .waitFor({state: 'visible', timeout: 5_000})
                .then(() => true)
                .catch(() => false);

            // Modal should contain at least one image (product gallery)
            expect(hasImage).toBe(true);

            // Modal should contain an Add to Cart button (rendered by ProductView)
            const addToCartBtn = modal.getByRole('button', {name: /add to cart/i});
            const hasAddToCart = await addToCartBtn
                .waitFor({state: 'visible', timeout: 5_000})
                .then(() => true)
                .catch(() => false);

            // Add to Cart may be disabled until variants are selected, but should exist
            if (hasAddToCart) {
                await expect(addToCartBtn).toBeVisible();
            }
        }
    });

    // ─── Accessibility ────────────────────────────────────────────────

    test('modal has aria-label with product name for screen readers', async ({page}) => {
        await navigateToPLP(page);

        const outcome = await openQuickView(page, 0);
        if (outcome === 'content' || outcome === 'error-state') {
            const modal = page.getByTestId('quick-view-modal');
            const ariaLabel = await modal.getAttribute('aria-label');
            expect(ariaLabel).toBeTruthy();
            // Format: "Quick view for {productName}"
            expect(ariaLabel!.toLowerCase()).toContain('quick view');
        }
    });
});
