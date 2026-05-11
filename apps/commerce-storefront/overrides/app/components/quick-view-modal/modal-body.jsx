/*
 * QuickViewModalBody — product detail content rendered inside the modal shell.
 *
 * Calls useProductViewModal to fetch full product data only when the modal opens.
 * Renders base ProductView with showDeliveryOptions={false} (FR-004).
 * Provides a slim addToCart handler that adds to basket and hands off to the
 * existing global AddToCartModal on success.
 *
 * Contract: contracts/quick-view-modal.md §B
 */
import React, {useRef, useEffect, useCallback} from 'react'
import {useIntl} from 'react-intl'
import {
    Box,
    Heading,
    Divider
} from '@salesforce/retail-react-app/app/components/shared/ui'
import ProductView from '@salesforce/retail-react-app/app/components/product-view'
import {useProductViewModal} from '@salesforce/retail-react-app/app/hooks/use-product-view-modal'
import {useShopperBasketsV2MutationHelper as useShopperBasketsMutationHelper} from '@salesforce/commerce-sdk-react'
import Link from '@salesforce/retail-react-app/app/components/link'
import {productUrlBuilder} from '@salesforce/retail-react-app/app/utils/url'
import {useQuickView} from './context'
import messages from './messages'

/**
 * Tag the Add-to-Cart button rendered by ProductView with our contract testid.
 *
 * ProductView's renderActionButtons() pushes the cart button first into its
 * buttons array. The button is inside a dedicated Box container separate from
 * the swatch/variation area. We skip buttons that are inside swatch groups
 * (role="radiogroup"), image gallery, or are icon/close buttons.
 */
const tagAddToCartButton = (containerEl) => {
    if (!containerEl) return
    const productView = containerEl.querySelector('[data-testid="product-view"]')
    if (!productView) return

    const allButtons = productView.querySelectorAll('button')
    for (const btn of allButtons) {
        // Already tagged
        if (btn.getAttribute('data-testid') === 'quick-view-add-to-cart-btn') return
        // Skip swatch buttons (inside radio groups)
        if (btn.closest('[role="radiogroup"]')) continue
        // Skip image gallery navigation buttons
        if (btn.closest('[class*="image-gallery"]') || btn.closest('.image-gallery')) continue
        // Skip close buttons
        if (btn.getAttribute('aria-label') === 'Close') continue
        // Skip icon-only buttons (small swatch/heart/arrow buttons without text)
        // The Add to Cart button has substantial text content
        const text = (btn.textContent || '').trim()
        if (!text || text.length < 3) continue
        // Skip wishlist button (contains "Wishlist" text)
        if (/wishlist/i.test(text)) continue
        // This should be the Add to Cart button
        btn.setAttribute('data-testid', 'quick-view-add-to-cart-btn')
        return
    }
}

const QuickViewModalBody = () => {
    const intl = useIntl()
    const {openProduct, closeQuickView} = useQuickView()
    const containerRef = useRef(null)

    // Fetch full product detail only when the modal is open (gated by shell).
    const {product, isFetching} = useProductViewModal(openProduct)
    const {addItemToNewOrExistingBasket} = useShopperBasketsMutationHelper()

    // Tag the Add-to-Cart button after each render.
    useEffect(() => {
        // Small delay to allow Chakra to finish rendering the button
        const id = requestAnimationFrame(() => {
            tagAddToCartButton(containerRef.current)
        })
        return () => cancelAnimationFrame(id)
    })

    /**
     * Slim add-to-cart handler — mirrors PDP's handleAddToCart without
     * pickup/ship-to-store or Einstein logic (out of scope for Quick View v1).
     *
     * ProductView calls: addToCart([{product, variant, quantity}])
     * Returns the selection values on success so ProductView can open the
     * global AddToCartModal confirmation via its internal onAddToCartModalOpen.
     */
    const handleAddToCart = useCallback(
        async (productSelectionValues = []) => {
            const productItems = productSelectionValues.map((item) => {
                const {variant, quantity} = item
                const prod = variant || item.product || product
                return {
                    productId: prod?.productId || prod?.id,
                    price: prod?.price,
                    quantity
                }
            })

            // addItemToNewOrExistingBasket handles create-or-add in one call.
            await addItemToNewOrExistingBasket(productItems)

            // Close Quick View modal. ProductView's internal handleCartItem will
            // call onAddToCartModalOpen with the returned value, opening the global
            // add-to-cart confirmation modal. Both state updates (close + open) are
            // batched by React 18.
            closeQuickView()

            // Return the selection so ProductView triggers the confirmation modal.
            return productSelectionValues
        },
        [product, addItemToNewOrExistingBasket, closeQuickView]
    )

    const pdpUrl = productUrlBuilder({id: openProduct?.id || openProduct?.productId})

    return (
        <Box ref={containerRef}>
            <Heading
                id="quick-view-modal-title"
                as="h2"
                size="md"
                mb={4}
            >
                {product?.name || openProduct?.name || ''}
            </Heading>

            <ProductView
                product={product || openProduct}
                showDeliveryOptions={false}
                showImageGallery
                imageSize="md"
                category={undefined}
                addToCart={handleAddToCart}
                isProductLoading={isFetching}
            />

            <Divider my={4} />

            <Link
                data-testid="quick-view-view-full-details-link"
                to={pdpUrl}
                onClick={() => closeQuickView()}
                color="blue.600"
                fontWeight="semibold"
                textAlign="center"
                display="block"
            >
                {intl.formatMessage(messages.viewFullDetailsLabel)}
            </Link>
        </Box>
    )
}

export default QuickViewModalBody
