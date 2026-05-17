/*
 * QuickViewModalBody — renders ProductView inside the Quick View modal.
 *
 * - Uses useProductViewModal to fetch/manage product detail + variation state.
 * - Passes showDeliveryOptions={false} to suppress Pickup/Ship-to-Store (FR-004).
 * - Wires a slim addToCart handler that creates/updates the basket and closes
 *   the Quick View on success, letting ProductView open the global confirmation modal.
 * - Renders a "View Full Details" link to the PDP.
 *
 * See: contracts/quick-view-modal.md §B
 */
import React, {useRef, useEffect} from 'react'
import {useIntl} from 'react-intl'
import {Box, Heading} from '@salesforce/retail-react-app/app/components/shared/ui'
import ProductView from '@salesforce/retail-react-app/app/components/product-view'
import {useProductViewModal} from '@salesforce/retail-react-app/app/hooks/use-product-view-modal'
import {useCurrentBasket} from '@salesforce/retail-react-app/app/hooks/use-current-basket'
import {useShopperBasketsV2Mutation as useShopperBasketsMutation} from '@salesforce/commerce-sdk-react'
import Link from '@salesforce/retail-react-app/app/components/link'
import {productUrlBuilder} from '@salesforce/retail-react-app/app/utils/url'

import {useQuickView} from './context'
import messages from './messages'

const QuickViewModalBody = () => {
    const intl = useIntl()
    const {openProduct, closeQuickView} = useQuickView()
    const {product, isFetching} = useProductViewModal(openProduct)
    const {data: basket} = useCurrentBasket()
    const createBasket = useShopperBasketsMutation('createBasket')
    const addItemToBasket = useShopperBasketsMutation('addItemToBasket')

    /**
     * Slim add-to-cart handler.
     * ProductView calls this with [{product, variant, quantity}].
     * On success we close the Quick View and return items so ProductView
     * opens the global AddToCartModal via onAddToCartModalOpen.
     */
    const handleAddToCart = async (productSelectionValues) => {
        const productItems = productSelectionValues.map(({variant, product: p, quantity}) => ({
            productId: variant?.productId || p?.productId || p?.id,
            price: variant?.price || p?.price,
            quantity
        }))

        if (!basket?.basketId) {
            await createBasket.mutateAsync({body: {productItems}})
        } else {
            await addItemToBasket.mutateAsync({
                parameters: {basketId: basket.basketId},
                body: productItems
            })
        }

        // Close the Quick View modal. React batches this state update, so
        // the caller (ProductView's handleCartItem) still gets to run
        // onAddToCartModalOpen before the unmount is processed.
        closeQuickView()

        // Return the selection so ProductView opens the global confirmation modal.
        return productSelectionValues
    }

    const pdpUrl = productUrlBuilder({id: openProduct?.productId || openProduct?.id})

    // Ref for annotating the Add-to-Bag button with data-testid.
    // ProductView renders its own button internally; we cannot pass a testid prop.
    // Instead, we locate the solid-variant button (the Add-to-Cart button) and tag it.
    const productViewRef = useRef(null)
    useEffect(() => {
        if (!productViewRef.current) return
        // The Add-to-Cart button is the first solid-variant button inside ProductView
        const buttons = productViewRef.current.querySelectorAll('button')
        for (const btn of buttons) {
            const text = btn.textContent?.toLowerCase() || ''
            if (
                text.includes('add to cart') ||
                text.includes('add to bag') ||
                text.includes('add set to cart') ||
                text.includes('add bundle to cart')
            ) {
                btn.setAttribute('data-testid', 'quick-view-add-to-cart-btn')
                break
            }
        }
    })

    return (
        <Box>
            {/* Heading anchors the modal's aria-labelledby */}
            <Heading id="quick-view-modal-title" size="md" mb={4}>
                {product?.name || product?.productName || openProduct?.name || openProduct?.productName}
            </Heading>

            <Box ref={productViewRef}>
                <ProductView
                    product={product}
                    showDeliveryOptions={false}
                    showImageGallery
                    imageSize="md"
                    category={undefined}
                    addToCart={handleAddToCart}
                    isProductLoading={isFetching}
                />
            </Box>

            <Box textAlign="center" mt={4} mb={2}>
                <Link
                    data-testid="quick-view-view-full-details-link"
                    to={pdpUrl}
                    onClick={closeQuickView}
                >
                    {intl.formatMessage(messages.viewFullDetailsLabel)}
                </Link>
            </Box>
        </Box>
    )
}

export default QuickViewModalBody
