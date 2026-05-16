/*
 * QuickViewModalBody — renders the product detail view inside the Quick View
 * modal, using the base ProductView with `showDeliveryOptions={false}`.
 *
 * Contract: contracts/quick-view-modal.md §B
 *
 * The body is only mounted when `isOpen === true` (gated by the shell),
 * so hooks like `useProductViewModal` never run during SSR or while closed.
 */
import React, {useRef, useEffect, useCallback} from 'react'
import {useIntl} from 'react-intl'
import {Box, Flex} from '@salesforce/retail-react-app/app/components/shared/ui'
import Link from '@salesforce/retail-react-app/app/components/link'
import ProductView from '@salesforce/retail-react-app/app/components/product-view'
import {useProductViewModal} from '@salesforce/retail-react-app/app/hooks/use-product-view-modal'
import {useCurrentBasket} from '@salesforce/retail-react-app/app/hooks/use-current-basket'
import {useAddToCartModalContext} from '@salesforce/retail-react-app/app/hooks/use-add-to-cart-modal'
import {useShopperBasketsV2Mutation as useShopperBasketsMutation} from '@salesforce/commerce-sdk-react'
import {productUrlBuilder} from '@salesforce/retail-react-app/app/utils/url'
import {useQuickView} from './context'
import messages from './messages'

const QuickViewModalBody = () => {
    const intl = useIntl()
    const {openProduct, closeQuickView} = useQuickView()
    const addToCartModalContext = useAddToCartModalContext()
    const productViewWrapperRef = useRef(null)

    // Fetch full product detail for the opened product
    const {product} = useProductViewModal(openProduct)

    // Basket hooks for add-to-bag
    const {data: basket} = useCurrentBasket()
    const createBasket = useShopperBasketsMutation('createBasket')
    const addItemToBasket = useShopperBasketsMutation('addItemToBasket')

    // Tag the add-to-cart button rendered by ProductView with our testid
    // so E2E tests can target it. We also tag the wrapper with the testid
    // for disabled-state assertions.
    useEffect(() => {
        if (!productViewWrapperRef.current) return
        const addToCartText = intl.formatMessage({
            id: 'product_view.button.add_to_cart',
            defaultMessage: 'Add to Cart'
        })
        const btns = productViewWrapperRef.current.querySelectorAll('button')
        for (const btn of btns) {
            const text = btn.textContent?.trim()
            if (text === addToCartText) {
                btn.setAttribute('data-testid', 'quick-view-add-to-cart-btn')
            }
        }
    })

    /**
     * Slim Add-to-Bag handler.
     *
     * Called by ProductView's internal handleCartItem with [{product, variant, quantity}].
     * We perform the basket mutation, close Quick View, and open the global
     * add-to-cart confirmation modal.
     *
     * Returns `undefined` so ProductView does NOT also call onAddToCartModalOpen.
     */
    const handleAddToCart = useCallback(
        async (items) => {
            const [{variant, quantity, product: itemProduct}] = items
            const productId =
                variant?.productId || itemProduct?.productId || openProduct?.id
            const productItems = [{productId, quantity}]

            if (!basket?.basketId) {
                await createBasket.mutateAsync({body: {productItems}})
            } else {
                await addItemToBasket.mutateAsync({
                    parameters: {basketId: basket.basketId},
                    body: productItems
                })
            }

            // Close quick view first, then open the global add-to-cart confirmation.
            // Pass the original items array (with product/variant/quantity) as itemsAdded
            // because AddToCartModal iterates over itemsAdded and accesses product.imageGroups.
            const productForModal = itemProduct || product
            closeQuickView()
            addToCartModalContext.onOpen({
                product: productForModal,
                itemsAdded: items,
                selectedQuantity: quantity
            })

            // Return undefined so ProductView does not also open the modal
        },
        [
            basket?.basketId,
            createBasket,
            addItemToBasket,
            closeQuickView,
            addToCartModalContext,
            product,
            openProduct
        ]
    )

    const productIdentifier = openProduct?.productId || openProduct?.id
    const pdpUrl = productUrlBuilder({id: productIdentifier})

    return (
        <Flex direction="column" height="100%">
            {/* Heading — anchor for aria-labelledby */}
            <Box
                id="quick-view-modal-title"
                fontSize="xl"
                fontWeight="bold"
                px={4}
                pt={4}
                pb={2}
            >
                {product?.name || openProduct?.name || openProduct?.productName}
            </Box>

            {/* Product detail view — no delivery options (FR-004) */}
            <Box flex="1" overflow="auto" px={4} ref={productViewWrapperRef}>
                <ProductView
                    product={product}
                    showDeliveryOptions={false}
                    showImageGallery
                    imageSize="md"
                    category={undefined}
                    addToCart={handleAddToCart}
                />
            </Box>

            {/* View Full Details link */}
            <Box px={4} py={4} textAlign="center">
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
        </Flex>
    )
}

export default QuickViewModalBody
