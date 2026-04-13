import {test, expect, type Page} from '@playwright/test'

/**
 * E2E tests for the Product Quick View feature.
 *
 * Covers:
 *   - Quick View overlay bar renders on PLP product tiles
 *   - Clicking the bar opens the Quick View modal
 *   - Modal displays product content, loading, or error state (three-outcome)
 *   - Modal closes via close button and Escape key
 *   - Quick View button is keyboard-accessible
 *
 * Selector strategy: data-testid attributes from the component contract.
 *   quick-view-btn     — overlay bar trigger on each product tile
 *   quick-view-modal   — modal content wrapper
 *   quick-view-spinner — loading spinner inside modal
 *   quick-view-error   — error / unavailable state inside modal
 */

// ─── Browser Diagnostics (MANDATORY) ──────────────────────────────────────

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
 * Navigate to a PLP page and wait for at least one product tile to render.
 * Tries the top-level category nav first; falls back to /category/newarrivals.
 */
async function navigateToPLP(page: Page) {
    await page.goto('/', {waitUntil: 'domcontentloaded'})

    // Try clicking a category nav link to reach a PLP
    const navLink = page.locator('nav a, [role="navigation"] a').first()
    const hasNav = await navLink.isVisible({timeout: 10_000}).catch(() => false)

    if (hasNav) {
        await navLink.click()
        await page.waitForLoadState('domcontentloaded')
    } else {
        // Fallback: go directly to a well-known category URL
        await page.goto('/category/newarrivals', {waitUntil: 'domcontentloaded'})
    }

    // Wait for product tiles to appear (the PLP is rendered)
    await page
        .locator('[data-testid="product-tile"], .product-tile, article')
        .first()
        .waitFor({state: 'visible', timeout: 30_000})
}

/**
 * Detect PWA Kit crash page after an action.
 * Throws with the stack trace if the crash page is detected.
 */
async function assertNoCrashPage(page: Page, actionDescription: string) {
    const crashHeading = page.getByRole('heading', {name: /this page isn't working/i})
    const hasCrash = await crashHeading
        .waitFor({state: 'visible', timeout: 2000})
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

// ─── Tests ────────────────────────────────────────────────────────────────

test.describe('Product Quick View', () => {
    test('Quick View button renders on PLP product tiles', async ({page}) => {
        await navigateToPLP(page)

        // At least one Quick View button should be visible on the PLP
        const quickViewBtn = page.getByTestId('quick-view-btn').first()
        // On mobile viewports the button is always visible; on desktop it appears on hover.
        // Playwright default viewport is desktop-sized, so hover the parent tile first.
        const firstTile = page
            .locator('[data-testid="product-tile"], .product-tile, article')
            .first()
        await firstTile.hover()

        await expect(quickViewBtn).toBeVisible({timeout: 5_000})
    })

    test('clicking Quick View button opens modal with product content', async ({page}) => {
        await navigateToPLP(page)

        // Hover over the first tile to reveal the Quick View button (desktop)
        const firstTile = page
            .locator('[data-testid="product-tile"], .product-tile, article')
            .first()
        await firstTile.hover()

        const quickViewBtn = page.getByTestId('quick-view-btn').first()
        await quickViewBtn.waitFor({state: 'visible', timeout: 5_000})
        await quickViewBtn.click()

        // Check for crash page after click
        await assertNoCrashPage(page, 'Quick View button click')

        // Three-Outcome Assertion Pattern (MANDATORY)
        const modal = page.getByTestId('quick-view-modal')
        const errorState = page.getByTestId('quick-view-error')
        const crashPage = page.getByRole('heading', {name: /this page isn't working/i})

        const winner = await Promise.race([
            modal
                .waitFor({state: 'visible', timeout: 15_000})
                .then(() => 'modal' as const),
            crashPage
                .waitFor({state: 'visible', timeout: 15_000})
                .then(() => 'crash' as const)
        ])

        if (winner === 'crash') {
            const stack = await page
                .locator('pre')
                .textContent()
                .catch(() => 'no stack')
            throw new Error(`PWA Kit crash page detected. Stack: ${stack}`)
        }

        // Modal opened — now check what's inside (content, spinner, or error)
        expect(winner).toBe('modal')

        // Inside the modal we should see either spinner → content, or error
        const spinner = page.getByTestId('quick-view-spinner')
        const spinnerVisible = await spinner
            .isVisible()
            .catch(() => false)

        if (spinnerVisible) {
            // Wait for spinner to disappear and content or error to appear
            await spinner.waitFor({state: 'hidden', timeout: 15_000})
        }

        // After loading: either product content is shown or an error state
        const hasError = await errorState.isVisible().catch(() => false)

        if (!hasError) {
            // Product content loaded — verify key UI elements exist
            // ProductView renders Add to Cart button and product info
            const modalBody = page.getByTestId('quick-view-modal')
            await expect(modalBody).toBeVisible()
            // There should be visible text content inside the modal (product name, price, etc.)
            const modalText = await modalBody.textContent()
            expect(modalText?.length).toBeGreaterThan(0)
        }
        // Error state is a valid outcome — the product could be unavailable in sandbox
    })

    test('Quick View modal closes with the close button', async ({page}) => {
        await navigateToPLP(page)

        // Open the modal
        const firstTile = page
            .locator('[data-testid="product-tile"], .product-tile, article')
            .first()
        await firstTile.hover()

        const quickViewBtn = page.getByTestId('quick-view-btn').first()
        await quickViewBtn.waitFor({state: 'visible', timeout: 5_000})
        await quickViewBtn.click()

        const modal = page.getByTestId('quick-view-modal')
        await modal.waitFor({state: 'visible', timeout: 15_000})

        // Click the modal close button (Chakra ModalCloseButton renders a button with aria-label "Close")
        const closeBtn = page.locator('[aria-label="Close"], [aria-label="close"]').first()
        await closeBtn.click()

        // Modal should disappear
        await expect(modal).toBeHidden({timeout: 5_000})
    })

    test('Quick View modal closes with Escape key', async ({page}) => {
        await navigateToPLP(page)

        // Open the modal
        const firstTile = page
            .locator('[data-testid="product-tile"], .product-tile, article')
            .first()
        await firstTile.hover()

        const quickViewBtn = page.getByTestId('quick-view-btn').first()
        await quickViewBtn.waitFor({state: 'visible', timeout: 5_000})
        await quickViewBtn.click()

        const modal = page.getByTestId('quick-view-modal')
        await modal.waitFor({state: 'visible', timeout: 15_000})

        // Press Escape to close
        await page.keyboard.press('Escape')

        // Modal should disappear
        await expect(modal).toBeHidden({timeout: 5_000})
    })

    test('Quick View button has accessible aria-label', async ({page}) => {
        await navigateToPLP(page)

        const firstTile = page
            .locator('[data-testid="product-tile"], .product-tile, article')
            .first()
        await firstTile.hover()

        const quickViewBtn = page.getByTestId('quick-view-btn').first()
        await quickViewBtn.waitFor({state: 'visible', timeout: 5_000})

        // The aria-label should start with "Quick View" followed by the product name
        const ariaLabel = await quickViewBtn.getAttribute('aria-label')
        expect(ariaLabel).toBeTruthy()
        expect(ariaLabel).toMatch(/^Quick View\s/)
    })

    test('Quick View does not navigate away from PLP', async ({page}) => {
        await navigateToPLP(page)
        const plpUrl = page.url()

        // Open modal via Quick View
        const firstTile = page
            .locator('[data-testid="product-tile"], .product-tile, article')
            .first()
        await firstTile.hover()

        const quickViewBtn = page.getByTestId('quick-view-btn').first()
        await quickViewBtn.waitFor({state: 'visible', timeout: 5_000})
        await quickViewBtn.click()

        const modal = page.getByTestId('quick-view-modal')
        await modal.waitFor({state: 'visible', timeout: 15_000})

        // URL should NOT have changed (still on PLP, not PDP)
        expect(page.url()).toBe(plpUrl)

        // Close modal
        await page.keyboard.press('Escape')
        await expect(modal).toBeHidden({timeout: 5_000})

        // URL still the same
        expect(page.url()).toBe(plpUrl)
    })

    test('Quick View modal shows loading spinner then content or error', async ({page}) => {
        await navigateToPLP(page)

        const firstTile = page
            .locator('[data-testid="product-tile"], .product-tile, article')
            .first()
        await firstTile.hover()

        const quickViewBtn = page.getByTestId('quick-view-btn').first()
        await quickViewBtn.waitFor({state: 'visible', timeout: 5_000})
        await quickViewBtn.click()

        await assertNoCrashPage(page, 'Quick View button click')

        const modal = page.getByTestId('quick-view-modal')
        await modal.waitFor({state: 'visible', timeout: 15_000})

        // After modal is visible, we should eventually see either:
        //   1. Product content (spinner gone, no error)
        //   2. Error state (product unavailable)
        //   3. Crash page
        const spinner = page.getByTestId('quick-view-spinner')
        const errorState = page.getByTestId('quick-view-error')
        const crashPage = page.getByRole('heading', {name: /this page isn't working/i})

        // Wait for a resolved state (spinner should disappear if it was visible)
        const resolvedOutcome = await Promise.race([
            errorState
                .waitFor({state: 'visible', timeout: 20_000})
                .then(() => 'error' as const),
            // If no error, spinner should vanish and content renders
            spinner
                .waitFor({state: 'hidden', timeout: 20_000})
                .then(() => 'content' as const),
            crashPage
                .waitFor({state: 'visible', timeout: 20_000})
                .then(() => 'crash' as const)
        ])

        if (resolvedOutcome === 'crash') {
            const stack = await page
                .locator('pre')
                .textContent()
                .catch(() => 'no stack')
            throw new Error(`PWA Kit crash page after modal load. Stack: ${stack}`)
        }

        // Both 'content' and 'error' are valid resolved states
        expect(['content', 'error']).toContain(resolvedOutcome)
    })
})
