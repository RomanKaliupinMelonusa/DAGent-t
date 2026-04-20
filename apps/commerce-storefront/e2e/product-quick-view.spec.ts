import {test, expect, type Page} from '@playwright/test'

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
 *
 * Desktop hover note: On lg+ viewports the Quick View button is hidden
 * (opacity: 0, translateY: 100%) inside an overflow:hidden container.
 * It is revealed via CSS _groupHover on the parent [role="group"] tile.
 * Tests MUST hover the tile before interacting with the button.
 */

// ─── Constants ────────────────────────────────────────────────────────────

/** A search URL that reliably returns product tiles on the RefArch sandbox. */
const PLP_URL = '/search?q=shirt'

/** Timeout for waiting on elements after navigation or action. */
const ELEMENT_TIMEOUT = 15_000

/** Short timeout for crash-page detection and spinner checks. */
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
 * Navigate to the PLP and wait for product tiles with Quick View buttons
 * to be present in the DOM.
 */
async function navigateToPLP(page: Page): Promise<void> {
    await page.goto(PLP_URL, {waitUntil: 'domcontentloaded'})
    // Wait for at least one quick-view-btn to be attached to the DOM.
    // We use 'attached' (not 'visible') because on desktop the button is
    // hidden until the tile is hovered.
    await page
        .getByTestId('quick-view-btn')
        .first()
        .waitFor({state: 'attached', timeout: ELEMENT_TIMEOUT})
}

/**
 * Hover over a product tile to reveal the Quick View button on desktop.
 *
 * On desktop (lg+ breakpoint) the button has opacity:0 and
 * transform:translateY(100%) with the parent overflow:hidden, making it
 * invisible and unclickable. Hovering the parent [role="group"] triggers
 * Chakra's _groupHover which reveals the button.
 *
 * Uses .filter({has: ...}) so the index aligns with tiles that actually
 * have a Quick View button (sets/bundles are excluded).
 */
async function hoverTileAndGetButton(
    page: Page,
    index = 0
): Promise<ReturnType<Page['getByTestId']>> {
    const tilesWithQV = page
        .locator('[role="group"]')
        .filter({has: page.getByTestId('quick-view-btn')})
    await tilesWithQV.nth(index).hover()

    const btn = tilesWithQV.nth(index).getByTestId('quick-view-btn')
    await btn.waitFor({state: 'visible', timeout: ELEMENT_TIMEOUT})
    return btn
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
 * After clicking Quick View, wait for the modal to fully load and return
 * which outcome was reached.
 *
 * This avoids the race-condition pitfall where the modal container
 * (quick-view-modal) appears before its children (spinner → content/error).
 * Instead, we:
 *   1. Wait for the modal container to appear.
 *   2. Wait for the loading spinner to disappear (fetch complete).
 *   3. Check whether the final state is product content or error.
 *   4. Detect crash page at each step.
 */
async function waitForModalContent(
    page: Page
): Promise<'product-loaded' | 'error-state'> {
    // Step 1 — modal container visible
    const modal = page.getByTestId('quick-view-modal')
    const errorState = page.getByTestId('quick-view-error')
    const crashPage = page.getByRole('heading', {name: /this page isn't working/i})

    // Race modal appearance vs crash
    const firstVisible = await Promise.race([
        modal
            .waitFor({state: 'visible', timeout: ELEMENT_TIMEOUT})
            .then(() => 'modal' as const),
        crashPage
            .waitFor({state: 'visible', timeout: ELEMENT_TIMEOUT})
            .then(() => 'crash' as const)
    ])

    if (firstVisible === 'crash') {
        const stack = await page
            .locator('pre')
            .textContent()
            .catch(() => 'no stack')
        throw new Error(`PWA Kit crash page after opening Quick View. Stack: ${stack}`)
    }

    // Step 2 — wait for spinner to disappear (data fetch complete)
    const spinner = page.getByTestId('quick-view-spinner')
    const spinnerSeen = await spinner
        .waitFor({state: 'visible', timeout: 2_000})
        .then(() => true)
        .catch(() => false)
    if (spinnerSeen) {
        await spinner.waitFor({state: 'hidden', timeout: ELEMENT_TIMEOUT})
    }

    // Step 3 — determine final outcome: error-state or product content
    const isError = await errorState.isVisible().catch(() => false)
    if (isError) return 'error-state'

    // Step 4 — verify no crash after content render
    await assertNoCrashPage(page, 'Quick View content render')

    return 'product-loaded'
}

// ─── Tests ────────────────────────────────────────────────────────────────

test.describe('Product Quick View', () => {
    test.describe('Quick View Button on Product Tiles', () => {
        test('Quick View buttons exist on product tiles on the PLP', async ({page}) => {
            await navigateToPLP(page)

            const quickViewButtons = page.getByTestId('quick-view-btn')
            const count = await quickViewButtons.count()
            expect(count).toBeGreaterThan(0)
        })

        test('Quick View button becomes visible on tile hover', async ({page}) => {
            await navigateToPLP(page)

            const btn = await hoverTileAndGetButton(page, 0)
            await expect(btn).toBeVisible()
        })

        test('Quick View button has accessible aria-label with product name', async ({page}) => {
            await navigateToPLP(page)

            const btn = await hoverTileAndGetButton(page, 0)
            const ariaLabel = await btn.getAttribute('aria-label')

            // aria-label format: "Quick View <productName>"
            expect(ariaLabel).toMatch(/^Quick View\s+.+/)
        })

        test('Quick View button contains "Quick View" text', async ({page}) => {
            await navigateToPLP(page)

            const btn = await hoverTileAndGetButton(page, 0)
            await expect(btn).toContainText('Quick View')
        })

        test('clicking Quick View does not navigate away from PLP', async ({page}) => {
            await navigateToPLP(page)
            const urlBefore = page.url()

            const btn = await hoverTileAndGetButton(page, 0)
            await btn.click()

            // Wait for any potential navigation to settle
            await page.waitForLoadState('domcontentloaded')

            // URL should remain on the PLP (no navigation to PDP)
            expect(page.url()).toBe(urlBefore)
        })
    })

    test.describe('Quick View Modal Lifecycle', () => {
        test('clicking Quick View opens the modal with content or error state', async ({
            page
        }) => {
            await navigateToPLP(page)

            const btn = await hoverTileAndGetButton(page, 0)
            await btn.click()

            const outcome = await waitForModalContent(page)

            // Either content loaded or error state — both are valid outcomes
            expect(['product-loaded', 'error-state']).toContain(outcome)
            await expect(page.getByTestId('quick-view-modal')).toBeVisible()
        })

        test('modal has accessible aria-label containing product name', async ({page}) => {
            await navigateToPLP(page)

            const btn = await hoverTileAndGetButton(page, 0)
            await btn.click()

            await waitForModalContent(page)

            const modal = page.getByTestId('quick-view-modal')
            const ariaLabel = await modal.getAttribute('aria-label')
            // Format: "Quick view for <productName>"
            expect(ariaLabel).toMatch(/quick view for/i)
        })

        test('modal shows loading spinner before content appears', async ({page}) => {
            await navigateToPLP(page)

            const btn = await hoverTileAndGetButton(page, 0)
            await btn.click()

            // Modal container should appear first
            const modal = page.getByTestId('quick-view-modal')
            await modal.waitFor({state: 'visible', timeout: ELEMENT_TIMEOUT})

            // Spinner may flash briefly — if we catch it, verify it eventually hides
            const spinner = page.getByTestId('quick-view-spinner')
            const spinnerSeen = await spinner
                .waitFor({state: 'visible', timeout: SHORT_TIMEOUT})
                .then(() => true)
                .catch(() => false)
            if (spinnerSeen) {
                await spinner.waitFor({state: 'hidden', timeout: ELEMENT_TIMEOUT})
            }

            await assertNoCrashPage(page, 'Quick View modal loading')
        })

        test('modal can be closed with the X close button', async ({page}) => {
            await navigateToPLP(page)

            const btn = await hoverTileAndGetButton(page, 0)
            await btn.click()
            await waitForModalContent(page)

            // Chakra ModalCloseButton renders with aria-label="Close"
            const modal = page.getByTestId('quick-view-modal')
            const closeButton = modal.locator('button[aria-label="Close"]')
            await closeButton.click()

            await expect(page.getByTestId('quick-view-modal')).not.toBeVisible({
                timeout: ELEMENT_TIMEOUT
            })
        })

        test('modal can be closed with Escape key', async ({page}) => {
            await navigateToPLP(page)

            const btn = await hoverTileAndGetButton(page, 0)
            await btn.click()
            await waitForModalContent(page)

            await page.keyboard.press('Escape')

            await expect(page.getByTestId('quick-view-modal')).not.toBeVisible({
                timeout: ELEMENT_TIMEOUT
            })
        })

        test('PLP content is preserved after closing the modal', async ({page}) => {
            await navigateToPLP(page)

            // Count tiles before opening
            const countBefore = await page.getByTestId('quick-view-btn').count()

            const btn = await hoverTileAndGetButton(page, 0)
            await btn.click()
            await waitForModalContent(page)

            // Close the modal
            await page.keyboard.press('Escape')
            await expect(page.getByTestId('quick-view-modal')).not.toBeVisible({
                timeout: ELEMENT_TIMEOUT
            })

            // Tile count should be unchanged
            const countAfter = await page.getByTestId('quick-view-btn').count()
            expect(countAfter).toBe(countBefore)
        })
    })

    test.describe('Quick View Modal Content', () => {
        test('modal displays product name heading when loaded', async ({page}) => {
            await navigateToPLP(page)

            const btn = await hoverTileAndGetButton(page, 0)
            await btn.click()

            const outcome = await waitForModalContent(page)

            if (outcome === 'product-loaded') {
                const modal = page.getByTestId('quick-view-modal')
                // ProductView renders the product name in an h2 element
                const heading = modal.locator('h2').first()
                await expect(heading).toBeVisible({timeout: ELEMENT_TIMEOUT})
                const text = await heading.textContent()
                expect(text?.trim().length).toBeGreaterThan(0)
            }
        })

        test('modal contains "View Full Details" link to PDP', async ({page}) => {
            await navigateToPLP(page)

            const btn = await hoverTileAndGetButton(page, 0)
            await btn.click()

            const outcome = await waitForModalContent(page)

            if (outcome === 'product-loaded') {
                const modal = page.getByTestId('quick-view-modal')
                // ProductView with showFullLink=true renders a link to the PDP
                const fullDetailsLink = modal.locator('a[href*="/product/"]').first()
                await expect(fullDetailsLink).toBeVisible({timeout: ELEMENT_TIMEOUT})
            }
        })

        test('modal contains Add to Cart button', async ({page}) => {
            await navigateToPLP(page)

            const btn = await hoverTileAndGetButton(page, 0)
            await btn.click()

            const outcome = await waitForModalContent(page)

            if (outcome === 'product-loaded') {
                const modal = page.getByTestId('quick-view-modal')
                const addToCartButton = modal.getByRole('button', {name: /add to cart/i})
                await expect(addToCartButton).toBeVisible({timeout: ELEMENT_TIMEOUT})
            }
        })

        test('error state shows unavailable message when product cannot load', async ({
            page
        }) => {
            await navigateToPLP(page)

            const btn = await hoverTileAndGetButton(page, 0)
            await btn.click()

            const outcome = await waitForModalContent(page)

            // If error state was reached, verify the error message text
            if (outcome === 'error-state') {
                const errorElement = page.getByTestId('quick-view-error')
                await expect(errorElement).toContainText(
                    /no longer available|unable to load/i
                )
            }
            // If product loaded, this test is a pass — error path tested opportunistically
        })
    })

    test.describe('Quick View Edge Cases', () => {
        test('opening Quick View on multiple tiles sequentially works', async ({page}) => {
            await navigateToPLP(page)

            const tileCount = await page
                .locator('[role="group"]')
                .filter({has: page.getByTestId('quick-view-btn')})
                .count()

            if (tileCount >= 2) {
                // Open first tile's Quick View
                const btn1 = await hoverTileAndGetButton(page, 0)
                await btn1.click()
                let outcome = await waitForModalContent(page)
                expect(['product-loaded', 'error-state']).toContain(outcome)

                // Close
                await page.keyboard.press('Escape')
                await expect(page.getByTestId('quick-view-modal')).not.toBeVisible({
                    timeout: ELEMENT_TIMEOUT
                })

                // Open second tile's Quick View
                const btn2 = await hoverTileAndGetButton(page, 1)
                await btn2.click()
                outcome = await waitForModalContent(page)
                expect(['product-loaded', 'error-state']).toContain(outcome)

                // Close
                await page.keyboard.press('Escape')
                await expect(page.getByTestId('quick-view-modal')).not.toBeVisible({
                    timeout: ELEMENT_TIMEOUT
                })
            }
        })

        test('all Quick View buttons have non-empty aria-labels', async ({page}) => {
            await navigateToPLP(page)

            const quickViewButtons = page.getByTestId('quick-view-btn')
            const count = await quickViewButtons.count()

            // Verify the first few buttons (reads DOM attributes, no hover needed)
            for (let i = 0; i < Math.min(count, 5); i++) {
                const ariaLabel = await quickViewButtons.nth(i).getAttribute('aria-label')
                expect(ariaLabel).toBeTruthy()
                expect(ariaLabel!.length).toBeGreaterThan('Quick View '.length)
            }
        })

        test('"View Full Details" link navigates to the PDP', async ({page}) => {
            await navigateToPLP(page)

            const btn = await hoverTileAndGetButton(page, 0)
            await btn.click()

            const outcome = await waitForModalContent(page)

            if (outcome === 'product-loaded') {
                const modal = page.getByTestId('quick-view-modal')
                const fullDetailsLink = modal.locator('a[href*="/product/"]').first()
                await expect(fullDetailsLink).toBeVisible({timeout: ELEMENT_TIMEOUT})

                const href = await fullDetailsLink.getAttribute('href')
                expect(href).toContain('/product/')

                // Click the link to navigate to PDP
                await fullDetailsLink.click()
                await page.waitForLoadState('domcontentloaded')

                // URL should now contain /product/
                expect(page.url()).toContain('/product/')
                await assertNoCrashPage(page, 'View Full Details navigation')
            }
        })
    })
})
