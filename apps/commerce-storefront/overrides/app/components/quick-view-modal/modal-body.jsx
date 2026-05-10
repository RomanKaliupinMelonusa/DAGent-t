/*
 * QuickViewModalBody — renders ProductView inside the Quick View modal.
 *
 * Uses useProductViewModal for detail fetch + variation state.
 * Provides a slim addToCart handler that creates/adds to basket.
 * ProductView internally calls useAddToCartModalContext().onOpen() after
 * a successful addToCart return, which opens the global confirmation modal.
 *
 * Includes "View Full Details" link and respects FR-004 (no delivery options).
 */
import React, {useRef, useEffect} from 'react'
import {useIntl} from 'react-intl'
import {Box, Heading, Divider} from '@salesforce/retail-react-app/app/components/shared/ui'
import ProductView from '@salesforce/retail-react-app/app/components/product-view'
import {useProductViewModal} from '@salesforce/retail-react-app/app/hooks/use-product-view-modal'
import {useShopperBasketsV2MutationHelper as useShopperBasketsMutationHelper} from '@salesforce/commerce-sdk-react'
import Link from '@salesforce/retail-react-app/app/components/link'
import {productUrlBuilder} from '@salesforce/retail-react-app/app/utils/url'
import {useQuickView} from './context'
import messages from './messages'

const QuickViewModalBody = () => {
    const intl = useIntl()
    const {openProduct, closeQuickView} = useQuickView()
    const {product, isFetching} = useProductViewModal(openProduct)
    const {addItemToNewOrExistingBasket} = useShopperBasketsMutationHelper()
    const bodyRef = useRef(null)

    // Add data-testid to the Add-to-Cart button rendered by ProductView.
    // ProductView renders the button internally with proper disabled/validation logic;
    // we annotate it with a testid for E2E discoverability.
    // The button is identified as the first button whose text matches "Add to Cart"
    // (or set/bundle variants) but NOT "Add to Wishlist".
    useEffect(() => {
        if (!bodyRef.current) return
        const buttons = bodyRef.current.querySelectorAll('button')
        for (const btn of buttons) {
            const text = btn.textContent || ''
            if (
                (text.includes('Add to Cart') ||
                    text.includes('Add Set to Cart') ||
                    text.includes('Add Bundle to Cart')) &&
                !text.includes('Wishlist')
            ) {
                btn.setAttribute('data-testid', 'quick-view-add-to-cart-btn')
                break
            }
        }
    })

    // Slim addToCart handler matching the ProductView prop contract:
    // receives [{product, variant, quantity}], returns the items on success
    // so ProductView opens the global AddToCartModal.
    const handleAddToCart = async (productSelectionValues = []) => {
        const productItems = productSelectionValues.map((item) => {
            const {variant, quantity} = item
            const prod = variant || item.product
            return {
                productId: prod?.productId || prod?.id,
                price: prod?.price,
                quantity
            }
        })

        await addItemToNewOrExistingBasket(productItems)

        // Close the Quick View modal. ProductView will call onAddToCartModalOpen
        // after this function returns, opening the global confirmation modal.
        // React 18 batches both state updates into one re-render.
        closeQuickView()

        // Return productSelectionValues so ProductView opens AddToCartModal
        return productSelectionValues
    }

    const productId = openProduct?.id || openProduct?.productId
    const pdpUrl = productUrlBuilder({id: productId})

    return (
        <Box ref={bodyRef}>
            <Heading
                id="quick-view-modal-title"
                as="h2"
                size="lg"
                mb={4}
            >
                {product?.name || openProduct?.name}
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
                onClick={closeQuickView}
                color="blue.600"
                fontWeight="semibold"
                _hover={{textDecoration: 'underline'}}
            >
                {intl.formatMessage(messages.viewFullDetailsLabel)}
            </Link>
        </Box>
    )
}

export default QuickViewModalBody
