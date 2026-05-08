/*
 * QuickViewModalBody — renders ProductView inside the Quick View modal.
 *
 * Fetches product detail via useProductViewModal, wires add-to-cart handler,
 * and provides the "View Full Details" link.
 *
 * The addToCart handler uses useShopperBasketsMutationHelper which handles
 * both create-basket-if-needed and add-item flows. ProductView internally
 * calls useAddToCartModalContext().onOpen on success (when addToCart returns
 * truthy), so we do NOT call it here.
 */
import React from 'react'
import {useIntl} from 'react-intl'
import {Box, Heading} from '@salesforce/retail-react-app/app/components/shared/ui'
import Link from '@salesforce/retail-react-app/app/components/link'
import ProductView from '@salesforce/retail-react-app/app/components/product-view'
import {useProductViewModal} from '@salesforce/retail-react-app/app/hooks/use-product-view-modal'
import {
    useShopperBasketsV2MutationHelper as useShopperBasketsMutationHelper
} from '@salesforce/commerce-sdk-react'
import {productUrlBuilder} from '@salesforce/retail-react-app/app/utils/url'
import {useQuickView} from './context'
import messages from './messages'

const QuickViewModalBody = () => {
    const intl = useIntl()
    const {openProduct, closeQuickView} = useQuickView()
    const {product, isFetching} = useProductViewModal(openProduct)
    const {addItemToNewOrExistingBasket} = useShopperBasketsMutationHelper()

    const handleAddToCart = async (productSelectionValues) => {
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

        // Close the Quick View modal. React 18 batches this with the
        // subsequent onAddToCartModalOpen call inside ProductView's
        // handleCartItem, so both state updates render in one paint.
        closeQuickView()

        // Return the selection values so ProductView's internal handler
        // knows the add was successful and opens the AddToCartModal.
        return productSelectionValues
    }

    const productUrl = productUrlBuilder({id: openProduct?.id || openProduct?.productId})

    return (
        <Box>
            <Heading
                id="quick-view-modal-title"
                as="h2"
                fontSize="lg"
                mb={4}
            >
                {product?.name || openProduct?.name || ''}
            </Heading>

            <Box data-testid="quick-view-add-to-cart-btn">
                <ProductView
                    product={product || openProduct}
                    showDeliveryOptions={false}
                    showImageGallery
                    imageSize="md"
                    category={undefined}
                    addToCart={handleAddToCart}
                    isLoading={isFetching}
                />
            </Box>

            <Box textAlign="center" mt={4} mb={2}>
                <Link
                    data-testid="quick-view-view-full-details-link"
                    to={productUrl}
                    onClick={() => closeQuickView()}
                    color="blue.600"
                    fontWeight="semibold"
                    _hover={{textDecoration: 'underline'}}
                >
                    {intl.formatMessage(messages.viewFullDetailsLabel)}
                </Link>
            </Box>
        </Box>
    )
}

export default QuickViewModalBody
