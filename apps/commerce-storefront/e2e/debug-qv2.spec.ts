import {test, expect} from '@playwright/test'

test('debug modal content', async ({page}) => {
    await page.goto('/category/womens', {waitUntil: 'domcontentloaded'})
    await page.locator('[data-testid^="sf-product-tile-"]').first().waitFor({state: 'visible', timeout: 20_000})
    
    const tileWrapper = page.locator('[role="group"]').filter({has: page.locator('[data-testid="quick-view-btn"]')}).first()
    await tileWrapper.hover()
    
    const qvBtn = tileWrapper.locator('[data-testid="quick-view-btn"]')
    await qvBtn.click({force: true})
    
    // Wait for React to render
    await page.waitForTimeout(3000)
    
    // Check the Chakra modal content
    const modalContent = page.locator('.chakra-modal__content')
    const count = await modalContent.count()
    console.log('=== Chakra modal content count:', count)
    
    for (let i = 0; i < count; i++) {
        const mc = modalContent.nth(i)
        const visible = await mc.isVisible()
        const html = await mc.innerHTML()
        console.log(`=== Modal ${i}: visible=${visible}, HTML (first 300):`, html.substring(0, 300))
        
        // Check data-testid
        const testId = await mc.getAttribute('data-testid')
        console.log(`=== Modal ${i}: data-testid=${testId}`)
    }
    
    // Check dialogs
    const dialogs = page.locator('[role="dialog"]')
    const dialogCount = await dialogs.count()
    console.log('=== Dialog count:', dialogCount)
    
    for (let i = 0; i < dialogCount; i++) {
        const d = dialogs.nth(i)
        const visible = await d.isVisible()
        const testId = await d.getAttribute('data-testid')
        const ariaLabel = await d.getAttribute('aria-label')
        console.log(`=== Dialog ${i}: visible=${visible}, testid=${testId}, aria-label=${ariaLabel}`)
    }
    
    // Also check the overlay
    const overlays = page.locator('.chakra-modal__overlay')
    console.log('=== Overlay count:', await overlays.count())
    for (let i = 0; i < await overlays.count(); i++) {
        console.log(`=== Overlay ${i} visible:`, await overlays.nth(i).isVisible())
    }
})
