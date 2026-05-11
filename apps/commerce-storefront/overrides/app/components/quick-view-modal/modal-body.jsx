/*
 * QuickViewModalBody — renders <ProductView> with product detail inside the
 * Quick View modal shell. Commerce hooks (useProductViewModal, basket mutations)
 * only fire when the modal is open because the shell gates mounting on `isOpen`.
 *
 * FR-004: showDeliveryOptions={false} — no Ship-to-Store / Pickup UI.
 */
import React, {useRef, useEffect} from 'react'
import {useIntl} from 'react-intl'
import {Box, Text} from '@chakra-ui/react'
import {useShopperBasketsV2Mutation as useShopperBasketsMutation} from '@salesforce/commerce-sdk-react'
import ProductView from '@salesforce/retail-react-app/app/components/product-view'
import {useProductViewModal} from '@salesforce/retail-react-app/app/hooks/use-product-view-modal'
import {useCurrentBasket} from '@salesforce/retail-react-app/app/hooks/use-current-basket'
import Link from '@salesforce/retail-react-app/app/components/link'
import {productUrlBuilder} from '@salesforce/retail-react-app/app/utils/url'
import {useQuickView} from './context'
import messages from './messages'

const QuickViewModalBody = () => {
    const intl = useIntl()
    const {openProduct, closeQuickView} = useQuickView()
    const {data: basket} = useCurrentBasket()
    const createBasket = useShopperBasketsMutation('createBasket')
    const addItemToBasket = useShopperBasketsMutation('addItemToBasket')
    const productViewContainerRef = useRef(null)

    // Normalize product id — PLP search hits use `productId`, detail responses use `id`
    const productId = openProduct?.id || openProduct?.productId
    const initialProduct = React.useMemo(
        () => ({...openProduct, id: productId, productId}),
        [openProduct, productId]
    )

    const {product, isFetching} = useProductViewModal(initialProduct)

    // Annotate the Add-to-Cart button rendered by ProductView with our testid.
    // ProductView renders the button internally with no data-testid; we add it
    // after render via a DOM query scoped to our container. SSR-safe because
    // this runs inside useEffect only.
    useEffect(() => {
        if (!productViewContainerRef.current) return

        const productView = productViewContainerRef.current.querySelector(
            '[data-testid="product-view"]'
        )
        if (!productView) return

        // Find the Add-to-Cart button. Since we only pass `addToCart`
        // (not `addToWishlist` or `updateCart`), there is exactly one
        // action button whose text contains "Add to Cart".
        const allButtons = productView.querySelectorAll('button')
        for (const btn of allButtons) {
            const text = btn.textContent || ''
            if (text.match(/add to/i)) {
                btn.setAttribute('data-testid', 'quick-view-add-to-cart-btn')
                break
            }
        }
    })

    const handleAddToCart = async (productSelectionValues) => {
        const productItems = productSelectionValues.map((item) => {
            const {variant, quantity} = item
            const selectedProduct = variant || item.product
            return {
                productId: selectedProduct?.productId || selectedProduct?.id,
                price: selectedProduct?.price,
                quantity
            }
        })

        if (!basket?.basketId) {
            await createBasket.mutateAsync({body: {productItems}})
        } else {
            await addItemToBasket.mutateAsync({
                parameters: {basketId: basket.basketId},
                body: productItems
            })
        }

        // Close Quick View — ProductView's internal handler will call
        // onAddToCartModalOpen via the closure-captured context ref
        closeQuickView()

        // Return items so ProductView opens the AddToCartModal
        return productItems
    }

    const pdpUrl = productUrlBuilder({id: productId})

    return (
        <Box>
            <Text
                id="quick-view-modal-title"
                fontSize="xl"
                fontWeight="bold"
                mb={4}
                data-testid="quick-view-modal-title"
            >
                {product?.name || openProduct?.name || ''}
            </Text>

            <Box ref={productViewContainerRef}>
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
                    onClick={() => closeQuickView()}
                    color="blue.600"
                    fontWeight="semibold"
                    textDecoration="underline"
                >
                    {intl.formatMessage(messages.viewFullDetailsLabel)}
                </Link>
            </Box>
        </Box>
    )
}

export default QuickViewModalBody
