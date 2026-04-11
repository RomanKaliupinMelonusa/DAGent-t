import {test, expect} from '@playwright/test'

test('debug quick view click', async ({page}) => {
    await page.goto('/category/womens', {waitUntil: 'domcontentloaded'})
    await page.locator('[data-testid^="sf-product-tile-"]').first().waitFor({state: 'visible', timeout: 20_000})
    
    const tileWrapper = page.locator('[role="group"]').filter({has: page.locator('[data-testid="quick-view-btn"]')}).first()
    
    // Log the HTML of the wrapper
    const wrapperHtml = await tileWrapper.innerHTML()
    console.log('=== TILE WRAPPER HTML (first 500 chars) ===')
    console.log(wrapperHtml.substring(0, 500))
    
    await tileWrapper.hover()
    
    const qvBtn = tileWrapper.locator('[data-testid="quick-view-btn"]')
    console.log('=== QV Button visible:', await qvBtn.isVisible())
    console.log('=== QV Button text:', await qvBtn.textContent())
    
    // Try clicking with force
    const urlBefore = page.url()
    await qvBtn.click({force: true})
    
    // Wait a moment and check
    await page.waitForTimeout(3000)
    const urlAfter = page.url()
    console.log('=== URL before:', urlBefore)
    console.log('=== URL after:', urlAfter)
    console.log('=== URL changed:', urlBefore !== urlAfter)
    
    // Check if modal appeared
    const modal = page.locator('[data-testid="quick-view-modal"]')
    const modalVisible = await modal.isVisible()
    console.log('=== Modal visible:', modalVisible)
    
    // Check all modals/overlays on the page
    const allModals = await page.locator('[role="dialog"]').count()
    console.log('=== Total dialogs on page:', allModals)
    
    const chakraModals = await page.locator('.chakra-modal__content').count()
    console.log('=== Chakra modal contents:', chakraModals)
    
    // Screenshot 
    await page.screenshot({path: 'test-results/debug-qv-click.png'})
})
