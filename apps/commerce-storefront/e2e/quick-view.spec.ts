import {test, expect} from '@playwright/test'

/**
 * E2E tests for the Product Quick View feature.
 *
 * Quick View allows shoppers to view product details, select variants,
 * and add-to-cart from a modal overlay on the PLP — without navigating
 * to the PDP.
 *
 * Tests run against the local dev server (localhost:3000) by default,
 * or against STOREFRONT_URL if set.
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
        failedRequests.push(`${req.method()} ${req.url()} - ${req.failure()?.errorText}`)
    })
})

test.afterEach(async ({page}, testInfo) => {
    if (testInfo.status !== 'passed') {
        console.log(`\n--- Browser Diagnostics for "${testInfo.title}" ---`)
        if (consoleErrors.length > 0) console.log('Console errors:', consoleErrors)
        if (failedRequests.length > 0) console.log('Failed requests:', failedRequests)
        await page.screenshot({
            path: `test-results/failure-${testInfo.title.replace(/\s+/g, '-')}.png`
        })
    }
})

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Navigate to a category/PLP page and wait for product tiles to appear.
 * Tries a direct URL first, then falls back to clicking a nav link.
 */
async function navigateToPLP(page: import('@playwright/test').Page) {
    // Try a common category URL first
    await page.goto('/category/womens')

    const tileLocator = page.locator(
        '[data-testid="product-tile"], .product-tile, article'
    )
    try {
        await tileLocator.first().waitFor({state: 'visible', timeout: 15_000})
    } catch {
        // Fallback: navigate to homepage and click first nav link
        await page.goto('/')
        const navLink = page.locator('nav a, [role="navigation"] a').first()
        if (await navLink.isVisible({timeout: 10_000})) {
            await navLink.click()
            await page.waitForLoadState('networkidle')
        }
        await tileLocator.first().waitFor({state: 'visible', timeout: 15_000})
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────

test.describe('Quick View', () => {
    test('Quick View button appears on hover', async ({page}) => {
        await navigateToPLP(page)

        const firstTile = page
            .locator('[data-testid="product-tile"], .product-tile, article')
            .first()

        // Hover over the first tile
        await firstTile.hover()

        // The Quick View button should become visible
        const qvBtn = page.locator('[data-testid="quick-view-btn"]').first()
        await expect(qvBtn).toBeVisible({timeout: 5_000})
    })

    test('Quick View modal opens and loads product data', async ({page}) => {
        await navigateToPLP(page)

        const firstTile = page
            .locator('[data-testid="product-tile"], .product-tile, article')
            .first()
        await firstTile.hover()

        // Click the Quick View button
        const qvBtn = page.locator('[data-testid="quick-view-btn"]').first()
        await qvBtn.click()

        // Modal should appear
        const modal = page.locator('[data-testid="quick-view-modal"]')
        await expect(modal).toBeVisible({timeout: 10_000})

        // Spinner may appear briefly — soft check (don't fail if too fast)
        const spinner = page.locator('[data-testid="quick-view-spinner"]')
        if (await spinner.isVisible({timeout: 2_000}).catch(() => false)) {
            // Wait for it to disappear (product loading)
            await spinner.waitFor({state: 'hidden', timeout: 15_000})
        }

        // Product name should be visible inside the modal
        const productName = modal.locator('h1, h2, [data-testid="product-name"]').first()
        await expect(productName).toBeVisible({timeout: 15_000})
    })

    test('Select variant and add to cart from Quick View', async ({page}) => {
        await navigateToPLP(page)

        const firstTile = page
            .locator('[data-testid="product-tile"], .product-tile, article')
            .first()
        await firstTile.hover()

        const qvBtn = page.locator('[data-testid="quick-view-btn"]').first()
        await qvBtn.click()

        const modal = page.locator('[data-testid="quick-view-modal"]')
        await expect(modal).toBeVisible({timeout: 10_000})

        // Wait for product data to load
        const spinner = modal.locator('[data-testid="quick-view-spinner"]')
        if (await spinner.isVisible({timeout: 2_000}).catch(() => false)) {
            await spinner.waitFor({state: 'hidden', timeout: 15_000})
        }

        // Select size if size selector exists (click first non-disabled option)
        const sizeButton = modal
            .locator('button[data-testid*="size"], [role="radio"]:not([disabled])')
            .first()
        if (await sizeButton.isVisible({timeout: 3_000}).catch(() => false)) {
            await sizeButton.click()
        }

        // Click Add to Cart
        const addToCartBtn = modal.locator(
            'button:has-text("Add to Cart"), button:has-text("Add to Bag"), button:has-text("add to cart")'
        )
        if (await addToCartBtn.isVisible({timeout: 5_000}).catch(() => false)) {
            await addToCartBtn.click()

            // Verify success: look for toast, alert, or cart confirmation
            const successIndicator = page.locator(
                '[role="alert"]:has-text("added"), [role="alert"]:has-text("cart"), [data-testid="add-to-cart-modal"]'
            )
            await expect(successIndicator.first()).toBeVisible({timeout: 10_000})
        }
    })

    test('Modal closes correctly', async ({page}) => {
        await navigateToPLP(page)

        const firstTile = page
            .locator('[data-testid="product-tile"], .product-tile, article')
            .first()
        await firstTile.hover()

        const qvBtn = page.locator('[data-testid="quick-view-btn"]').first()
        await qvBtn.click()

        const modal = page.locator('[data-testid="quick-view-modal"]')
        await expect(modal).toBeVisible({timeout: 10_000})

        // Click the close button (X icon)
        const closeBtn = modal.locator('button[aria-label="Close"]')
        await closeBtn.click()

        // Modal should disappear
        await expect(modal).not.toBeVisible({timeout: 5_000})

        // PLP should still be showing
        const tiles = page.locator(
            '[data-testid="product-tile"], .product-tile, article'
        )
        await expect(tiles.first()).toBeVisible()
    })

    test('Quick View does not navigate away from PLP', async ({page}) => {
        await navigateToPLP(page)
        const urlBefore = page.url()

        const firstTile = page
            .locator('[data-testid="product-tile"], .product-tile, article')
            .first()
        await firstTile.hover()

        const qvBtn = page.locator('[data-testid="quick-view-btn"]').first()
        await qvBtn.click()

        const modal = page.locator('[data-testid="quick-view-modal"]')
        await expect(modal).toBeVisible({timeout: 10_000})

        // Close via Escape key
        await page.keyboard.press('Escape')
        await expect(modal).not.toBeVisible({timeout: 5_000})

        // URL should be unchanged — still on PLP
        expect(page.url()).toBe(urlBefore)

        // Product tiles should still be rendered
        const tiles = page.locator(
            '[data-testid="product-tile"], .product-tile, article'
        )
        await expect(tiles.first()).toBeVisible()
    })
})
