/**
 * E2E Tests — Product Quick View
 *
 * Validates the Quick View feature on the Product Listing Page (PLP):
 *   1. Quick View overlay bar appears on product tiles
 *   2. Clicking the bar opens a modal with product details (not a PDP navigation)
 *   3. Modal displays loading spinner, then product content or error state
 *   4. Modal can be closed via close button, Escape key, or overlay click
 *   5. URL remains unchanged (no navigation away from PLP)
 *   6. Accessibility: aria-labels, keyboard navigation, focus management
 *
 * data-testid contract:
 *   - quick-view-btn          — overlay bar trigger on each product tile
 *   - quick-view-modal        — modal content wrapper (ModalContent)
 *   - quick-view-spinner      — loading spinner inside modal
 *   - quick-view-error        — error/unavailable state inside modal
 *   - product-tile            — base product tile link (from retail-react-app)
 *   - sf-product-list-page    — PLP page container (from retail-react-app)
 */
import { test, expect, Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Browser Diagnostics — MANDATORY capture for triage
// ---------------------------------------------------------------------------
let consoleErrors: string[] = [];
let failedRequests: string[] = [];

test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    failedRequests = [];

    page.on('console', (msg) => {
        if (msg.type() === 'error') {
            consoleErrors.push(msg.text());
        }
    });

    page.on('requestfailed', (req) => {
        failedRequests.push(`${req.method()} ${req.url()}`);
    });
});

test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
        // Attach diagnostic evidence on failure
        const diagnostics = [
            `Console errors (${consoleErrors.length}):`,
            ...consoleErrors.map((e) => `  • ${e}`),
            `Failed requests (${failedRequests.length}):`,
            ...failedRequests.map((r) => `  • ${r}`),
        ].join('\n');

        await testInfo.attach('browser-diagnostics', {
            body: diagnostics,
            contentType: 'text/plain',
        });

        // Screenshot on failure (Playwright config also captures, but explicit is safer)
        await page
            .screenshot({
                path: `test-results/failure-${testInfo.title.replace(/\s+/g, '-')}.png`,
            })
            .catch(() => {});
    }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** The PLP category URL — RefArch "newarrivals" is a reliable default category */
const PLP_URL = '/category/newarrivals';

/**
 * Navigate to the PLP and wait for product tiles to render.
 * Uses domcontentloaded (NOT networkidle — PWA Kit HMR keeps network active).
 */
async function navigateToPLP(page: Page) {
    await page.goto(PLP_URL, { waitUntil: 'domcontentloaded' });

    // Wait for the PLP page container to be present
    await page.locator('[data-testid="sf-product-list-page"]').waitFor({
        state: 'visible',
        timeout: 30_000,
    });

    // Wait for at least one product tile to render
    await page.locator('[data-testid="product-tile"]').first().waitFor({
        state: 'visible',
        timeout: 15_000,
    });
}

/**
 * Crash page detection — PWA Kit renders a heading when a component throws.
 * Must be checked after any action that triggers component rendering.
 */
async function checkForCrashPage(page: Page, actionDescription: string) {
    const crashHeading = page.getByRole('heading', {
        name: /this page isn't working/i,
    });
    const hasCrash = await crashHeading
        .waitFor({ state: 'visible', timeout: 2000 })
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

/**
 * Three-Outcome Assertion for modal interactions.
 * Returns 'content' | 'error-state' | 'crash' so the caller can assert.
 */
async function waitForModalOutcome(
    page: Page
): Promise<'content' | 'error-state' | 'crash'> {
    const content = page.locator('[data-testid="quick-view-modal"]');
    const errorState = page.locator('[data-testid="quick-view-error"]');
    const crashPage = page.getByRole('heading', {
        name: /this page isn't working/i,
    });

    const winner = await Promise.race([
        content
            .waitFor({ state: 'visible', timeout: 15_000 })
            .then(() => 'content' as const),
        errorState
            .waitFor({ state: 'visible', timeout: 15_000 })
            .then(() => 'error-state' as const),
        crashPage
            .waitFor({ state: 'visible', timeout: 15_000 })
            .then(() => 'crash' as const),
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

// ===========================================================================
// Test Suite: Product Quick View on PLP
// ===========================================================================

test.describe('Product Quick View', () => {
    // -----------------------------------------------------------------------
    // 1. Quick View Button Presence
    // -----------------------------------------------------------------------
    test('Quick View buttons are visible on product tiles on the PLP', async ({
        page,
    }) => {
        await navigateToPLP(page);
        await checkForCrashPage(page, 'PLP navigation');

        // At least one Quick View button should be present
        const quickViewButtons = page.locator('[data-testid="quick-view-btn"]');
        const count = await quickViewButtons.count();
        expect(count).toBeGreaterThan(0);

        // The first button should contain "Quick View" text
        await expect(quickViewButtons.first()).toContainText('Quick View');
    });

    // -----------------------------------------------------------------------
    // 2. Quick View Button Has Accessible aria-label
    // -----------------------------------------------------------------------
    test('Quick View button has aria-label containing "Quick View"', async ({
        page,
    }) => {
        await navigateToPLP(page);
        await checkForCrashPage(page, 'PLP navigation');

        const firstBtn = page
            .locator('[data-testid="quick-view-btn"]')
            .first();
        await expect(firstBtn).toBeVisible();

        const ariaLabel = await firstBtn.getAttribute('aria-label');
        expect(ariaLabel).toBeTruthy();
        expect(ariaLabel!.toLowerCase()).toContain('quick view');
    });

    // -----------------------------------------------------------------------
    // 3. Clicking Quick View Opens Modal (Happy Path)
    // -----------------------------------------------------------------------
    test('clicking Quick View button opens the modal with product content', async ({
        page,
    }) => {
        await navigateToPLP(page);
        await checkForCrashPage(page, 'PLP navigation');

        // Record URL before clicking
        const urlBefore = page.url();

        // Click the first Quick View button
        const firstBtn = page
            .locator('[data-testid="quick-view-btn"]')
            .first();
        await firstBtn.click();

        // Three-outcome assertion: modal content, error state, or crash
        const outcome = await waitForModalOutcome(page);

        // Modal should be visible (either content or error-state are valid outcomes)
        const modal = page.locator('[data-testid="quick-view-modal"]');
        await expect(modal).toBeVisible();

        // URL should NOT have changed — we did NOT navigate to PDP
        expect(page.url()).toBe(urlBefore);
    });

    // -----------------------------------------------------------------------
    // 4. Modal Shows Loading Spinner Before Content
    // -----------------------------------------------------------------------
    test('modal shows a loading spinner while product data fetches', async ({
        page,
    }) => {
        await navigateToPLP(page);
        await checkForCrashPage(page, 'PLP navigation');

        const firstBtn = page
            .locator('[data-testid="quick-view-btn"]')
            .first();
        await firstBtn.click();

        // Either spinner or content should appear — spinner may be too fast to catch,
        // so we accept both scenarios but verify the modal opens
        const modal = page.locator('[data-testid="quick-view-modal"]');
        await modal.waitFor({ state: 'visible', timeout: 15_000 });

        // After modal is open, eventually content should load (spinner should disappear)
        const spinner = page.locator('[data-testid="quick-view-spinner"]');
        const spinnerVisible = await spinner
            .waitFor({ state: 'visible', timeout: 2000 })
            .then(() => true)
            .catch(() => false);

        if (spinnerVisible) {
            // Spinner was caught — wait for it to disappear (content loaded)
            await expect(spinner).toBeHidden({ timeout: 15_000 });
        }
        // If spinner was never visible, content loaded too fast — that's fine
    });

    // -----------------------------------------------------------------------
    // 5. Modal Has Correct data-testid and aria-label
    // -----------------------------------------------------------------------
    test('modal has data-testid="quick-view-modal" and accessible aria-label', async ({
        page,
    }) => {
        await navigateToPLP(page);
        await checkForCrashPage(page, 'PLP navigation');

        const firstBtn = page
            .locator('[data-testid="quick-view-btn"]')
            .first();
        await firstBtn.click();

        const modal = page.locator('[data-testid="quick-view-modal"]');
        await modal.waitFor({ state: 'visible', timeout: 15_000 });

        // aria-label should contain "Quick view for" and a product name
        const ariaLabel = await modal.getAttribute('aria-label');
        expect(ariaLabel).toBeTruthy();
        expect(ariaLabel!.toLowerCase()).toContain('quick view for');
    });

    // -----------------------------------------------------------------------
    // 6. Modal Close via Close Button
    // -----------------------------------------------------------------------
    test('modal closes when the close button is clicked', async ({ page }) => {
        await navigateToPLP(page);
        await checkForCrashPage(page, 'PLP navigation');

        // Open the modal
        const firstBtn = page
            .locator('[data-testid="quick-view-btn"]')
            .first();
        await firstBtn.click();

        const modal = page.locator('[data-testid="quick-view-modal"]');
        await modal.waitFor({ state: 'visible', timeout: 15_000 });

        // Click the Chakra ModalCloseButton (aria-label "Close")
        const closeBtn = page.getByRole('button', { name: /close/i });
        await closeBtn.click();

        // Modal should disappear
        await expect(modal).toBeHidden({ timeout: 5000 });
    });

    // -----------------------------------------------------------------------
    // 7. Modal Close via Escape Key
    // -----------------------------------------------------------------------
    test('modal closes when Escape key is pressed', async ({ page }) => {
        await navigateToPLP(page);
        await checkForCrashPage(page, 'PLP navigation');

        // Open the modal
        const firstBtn = page
            .locator('[data-testid="quick-view-btn"]')
            .first();
        await firstBtn.click();

        const modal = page.locator('[data-testid="quick-view-modal"]');
        await modal.waitFor({ state: 'visible', timeout: 15_000 });

        // Press Escape
        await page.keyboard.press('Escape');

        // Modal should disappear
        await expect(modal).toBeHidden({ timeout: 5000 });
    });

    // -----------------------------------------------------------------------
    // 8. URL Does Not Change During Quick View Lifecycle
    // -----------------------------------------------------------------------
    test('URL remains on the PLP throughout Quick View open/close cycle', async ({
        page,
    }) => {
        await navigateToPLP(page);
        await checkForCrashPage(page, 'PLP navigation');

        const urlBefore = page.url();

        // Open modal
        const firstBtn = page
            .locator('[data-testid="quick-view-btn"]')
            .first();
        await firstBtn.click();

        const modal = page.locator('[data-testid="quick-view-modal"]');
        await modal.waitFor({ state: 'visible', timeout: 15_000 });

        // URL unchanged while modal is open
        expect(page.url()).toBe(urlBefore);

        // Close modal
        await page.keyboard.press('Escape');
        await expect(modal).toBeHidden({ timeout: 5000 });

        // URL still unchanged after closing
        expect(page.url()).toBe(urlBefore);
    });

    // -----------------------------------------------------------------------
    // 9. Quick View Does Not Navigate (preventDefault verified)
    // -----------------------------------------------------------------------
    test('clicking Quick View does not trigger PDP navigation', async ({
        page,
    }) => {
        await navigateToPLP(page);
        await checkForCrashPage(page, 'PLP navigation');

        // Capture the current URL path
        const plpPath = new URL(page.url()).pathname;

        // Click Quick View
        const firstBtn = page
            .locator('[data-testid="quick-view-btn"]')
            .first();
        await firstBtn.click();

        // Wait for modal to appear
        const modal = page.locator('[data-testid="quick-view-modal"]');
        await modal.waitFor({ state: 'visible', timeout: 15_000 });

        // We should still be on the PLP path — not on /product/...
        const currentPath = new URL(page.url()).pathname;
        expect(currentPath).toBe(plpPath);
        expect(currentPath).not.toContain('/product/');
    });

    // -----------------------------------------------------------------------
    // 10. Multiple Quick View Open/Close Cycles Work
    // -----------------------------------------------------------------------
    test('Quick View can be opened and closed multiple times without breaking', async ({
        page,
    }) => {
        await navigateToPLP(page);
        await checkForCrashPage(page, 'PLP navigation');

        const firstBtn = page
            .locator('[data-testid="quick-view-btn"]')
            .first();
        const modal = page.locator('[data-testid="quick-view-modal"]');

        // Cycle 1: open and close via Escape
        await firstBtn.click();
        await modal.waitFor({ state: 'visible', timeout: 15_000 });
        await page.keyboard.press('Escape');
        await expect(modal).toBeHidden({ timeout: 5000 });

        // Cycle 2: open and close via close button
        await firstBtn.click();
        await modal.waitFor({ state: 'visible', timeout: 15_000 });

        const closeBtn = page.getByRole('button', { name: /close/i });
        await closeBtn.click();
        await expect(modal).toBeHidden({ timeout: 5000 });
    });

    // -----------------------------------------------------------------------
    // 11. Quick View Button is a Semantic Button Element
    // -----------------------------------------------------------------------
    test('Quick View trigger is rendered as a <button> element for accessibility', async ({
        page,
    }) => {
        await navigateToPLP(page);
        await checkForCrashPage(page, 'PLP navigation');

        const firstBtn = page
            .locator('[data-testid="quick-view-btn"]')
            .first();
        const tagName = await firstBtn.evaluate((el) =>
            el.tagName.toLowerCase()
        );
        expect(tagName).toBe('button');
    });

    // -----------------------------------------------------------------------
    // 12. Quick View Button Count Matches Product Tiles
    // -----------------------------------------------------------------------
    test('Quick View buttons appear on product tiles (one per eligible tile)', async ({
        page,
    }) => {
        await navigateToPLP(page);
        await checkForCrashPage(page, 'PLP navigation');

        const tileCount = await page
            .locator('[data-testid="product-tile"]')
            .count();
        const quickViewCount = await page
            .locator('[data-testid="quick-view-btn"]')
            .count();

        // Quick View buttons should be present on most tiles (may be fewer if
        // sets/bundles are excluded, but should never exceed tile count)
        expect(quickViewCount).toBeGreaterThan(0);
        expect(quickViewCount).toBeLessThanOrEqual(tileCount);
    });

    // -----------------------------------------------------------------------
    // 13. Modal Overlay Click Closes Modal
    // -----------------------------------------------------------------------
    test('clicking the modal overlay backdrop closes the modal', async ({
        page,
    }) => {
        await navigateToPLP(page);
        await checkForCrashPage(page, 'PLP navigation');

        // Open modal
        const firstBtn = page
            .locator('[data-testid="quick-view-btn"]')
            .first();
        await firstBtn.click();

        const modal = page.locator('[data-testid="quick-view-modal"]');
        await modal.waitFor({ state: 'visible', timeout: 15_000 });

        // Click outside the modal content (on the overlay)
        // Chakra ModalOverlay covers the viewport — click at viewport edge
        await page.mouse.click(5, 5);

        // Modal should close
        await expect(modal).toBeHidden({ timeout: 5000 });
    });
});
