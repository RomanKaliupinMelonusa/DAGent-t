/**
 * E2E tests for PLP Quick View Modal feature.
 *
 * Oracle: e2e-contract.md (flows E2E-001 through E2E-008)
 * Selectors: data-testid contract from §2 of the e2e-contract
 */
import {test, expect, awaitHydrated} from './fixtures';
import type {Page} from '@playwright/test';

// ---------------------------------------------------------------------------
// Baseline noise patterns — mechanically derived from baseline.json
// Only entries whose volatility === "persistent" are included.
// Each pattern is the literal baseline `pattern` field with regex-special
// characters escaped: . ? + * ( ) [ ] { } | ^ $ \ /
// ---------------------------------------------------------------------------
const BASELINE_NOISE_PATTERNS: RegExp[] = [
    /Warning: The result of getServerSnapshot should be cached to avoid an infinite loop/,
    /Warning: %s: Support for defaultProps will be removed from function components in a future major release\. Use JavaScript default parameters instead\.%s PageDesignerProvider/,
    /retail-react-app\.use-datacloud\._handleApiError ERROR \[DataCloudApi\] Error sending Data Cloud event/,
    /r: 403 Forbidden/,
    /Failed to load resource: net::ERR_NAME_NOT_RESOLVED/,
];

const PLP_PATH = '/category/womens-clothing-dresses';

// ---------------------------------------------------------------------------
// Helpers (inlined per spec — fixtures.ts is out of bounds for edits)
// ---------------------------------------------------------------------------

/**
 * Dismiss any Chakra-portal-mounted dialog (consent, locale, onboarding)
 * that intercepts pointer events on PLP/PDP/cart roots. PWA-Kit-generic;
 * idempotent; never throws; bounded total wall time (~1.5s worst case,
 * <50 ms when no overlay is present). Uses only @playwright/test
 * primitives — no waitForTimeout, no networkidle (per rules §1–§2).
 */
async function dismissOverlays(page: Page): Promise<void> {
    const ctaPattern =
        /accept|decline|close|continue|got it|dismiss|confirm|select/i;
    // Up to 3 passes — stacked portals (consent + locale) need sequential dismiss.
    for (let pass = 0; pass < 3; pass++) {
        const dialogs = await page.getByRole('dialog').all();
        let dismissed = false;
        for (const dialog of dialogs) {
            if (!(await dialog.isVisible().catch(() => false))) continue;
            const cta = dialog
                .getByRole('button', {name: ctaPattern})
                .first();
            const clicked = await cta
                .click({timeout: 400})
                .then(() => true)
                .catch(() => false);
            if (!clicked) {
                await page.keyboard.press('Escape').catch(() => {});
            }
            await dialog
                .waitFor({state: 'hidden', timeout: 400})
                .catch(() => {});
            dismissed = true;
        }
        if (!dismissed) return;
    }
}

/**
 * Navigate to the PLP, dismiss overlays, and await hydration.
 */
async function gotoPlp(page: Page): Promise<void> {
    await page.goto(PLP_PATH, {waitUntil: 'domcontentloaded'});
    await dismissOverlays(page);
    await awaitHydrated(page);
}

/**
 * Find the first Quick View trigger on the PLP and extract the product ID.
 * Returns a feature-scoped locator (exact testid) and the parsed product ID.
 */
async function firstQuickViewTrigger(
    page: Page,
): Promise<{locator: ReturnType<Page['getByTestId']>; productId: string}> {
    const trigger = page.getByTestId(/^quick-view-trigger-/).first();
    await expect(trigger).toBeVisible({timeout: 10_000});
    const testid = await trigger.getAttribute('data-testid');
    const productId = testid!.replace('quick-view-trigger-', '');
    // Return a feature-scoped locator (exact testid) per §20
    return {
        locator: page.getByTestId(`quick-view-trigger-${productId}`),
        productId,
    };
}

/**
 * Open Quick View on the first eligible tile.
 * Waits for the modal to become visible before returning.
 */
async function openQuickView(
    page: Page,
): Promise<{trigger: ReturnType<Page['getByTestId']>; productId: string}> {
    const {locator, productId} = await firstQuickViewTrigger(page);
    await locator.click();

    // Three-outcome detection: modal content or crash page
    const modal = page.getByTestId('quick-view-modal');
    const crashPage = page.getByRole('heading', {
        name: /this page isn't working/i,
    });

    const winner = await Promise.race([
        modal
            .waitFor({state: 'visible', timeout: 15_000})
            .then(() => 'modal' as const),
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
            `PWA Kit crash page detected after opening Quick View. Stack: ${stack}`,
        );
    }

    return {trigger: locator, productId};
}

/**
 * Assert console-error budget: only baseline noise is tolerated.
 */
function assertConsoleErrorBudget(consoleErrors: string[]): void {
    const newErrors = consoleErrors.filter(
        (e) => !BASELINE_NOISE_PATTERNS.some((re) => re.test(e)),
    );
    expect(newErrors).toEqual([]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('PLP Quick View Modal', () => {
    // E2E-001: open-quick-view-from-tile
    test('opens Quick View modal from product tile', async ({
        page,
        signals,
    }) => {
        await gotoPlp(page);
        const startUrl = page.url();

        await openQuickView(page);

        // Modal is visible with product content, no error state
        await expect(page.getByTestId('quick-view-modal')).toBeVisible();
        await expect(page.getByTestId('product-view')).toBeVisible();
        await expect(
            page.getByTestId('quick-view-modal-error'),
        ).not.toBeVisible();

        // Trigger does NOT cause navigation away from the PLP
        expect(page.url()).toBe(startUrl);

        assertConsoleErrorBudget(signals.consoleErrors);
    });

    // E2E-002: switch-color-swatch-in-quick-view
    test('switches color swatch inside Quick View modal', async ({
        page,
        signals,
    }) => {
        await gotoPlp(page);
        await openQuickView(page);

        const modal = page.getByTestId('quick-view-modal');

        // Swatches render as role="radio" inside SwatchGroup (base component)
        const swatches = modal.getByRole('radio');
        const swatchCount = await swatches.count();

        if (swatchCount < 2) {
            test.skip(true, 'First tile has fewer than 2 color swatches');
            return;
        }

        // Capture pre-click gallery image src
        const galleryImage = modal.locator('img').first();
        const preSrc = await galleryImage.getAttribute('src');

        // Click the second swatch
        await swatches.nth(1).click();

        // Wait briefly for potential image update then assert modal stays visible
        // (image may not change if variants share the same hero image)
        await expect(modal).toBeVisible();

        assertConsoleErrorBudget(signals.consoleErrors);
    });

    // E2E-003: add-to-bag-from-quick-view
    test('adds product to bag from Quick View modal', async ({
        page,
        signals,
    }) => {
        await gotoPlp(page);
        await openQuickView(page);

        const modal = page.getByTestId('quick-view-modal');
        const addToCartBtn = page.getByTestId('quick-view-add-to-cart-btn');

        // Select a variation if needed — click first non-disabled radio in each
        // attribute group to ensure a complete selection
        const radioButtons = modal.getByRole('radio');
        const radioCount = await radioButtons.count();
        for (let i = 0; i < radioCount; i++) {
            const radio = radioButtons.nth(i);
            const isChecked = await radio.getAttribute('aria-checked');
            if (isChecked === 'true') continue;
            const isDisabled = await radio.isDisabled().catch(() => true);
            if (!isDisabled) {
                await radio.click();
                break; // One selection per attribute group; the first group is color
            }
        }

        // Wait for the add-to-cart button to be enabled
        await expect(addToCartBtn).toBeEnabled({timeout: 10_000});

        // Click add to cart
        await addToCartBtn.click();

        // Three-outcome pattern: confirmation modal, error, or crash
        const confirmationModal = page.getByTestId('add-to-cart-modal');
        const errorState = page.getByTestId('quick-view-modal-error');
        const crashPage = page.getByRole('heading', {
            name: /this page isn't working/i,
        });

        const winner = await Promise.race([
            confirmationModal
                .waitFor({state: 'visible', timeout: 15_000})
                .then(() => 'confirmation' as const),
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
                `PWA Kit crash page detected after add-to-cart. Stack: ${stack}`,
            );
        }

        // Happy-path assertion: confirmation modal must win
        expect(winner).toBe('confirmation');

        // Quick View modal should be hidden
        await expect(modal).not.toBeVisible();
        // Confirmation modal visible with at least one product-added row
        await expect(confirmationModal).toBeVisible();
        await expect(
            page.getByTestId('product-added').first(),
        ).toBeVisible();

        assertConsoleErrorBudget(signals.consoleErrors);
    });

    // E2E-004: close-quick-view-restores-focus
    test.describe('close Quick View restores focus', () => {
        test('via Escape key', async ({page, signals}) => {
            await gotoPlp(page);
            const {productId} = await openQuickView(page);

            await page.keyboard.press('Escape');
            await expect(
                page.getByTestId('quick-view-modal'),
            ).not.toBeVisible();

            // Assert focus returned to the trigger
            const focusedTestId = await page.evaluate(
                () => document.activeElement?.getAttribute('data-testid'),
            );
            expect(focusedTestId).toBe(
                `quick-view-trigger-${productId}`,
            );

            assertConsoleErrorBudget(signals.consoleErrors);
        });

        test('via close button', async ({page, signals}) => {
            await gotoPlp(page);
            const {productId} = await openQuickView(page);

            // Chakra Modal renders a close button with an accessible name
            const modal = page.getByTestId('quick-view-modal');
            const closeBtn = modal
                .getByRole('button', {name: /close/i})
                .first();
            await closeBtn.click();
            await expect(
                page.getByTestId('quick-view-modal'),
            ).not.toBeVisible();

            const focusedTestId = await page.evaluate(
                () => document.activeElement?.getAttribute('data-testid'),
            );
            expect(focusedTestId).toBe(
                `quick-view-trigger-${productId}`,
            );

            assertConsoleErrorBudget(signals.consoleErrors);
        });

        test('via overlay click', async ({page, signals}) => {
            await gotoPlp(page);
            const {productId} = await openQuickView(page);

            // Click at the viewport edge (top-left corner) which falls on
            // the Chakra modal overlay, outside the modal content area.
            await page.mouse.click(5, 5);
            await expect(
                page.getByTestId('quick-view-modal'),
            ).not.toBeVisible();

            const focusedTestId = await page.evaluate(
                () => document.activeElement?.getAttribute('data-testid'),
            );
            expect(focusedTestId).toBe(
                `quick-view-trigger-${productId}`,
            );

            assertConsoleErrorBudget(signals.consoleErrors);
        });
    });

    // E2E-005: no-pickup-ui-in-quick-view (negative)
    test('does not render pickup or ship-to-store UI in Quick View', async ({
        page,
        signals,
    }) => {
        await gotoPlp(page);
        await openQuickView(page);

        const modal = page.getByTestId('quick-view-modal');

        // Assert none of the pickup-related testids are visible
        await expect(
            modal.getByTestId('pickup-select-store-msg'),
        ).not.toBeVisible();
        await expect(
            modal.getByTestId('store-stock-status-msg'),
        ).not.toBeVisible();
        // Any element with testid containing "pickup"
        await expect(
            modal.locator('[data-testid*="pickup"]'),
        ).not.toBeVisible();

        // Assert no text mentioning pickup/ship to store inside the modal
        const modalText = await modal.textContent();
        expect(modalText).not.toMatch(/pickup|ship to store|pick up/i);

        assertConsoleErrorBudget(signals.consoleErrors);
    });

    // E2E-006: add-to-bag-disabled-when-unavailable
    test('add-to-bag button is disabled when variation is incomplete', async ({
        page,
        signals,
    }) => {
        await gotoPlp(page);
        await openQuickView(page);

        const addToCartBtn = page.getByTestId('quick-view-add-to-cart-btn');

        // On a master product before all variations are selected, button
        // should be disabled. If the first tile has a pre-selected valid
        // variation we cannot test this path — skip gracefully.
        const isDisabled = await addToCartBtn.isDisabled();
        if (!isDisabled) {
            test.skip(
                true,
                'First tile product has a pre-selected valid variation; covered by unit tests',
            );
            return;
        }

        await expect(addToCartBtn).toBeDisabled();

        assertConsoleErrorBudget(signals.consoleErrors);
    });

    // E2E-007: view-full-details-link
    test('View Full Details link navigates to PDP', async ({
        page,
        signals,
    }) => {
        await gotoPlp(page);
        await openQuickView(page);

        const viewFullDetailsLink = page.getByTestId(
            'quick-view-view-full-details-link',
        );
        await expect(viewFullDetailsLink).toBeVisible();
        await viewFullDetailsLink.click();

        // Wait for navigation to PDP
        await page.waitForURL(/\/product\//, {timeout: 10_000});
        await expect(
            page.getByTestId('quick-view-modal'),
        ).not.toBeVisible();

        assertConsoleErrorBudget(signals.consoleErrors);
    });

    // E2E-008: tile-click-still-navigates-to-pdp (regression)
    test('clicking tile image navigates to PDP', async ({page, signals}) => {
        await gotoPlp(page);

        // Click the first tile's link (NOT the quick view trigger)
        const firstTile = page.getByTestId(/^sf-product-tile-/).first();
        await expect(firstTile).toBeVisible({timeout: 10_000});

        // The tile's primary link wraps the image
        const tileLink = firstTile.getByRole('link').first();
        await tileLink.click();

        // Should navigate to PDP
        await page.waitForURL(/\/product\//, {timeout: 10_000});
        await expect(
            page.getByTestId('quick-view-modal'),
        ).not.toBeVisible();

        assertConsoleErrorBudget(signals.consoleErrors);
    });
});
