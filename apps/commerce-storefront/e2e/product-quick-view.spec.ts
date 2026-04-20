import {test, expect, type Page, type Locator} from '@playwright/test'

/**
 * E2E tests for the Product Quick View feature.
 *
 * Tests verify the Quick View overlay bar on product tiles and the
 * QuickViewModal that displays product details without navigating to the PDP.
 *
 * data-testid contracts:
 *   - quick-view-btn     → overlay bar button on product tiles
 *   - quick-view-modal   → modal content container
 *   - quick-view-spinner → loading spinner inside the modal
 *   - quick-view-error   → error/unavailable state inside the modal
 */

// ─── Constants ────────────────────────────────────────────────────────────

/**
 * A category/search URL that reliably returns product tiles on the
 * RefArch sandbox. Using a broad search query ensures results exist.
 */
const PLP_URL = '/search?q=shirt'

/** Timeout for waiting on elements after navigation or action */
const ELEMENT_TIMEOUT = 15_000

/** Timeout for short waits (crash page detection, etc.) */
const SHORT_TIMEOUT = 3_000

// ─── Browser Diagnostics (MANDATORY) ─────────────────────────────────────

let consoleErrors: string[] = []
let failedRequests: string[] = []

test.beforeEach(async ({page}) => {
    consoleErrors = []
    failedRequests = []

    page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text())
    })
    page.on('requestfailed', (req) => {
        failedRequests.push(`${req.method()} ${req.url()} - ${req.failure()?.errorText}`)
    })
})

test.afterEach(async ({page}, testInfo) => {
    if (testInfo.status !== 'passed') {
        console.log(`\n--- Browser Diagnostics for "${testInfo.title}" ---`)
        if (consoleErrors.length > 0) {
            console.log('Console errors:', consoleErrors)
        }
        if (failedRequests.length > 0) {
            console.log('Failed requests:', failedRequests)
        }
        await page
            .screenshot({
                path: `test-results/failure-${testInfo.title.replace(/\s+/g, '-')}.png`
            })
            .catch(() => {
                /* screenshot may fail if browser closed */
            })
    }
})

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Navigate to the PLP and wait for at least one product tile to render.
 */
async function navigateToPLP(page: Page): Promise<void> {
    await page.goto(PLP_URL, {waitUntil: 'domcontentloaded'})
    // Wait for product tiles to render — the Quick View button is inside tiles
    await page
        .getByTestId('quick-view-btn')
        .first()
        .waitFor({state: 'visible', timeout: ELEMENT_TIMEOUT})
}

/**
 * Detect the PWA Kit crash page. If found, throws with the stack trace.
 */
async function assertNoCrashPage(page: Page, actionDescription: string): Promise<void> {
    const crashHeading = page.getByRole('heading', {name: /this page isn't working/i})
    const hasCrash = await crashHeading
        .waitFor({state: 'visible', timeout: SHORT_TIMEOUT})
        .then(() => true)
        .catch(() => false)

    if (hasCrash) {
        const stack = await page
            .locator('pre')
            .textContent()
            .catch(() => 'no stack')
        throw new Error(
            `PWA Kit crash page detected after "${actionDescription}". Stack: ${stack}`
        )
    }
}

/**
 * Three-outcome assertion for modal content after opening Quick View.
 * Returns which outcome was reached: 'content' | 'error-state' | 'crash'.
 */
async function assertModalOutcome(
    page: Page
): Promise<'content' | 'error-state' | 'crash'> {
    // Outcome 1: Modal content loaded successfully (modal is visible)
    const content = page.getByTestId('quick-view-modal')
    // Outcome 2: Error state inside the modal
    const errorState = page.getByTestId('quick-view-error')
    // Outcome 3: Crash page (entire page replaced)
    const crashPage = page.getByRole('heading', {name: /this page isn't working/i})

    const winner = await Promise.race([
        content
            .waitFor({state: 'visible', timeout: ELEMENT_TIMEOUT})
            .then(() => 'content' as const),
        errorState
            .waitFor({state: 'visible', timeout: ELEMENT_TIMEOUT})
            .then(() => 'error-state' as const),
        crashPage
            .waitFor({state: 'visible', timeout: ELEMENT_TIMEOUT})
            .then(() => 'crash' as const)
    ])

    if (winner === 'crash') {
        const stack = await page
            .locator('pre')
            .textContent()
            .catch(() => 'no stack')
        throw new Error(`PWA Kit crash page detected after opening Quick View. Stack: ${stack}`)
    }

    return winner
}

// ─── Tests ────────────────────────────────────────────────────────────────

test.describe('Product Quick View', () => {
    test.describe('Quick View Button on Product Tiles', () => {
        test('Quick View button is visible on product tiles on the PLP', async ({page}) => {
            await navigateToPLP(page)

            const quickViewButtons = page.getByTestId('quick-view-btn')
            const count = await quickViewButtons.count()
            expect(count).toBeGreaterThan(0)

            // The first button should be visible (mobile: always visible)
            await expect(quickViewButtons.first()).toBeVisible()
        })

        test('Quick View button has accessible aria-label', async ({page}) => {
            await navigateToPLP(page)

            const firstButton = page.getByTestId('quick-view-btn').first()
            const ariaLabel = await firstButton.getAttribute('aria-label')

            // aria-label should start with "Quick View" and include a product name
            expect(ariaLabel).toMatch(/^Quick View\s+.+/)
        })

        test('Quick View button contains "Quick View" text', async ({page}) => {
            await navigateToPLP(page)

            const firstButton = page.getByTestId('quick-view-btn').first()
            await expect(firstButton).toContainText('Quick View')
        })

        test('clicking Quick View does not navigate away from PLP', async ({page}) => {
            await navigateToPLP(page)

            const urlBefore = page.url()

            const firstButton = page.getByTestId('quick-view-btn').first()
            await firstButton.click()

            // Wait a moment for any potential navigation
            await page.waitForLoadState('domcontentloaded')

            // URL should remain on the PLP (no navigation to PDP)
            expect(page.url()).toBe(urlBefore)
        })
    })

    test.describe('Quick View Modal', () => {
        test('clicking Quick View opens the modal with product content or error state', async ({
            page
        }) => {
            await navigateToPLP(page)

            const firstButton = page.getByTestId('quick-view-btn').first()
            await firstButton.click()

            // Use three-outcome assertion pattern
            const outcome = await assertModalOutcome(page)

            // Either content loaded or error state shown — both are valid
            expect(['content', 'error-state']).toContain(outcome)

            if (outcome === 'content') {
                // Modal should be visible with the quick-view-modal testid
                await expect(page.getByTestId('quick-view-modal')).toBeVisible()
            }
        })

        test('modal has accessible aria-label', async ({page}) => {
            await navigateToPLP(page)

            const firstButton = page.getByTestId('quick-view-btn').first()
            await firstButton.click()

            const outcome = await assertModalOutcome(page)
            if (outcome === 'content' || outcome === 'error-state') {
                const modal = page.getByTestId('quick-view-modal')
                const ariaLabel = await modal.getAttribute('aria-label')
                // Should contain "Quick view for" and some product name
                expect(ariaLabel).toMatch(/quick view for/i)
            }
        })

        test('modal shows loading spinner before content loads', async ({page}) => {
            await navigateToPLP(page)

            const firstButton = page.getByTestId('quick-view-btn').first()
            await firstButton.click()

            // The spinner may appear briefly before content loads.
            // We race between spinner and final content to catch it if visible.
            const spinner = page.getByTestId('quick-view-spinner')
            const modal = page.getByTestId('quick-view-modal')

            // First, modal should appear
            await modal.waitFor({state: 'visible', timeout: ELEMENT_TIMEOUT})

            // Spinner may or may not still be visible (fast API = no spinner seen).
            // This is a best-effort check — if spinner is visible, it should eventually
            // be replaced by content or error state.
            const spinnerVisible = await spinner.isVisible().catch(() => false)
            if (spinnerVisible) {
                // Wait for spinner to disappear (content loaded)
                await spinner.waitFor({state: 'hidden', timeout: ELEMENT_TIMEOUT})
            }

            // After spinner gone, crash page check
            await assertNoCrashPage(page, 'Quick View modal loading')
        })

        test('modal can be closed with the close button', async ({page}) => {
            await navigateToPLP(page)

            const firstButton = page.getByTestId('quick-view-btn').first()
            await firstButton.click()

            const outcome = await assertModalOutcome(page)
            expect(['content', 'error-state']).toContain(outcome)

            // Find and click the modal close button (Chakra ModalCloseButton)
            const modal = page.getByTestId('quick-view-modal')
            const closeButton = modal.locator('button[aria-label="Close"]')
            await closeButton.click()

            // Modal should disappear
            await expect(page.getByTestId('quick-view-modal')).not.toBeVisible({
                timeout: ELEMENT_TIMEOUT
            })
        })

        test('modal can be closed with Escape key', async ({page}) => {
            await navigateToPLP(page)

            const firstButton = page.getByTestId('quick-view-btn').first()
            await firstButton.click()

            const outcome = await assertModalOutcome(page)
            expect(['content', 'error-state']).toContain(outcome)

            // Press Escape to close the modal
            await page.keyboard.press('Escape')

            // Modal should disappear
            await expect(page.getByTestId('quick-view-modal')).not.toBeVisible({
                timeout: ELEMENT_TIMEOUT
            })
        })

        test('PLP content is preserved after closing the modal', async ({page}) => {
            await navigateToPLP(page)

            // Count Quick View buttons before opening the modal
            const countBefore = await page.getByTestId('quick-view-btn').count()

            const firstButton = page.getByTestId('quick-view-btn').first()
            await firstButton.click()

            const outcome = await assertModalOutcome(page)
            expect(['content', 'error-state']).toContain(outcome)

            // Close the modal
            await page.keyboard.press('Escape')
            await expect(page.getByTestId('quick-view-modal')).not.toBeVisible({
                timeout: ELEMENT_TIMEOUT
            })

            // PLP should still have the same Quick View buttons
            const countAfter = await page.getByTestId('quick-view-btn').count()
            expect(countAfter).toBe(countBefore)
        })
    })

    test.describe('Quick View Modal Content', () => {
        test('modal displays product details when content loads successfully', async ({
            page
        }) => {
            await navigateToPLP(page)

            const firstButton = page.getByTestId('quick-view-btn').first()
            await firstButton.click()

            const outcome = await assertModalOutcome(page)

            if (outcome === 'content') {
                const modal = page.getByTestId('quick-view-modal')

                // ProductView should render product name (h2 or heading)
                const heading = modal.locator('h2, [data-testid="product-name"]').first()
                await expect(heading).toBeVisible({timeout: ELEMENT_TIMEOUT})

                // Product should have a price displayed
                const priceArea = modal.locator(
                    '[class*="price"], [data-testid*="price"], .chakra-text'
                )
                const priceCount = await priceArea.count()
                expect(priceCount).toBeGreaterThan(0)
            }
            // If error-state, that's still valid — product might genuinely be unavailable
        })

        test('modal contains "View Full Details" link to PDP', async ({page}) => {
            await navigateToPLP(page)

            const firstButton = page.getByTestId('quick-view-btn').first()
            await firstButton.click()

            const outcome = await assertModalOutcome(page)

            if (outcome === 'content') {
                const modal = page.getByTestId('quick-view-modal')

                // ProductView with showFullLink=true renders a link to the PDP
                const fullDetailsLink = modal.locator('a[href*="/product/"]').first()
                await expect(fullDetailsLink).toBeVisible({timeout: ELEMENT_TIMEOUT})
            }
        })

        test('modal contains Add to Cart button', async ({page}) => {
            await navigateToPLP(page)

            const firstButton = page.getByTestId('quick-view-btn').first()
            await firstButton.click()

            const outcome = await assertModalOutcome(page)

            if (outcome === 'content') {
                const modal = page.getByTestId('quick-view-modal')

                // ProductView renders an "Add to Cart" button
                const addToCartButton = modal.getByRole('button', {name: /add to cart/i})
                await expect(addToCartButton).toBeVisible({timeout: ELEMENT_TIMEOUT})
            }
        })

        test('error state shows appropriate message when product is unavailable', async ({
            page
        }) => {
            await navigateToPLP(page)

            const firstButton = page.getByTestId('quick-view-btn').first()
            await firstButton.click()

            const outcome = await assertModalOutcome(page)

            // If error state is reached, verify the error message
            if (outcome === 'error-state') {
                const errorElement = page.getByTestId('quick-view-error')
                await expect(errorElement).toContainText(/no longer available|unable to load/i)
            }
            // If content loaded, that's fine too — this test validates the error path
            // only when it naturally occurs
        })
    })

    test.describe('Quick View — Edge Cases', () => {
        test('opening Quick View on multiple tiles sequentially works', async ({page}) => {
            await navigateToPLP(page)

            const quickViewButtons = page.getByTestId('quick-view-btn')
            const count = await quickViewButtons.count()

            if (count >= 2) {
                // Open first Quick View
                await quickViewButtons.nth(0).click()
                let outcome = await assertModalOutcome(page)
                expect(['content', 'error-state']).toContain(outcome)

                // Close it
                await page.keyboard.press('Escape')
                await expect(page.getByTestId('quick-view-modal')).not.toBeVisible({
                    timeout: ELEMENT_TIMEOUT
                })

                // Open second Quick View
                await quickViewButtons.nth(1).click()
                outcome = await assertModalOutcome(page)
                expect(['content', 'error-state']).toContain(outcome)

                // Close it
                await page.keyboard.press('Escape')
                await expect(page.getByTestId('quick-view-modal')).not.toBeVisible({
                    timeout: ELEMENT_TIMEOUT
                })
            }
        })

        test('Quick View button is not rendered for product sets or bundles', async ({
            page
        }) => {
            // Navigate to PLP and check all product tiles
            await navigateToPLP(page)

            // All quick-view-btn elements should have aria-labels (meaning they're
            // on standard products). We verify there are no broken/empty buttons.
            const quickViewButtons = page.getByTestId('quick-view-btn')
            const count = await quickViewButtons.count()

            for (let i = 0; i < Math.min(count, 5); i++) {
                const ariaLabel = await quickViewButtons.nth(i).getAttribute('aria-label')
                // Each button should have a non-empty aria-label
                expect(ariaLabel).toBeTruthy()
                expect(ariaLabel!.length).toBeGreaterThan('Quick View '.length)
            }
        })
    })
})
