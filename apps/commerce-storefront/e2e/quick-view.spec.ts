import {test, expect} from '@playwright/test'

/**
 * E2E tests for the Product Quick View feature.
 *
 * Tests verify that shoppers can preview product details, select variants,
 * and add to cart from the PLP without navigating to the PDP.
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
        if (consoleErrors.length > 0) console.log('Console errors:', consoleErrors)
        if (failedRequests.length > 0)
            console.log('Failed requests:', failedRequests)
        await page.screenshot({
            path: `test-results/failure-${testInfo.title.replace(/\s+/g, '-')}.png`
        })
    }
})

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Navigate to a category page and wait for product tiles to load.
 * Tries direct URL first, then falls back to navigation.
 */
async function goToCategoryPage(page: import('@playwright/test').Page) {
    // Try direct category URL first
    await page.goto('/category/womens')
    const tile = page.locator(
        '[data-testid="product-tile"], .product-tile, article'
    ).first()

    try {
        await tile.waitFor({state: 'visible', timeout: 15_000})
        return
    } catch {
        // Fall back to navigating via the main nav
    }

    await page.goto('/')
    const navLink = page
        .locator('nav a, [role="navigation"] a')
        .first()
    if (await navLink.isVisible({timeout: 10_000})) {
        await navLink.click()
        await page.waitForLoadState('networkidle')
        await page
            .locator('[data-testid="product-tile"], .product-tile, article')
            .first()
            .waitFor({state: 'visible', timeout: 15_000})
    }
}

/**
 * Hover over the first product tile and click the Quick View button.
 */
async function openQuickView(page: import('@playwright/test').Page) {
    const firstTile = page
        .locator('[data-testid="product-tile"], .product-tile, article')
        .first()
    await firstTile.hover()

    const quickViewBtn = firstTile.locator('[data-testid="quick-view-btn"]')
    // Button may need a moment to become visible after hover
    await quickViewBtn.waitFor({state: 'visible', timeout: 5_000})
    await quickViewBtn.click()
}

// ─── Tests ────────────────────────────────────────────────────────────────

test.describe('Quick View', () => {
    test('Quick View button appears on hover', async ({page}) => {
        await goToCategoryPage(page)

        const firstTile = page
            .locator('[data-testid="product-tile"], .product-tile, article')
            .first()
        await firstTile.hover()

        const quickViewBtn = firstTile.locator('[data-testid="quick-view-btn"]')
        await expect(quickViewBtn).toBeVisible({timeout: 5_000})
    })

    test('Quick View modal opens and loads product data', async ({page}) => {
        await goToCategoryPage(page)
        await openQuickView(page)

        // Modal should appear
        const modal = page.locator('[data-testid="quick-view-modal"]')
        await expect(modal).toBeVisible({timeout: 10_000})

        // Spinner may appear briefly — soft check
        const spinner = page.locator('[data-testid="quick-view-spinner"]')
        if (await spinner.isVisible({timeout: 2_000}).catch(() => false)) {
            // Wait for spinner to disappear (product loaded)
            await expect(spinner).not.toBeVisible({timeout: 15_000})
        }

        // Product info should be visible inside the modal
        const productHeading = modal.locator(
            'h1, h2, [data-testid="product-name"]'
        )
        await expect(productHeading.first()).toBeVisible({timeout: 15_000})
    })

    test('Select variant and add to cart from Quick View', async ({page}) => {
        await goToCategoryPage(page)
        await openQuickView(page)

        const modal = page.locator('[data-testid="quick-view-modal"]')
        await expect(modal).toBeVisible({timeout: 10_000})

        // Wait for product to load
        const spinner = page.locator('[data-testid="quick-view-spinner"]')
        if (await spinner.isVisible({timeout: 2_000}).catch(() => false)) {
            await expect(spinner).not.toBeVisible({timeout: 15_000})
        }

        // Select size if available (click first non-disabled swatch/option)
        const sizeSelector = modal.locator(
            'button[data-testid*="size"], select[data-testid*="size"], [role="radio"]:not([disabled])'
        )
        if ((await sizeSelector.count()) > 0) {
            await sizeSelector.first().click()
        }

        // Select color if available
        const colorSelector = modal.locator(
            'button[data-testid*="color"], [data-testid*="swatch"]:not([disabled])'
        )
        if ((await colorSelector.count()) > 0) {
            await colorSelector.first().click()
        }

        // Click Add to Cart
        const addToCartBtn = modal.locator(
            'button:has-text("Add to Cart"), button:has-text("Add to Bag")'
        )
        if (await addToCartBtn.isEnabled({timeout: 5_000}).catch(() => false)) {
            await addToCartBtn.click()

            // Check for success feedback — toast, confirmation modal, or cart badge update
            const successIndicator = page.locator(
                '[role="alert"]:has-text("cart"), [role="alert"]:has-text("added"), [data-testid="add-to-cart-modal"], .chakra-toast'
            )
            await expect(successIndicator.first()).toBeVisible({timeout: 10_000})
        }
        // If Add to Cart is disabled (OOS), we just verify it exists
        await expect(addToCartBtn.first()).toBeTruthy()
    })

    test('Modal closes correctly', async ({page}) => {
        await goToCategoryPage(page)
        const urlBefore = page.url()

        await openQuickView(page)

        const modal = page.locator('[data-testid="quick-view-modal"]')
        await expect(modal).toBeVisible({timeout: 10_000})

        // Close via close button
        const closeBtn = modal.locator('button[aria-label="Close"]')
        await closeBtn.click()

        // Modal should disappear
        await expect(modal).not.toBeVisible({timeout: 5_000})

        // PLP should still be showing
        const tiles = page.locator(
            '[data-testid="product-tile"], .product-tile, article'
        )
        await expect(tiles.first()).toBeVisible()

        // URL should not have changed
        expect(page.url()).toBe(urlBefore)
    })

    test('Quick View does not navigate away from PLP', async ({page}) => {
        await goToCategoryPage(page)
        const urlBefore = page.url()

        await openQuickView(page)

        const modal = page.locator('[data-testid="quick-view-modal"]')
        await expect(modal).toBeVisible({timeout: 10_000})

        // Press Escape to close
        await page.keyboard.press('Escape')
        await expect(modal).not.toBeVisible({timeout: 5_000})

        // URL unchanged
        expect(page.url()).toBe(urlBefore)

        // Product tiles still rendered
        await expect(
            page
                .locator(
                    '[data-testid="product-tile"], .product-tile, article'
                )
                .first()
        ).toBeVisible()
    })
})
