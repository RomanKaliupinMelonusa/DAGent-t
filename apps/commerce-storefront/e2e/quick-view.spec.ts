import {test, expect} from '@playwright/test'

/**
 * E2E tests for the Product Quick View feature.
 *
 * Tests verify:
 * - Quick View button appears on product tiles
 * - Modal opens and loads product data
 * - Modal closes correctly without navigation
 * - PLP state is preserved after Quick View interaction
 */

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
        failedRequests.push(
            `${req.method()} ${req.url()} - ${req.failure()?.errorText}`
        )
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
        await page.screenshot({
            path: `test-results/failure-${testInfo.title.replace(/\s+/g, '-')}.png`
        })
    }
})

// ─── Helpers ──────────────────────────────────────────────────────────────

async function navigateToCategoryPage(page: any) {
    // Try navigating via the site's main navigation
    await page.goto('/', {waitUntil: 'domcontentloaded'})

    // Wait for navigation links to load
    const navLink = page.locator('nav a, [role="navigation"] a').first()
    await navLink.waitFor({state: 'visible', timeout: 15_000})
    await navLink.click()
    await page.waitForLoadState('domcontentloaded')

    // Wait for product tiles to appear
    const productTile = page
        .locator('[data-testid="product-tile"], .product-tile, article')
        .first()
    await productTile.waitFor({state: 'visible', timeout: 15_000})
}

// ─── Tests ────────────────────────────────────────────────────────────────

test.describe('Quick View', () => {
    test('Quick View button appears on hover', async ({page}) => {
        await navigateToCategoryPage(page)

        // Find the first product tile area
        const firstTile = page
            .locator('[data-testid="product-tile"], .product-tile, article')
            .first()

        // Hover over it
        await firstTile.hover()

        // Quick View button should become visible
        const quickViewBtn = page.locator('[data-testid="quick-view-btn"]').first()
        await expect(quickViewBtn).toBeVisible({timeout: 5_000})
        await expect(quickViewBtn).toContainText('Quick View')
    })

    test('Quick View modal opens and loads product data', async ({page}) => {
        await navigateToCategoryPage(page)

        const firstTile = page
            .locator('[data-testid="product-tile"], .product-tile, article')
            .first()
        await firstTile.hover()

        // Click Quick View button
        const quickViewBtn = page.locator('[data-testid="quick-view-btn"]').first()
        await quickViewBtn.waitFor({state: 'visible', timeout: 5_000})
        await quickViewBtn.click()

        // Modal should appear
        const modal = page.locator('[data-testid="quick-view-modal"]')
        await expect(modal).toBeVisible({timeout: 10_000})

        // Soft check: spinner may appear briefly
        const spinner = page.locator('[data-testid="quick-view-spinner"]')
        if (await spinner.isVisible().catch(() => false)) {
            await spinner.waitFor({state: 'hidden', timeout: 15_000})
        }

        // Product content should be visible inside modal
        // Look for product name (h1 or h2 inside modal) or product-view
        const productContent = modal.locator('h1, h2, [data-testid="product-view"]').first()
        await expect(productContent).toBeVisible({timeout: 15_000})
    })

    test('modal closes correctly', async ({page}) => {
        await navigateToCategoryPage(page)
        const originalUrl = page.url()

        const firstTile = page
            .locator('[data-testid="product-tile"], .product-tile, article')
            .first()
        await firstTile.hover()

        const quickViewBtn = page.locator('[data-testid="quick-view-btn"]').first()
        await quickViewBtn.waitFor({state: 'visible', timeout: 5_000})
        await quickViewBtn.click()

        // Wait for modal to open
        const modal = page.locator('[data-testid="quick-view-modal"]')
        await expect(modal).toBeVisible({timeout: 10_000})

        // Close modal via close button
        const closeBtn = modal.locator('button[aria-label="Close"]')
        await closeBtn.click()

        // Modal should disappear
        await expect(modal).not.toBeVisible({timeout: 5_000})

        // PLP should still be showing (tiles visible)
        const productTile = page
            .locator('[data-testid="product-tile"], .product-tile, article')
            .first()
        await expect(productTile).toBeVisible()

        // URL should not have changed
        expect(page.url()).toBe(originalUrl)
    })

    test('Quick View does not navigate away from PLP', async ({page}) => {
        await navigateToCategoryPage(page)
        const originalUrl = page.url()

        const firstTile = page
            .locator('[data-testid="product-tile"], .product-tile, article')
            .first()
        await firstTile.hover()

        const quickViewBtn = page.locator('[data-testid="quick-view-btn"]').first()
        await quickViewBtn.waitFor({state: 'visible', timeout: 5_000})
        await quickViewBtn.click()

        // Wait for modal
        const modal = page.locator('[data-testid="quick-view-modal"]')
        await expect(modal).toBeVisible({timeout: 10_000})

        // Close via Escape key
        await page.keyboard.press('Escape')
        await expect(modal).not.toBeVisible({timeout: 5_000})

        // Verify URL unchanged
        expect(page.url()).toBe(originalUrl)

        // Verify PLP is preserved
        const productTiles = page.locator(
            '[data-testid="product-tile"], .product-tile, article'
        )
        const count = await productTiles.count()
        expect(count).toBeGreaterThan(0)
    })
})
