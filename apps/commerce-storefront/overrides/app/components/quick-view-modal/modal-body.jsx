/*
 * QuickViewModalBody — renders ProductView inside the Quick View modal.
 *
 * Uses useProductViewModal for product detail fetching and variation management.
 * Implements a slim addToCart handler (no pickup/ship-to-store).
 * Renders a "View Full Details" link to the PDP.
 */
import React from 'react'
import {useIntl} from 'react-intl'
import {Box, Text} from '@chakra-ui/react'
import {
    useShopperBasketsV2MutationHelper as useShopperBasketsMutationHelper
} from '@salesforce/commerce-sdk-react'
import ProductView from '@salesforce/retail-react-app/app/components/product-view'
import {useProductViewModal} from '@salesforce/retail-react-app/app/hooks/use-product-view-modal'
import Link from '@salesforce/retail-react-app/app/components/link'
import {productUrlBuilder} from '@salesforce/retail-react-app/app/utils/url'
import {useQuickView} from './context'
import messages from './messages'

const QuickViewModalBody = () => {
    const intl = useIntl()
    const {openProduct, closeQuickView} = useQuickView()

    // Fetch full product detail — only runs when the modal is mounted (gated by shell)
    const {product, isFetching} = useProductViewModal(openProduct)

    // Basket mutation helper — handles create-or-add logic
    const {addItemToNewOrExistingBasket} = useShopperBasketsMutationHelper()

    /**
     * Slim addToCart handler for Quick View.
     * No pickup/ship-to-store logic (FR-004).
     *
     * ProductView calls: addToCart([{product, variant, quantity}])
     * If this returns truthy, ProductView opens the AddToCartModal internally.
     */
    const handleAddToCart = async (productSelectionValues = []) => {
        const productItems = productSelectionValues.map((item) => {
            const {variant, quantity} = item
            const prod = variant || item.product || product
            return {
                productId: prod?.productId || prod?.id,
                price: prod?.price,
                quantity
            }
        })

        const result = await addItemToNewOrExistingBasket(productItems)

        // Close Quick View on success — ProductView will open the AddToCartModal
        // because we return truthy data.
        closeQuickView()

        return result
    }

    // Build PDP URL for the "View Full Details" link
    const productId = openProduct?.id || openProduct?.productId
    const pdpUrl = productId ? productUrlBuilder({id: productId}) : '#'

    return (
        <Box>
            {/* Heading anchors aria-labelledby on the modal shell */}
            <Text
                id="quick-view-modal-title"
                fontSize="xl"
                fontWeight="bold"
                mb={4}
                px={4}
                pt={2}
            >
                {product?.name || openProduct?.name || ''}
            </Text>

            <ProductView
                product={product}
                showDeliveryOptions={false}
                showImageGallery
                imageSize="md"
                category={undefined}
                addToCart={handleAddToCart}
                isProductLoading={isFetching}
            />

            <Box px={4} pb={4} textAlign="center">
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
