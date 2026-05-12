/*
 * QuickViewModalBody — renders ProductView inside the Quick View modal with
 * add-to-bag orchestration and a "View Full Details" link.
 *
 * Contract: contracts/quick-view-modal.md §B
 * SSR: This component is ONLY mounted when isOpen is true (gated by the shell),
 *      so hooks like useProductViewModal never run during SSR.
 */
import React, {useRef, useEffect, useCallback} from 'react'
import {useIntl} from 'react-intl'
import {Box, Text} from '@salesforce/retail-react-app/app/components/shared/ui'
import Link from '@salesforce/retail-react-app/app/components/link'
import ProductView from '@salesforce/retail-react-app/app/components/product-view'
import {useProductViewModal} from '@salesforce/retail-react-app/app/hooks/use-product-view-modal'
import {useShopperBasketsV2MutationHelper as useShopperBasketsMutationHelper} from '@salesforce/commerce-sdk-react'
import {productUrlBuilder} from '@salesforce/retail-react-app/app/utils/url'
import {useQuickView} from './context'
import messages from './messages'

/**
 * Imperatively tag the Add-to-Cart button(s) rendered by ProductView with
 * data-testid="quick-view-add-to-cart-btn". ProductView renders the button
 * internally with no testid; we locate it by the intl text "Add to Cart"
 * and apply the attribute. This runs after every render via a ref callback
 * and a MutationObserver for robustness across loading/variant transitions.
 */
const useTagCartButton = () => {
    const containerRef = useRef(null)

    const tagButtons = useCallback(() => {
        if (!containerRef.current) return
        const buttons = containerRef.current.querySelectorAll('button')
        for (const btn of buttons) {
            const text = btn.textContent || ''
            // Match the default "Add to Cart" text (or "Update" for cart edits)
            if (/add to cart/i.test(text) && !btn.hasAttribute('data-testid')) {
                btn.setAttribute('data-testid', 'quick-view-add-to-cart-btn')
            }
        }
    }, [])

    useEffect(() => {
        tagButtons()
        // Observe DOM mutations for when the button renders after loading
        if (!containerRef.current) return
        const observer = new MutationObserver(tagButtons)
        observer.observe(containerRef.current, {childList: true, subtree: true})
        return () => observer.disconnect()
    })

    return containerRef
}

const QuickViewModalBody = () => {
    const intl = useIntl()
    const {openProduct, closeQuickView} = useQuickView()
    const {addItemToNewOrExistingBasket} = useShopperBasketsMutationHelper()
    const containerRef = useTagCartButton()

    // Fetch full product detail from the PLP search hit
    const {product, isFetching} = useProductViewModal(openProduct)

    // PLP search hits use `productId`; productUrlBuilder expects `id`.
    const productId = openProduct?.id || openProduct?.productId
    const pdpUrl = productId ? productUrlBuilder({id: productId}) : '#'

    /**
     * Slim add-to-cart handler.
     * Signature matches what ProductView's addToCart prop expects:
     *   (productSelectionValues: Array<{product, variant, quantity}>) => Promise<any>
     *
     * Returning a truthy value tells ProductView to open the global AddToCartModal
     * via its internal useAddToCartModalContext().onOpen() call.
     * After the basket mutation succeeds, we close Quick View. The return value
     * propagates to ProductView which then opens the confirmation modal.
     */
    const handleAddToCart = async (productSelectionValues) => {
        const productItems = productSelectionValues.map(({variant, product: prod, quantity}) => ({
            productId: variant?.productId || prod?.productId || prod?.id,
            price: variant?.price || prod?.price,
            quantity
        }))

        await addItemToNewOrExistingBasket(productItems)
        closeQuickView()

        // Return truthy so ProductView opens the global AddToCartModal
        return productSelectionValues
    }

    return (
        <Box ref={containerRef}>
            {/* Heading anchors aria-labelledby on the modal shell */}
            <Text
                id="quick-view-modal-title"
                fontSize="xl"
                fontWeight="bold"
                mb={4}
                px={6}
                pt={4}
            >
                {product?.name || openProduct?.name || openProduct?.productName || ''}
            </Text>

            <Box px={{base: 0, lg: 4}}>
                <ProductView
                    product={product || openProduct}
                    showDeliveryOptions={false}
                    showImageGallery
                    imageSize="md"
                    category={undefined}
                    addToCart={handleAddToCart}
                    isProductLoading={isFetching}
                />
            </Box>

            {/* View Full Details link */}
            <Box textAlign="center" py={4} px={4}>
                <Link
                    data-testid="quick-view-view-full-details-link"
                    to={pdpUrl}
                    onClick={() => closeQuickView()}
                    color="blue.600"
                    fontWeight="semibold"
                    textDecoration="underline"
                    _hover={{color: 'blue.800'}}
                >
                    {intl.formatMessage(messages.viewFullDetailsLabel)}
                </Link>
            </Box>
        </Box>
    )
}

export default QuickViewModalBody
