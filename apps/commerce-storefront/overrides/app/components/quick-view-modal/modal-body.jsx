/*
 * QuickViewModalBody — renders ProductView inside the Quick View modal.
 *
 * Uses useProductViewModal for data fetching and variation state.
 * Passes showDeliveryOptions={false} to suppress Pickup-in-Store UI (FR-004).
 *
 * The Add-to-Cart button testid (quick-view-add-to-cart-btn) is stamped via
 * a post-render effect because ProductView renders the button internally and
 * does not expose a testid prop for it. The effect re-runs on every render
 * to keep the testid in sync with DOM updates (e.g., button disabled state).
 */
import React, {useRef, useEffect, useState, useCallback} from 'react'
import {useIntl} from 'react-intl'
import {Box, Heading, Flex} from '@salesforce/retail-react-app/app/components/shared/ui'
import Link from '@salesforce/retail-react-app/app/components/link'
import ProductView from '@salesforce/retail-react-app/app/components/product-view'
import {useProductViewModal} from '@salesforce/retail-react-app/app/hooks/use-product-view-modal'
import {
    useShopperBasketsV2MutationHelper as useShopperBasketsMutationHelper
} from '@salesforce/commerce-sdk-react'
import {useAddToCartModalContext} from '@salesforce/retail-react-app/app/hooks/use-add-to-cart-modal'
import {productUrlBuilder} from '@salesforce/retail-react-app/app/utils/url'
import {useQuickView} from './context'
import messages from './messages'

const QuickViewModalBody = () => {
    const intl = useIntl()
    const {openProduct, closeQuickView} = useQuickView()
    const [variationValues, setVariationValues] = useState({})
    const {product, isFetching} = useProductViewModal(openProduct, variationValues)
    const {addItemToNewOrExistingBasket} = useShopperBasketsMutationHelper()
    const {isOpen: isAddToCartModalOpen} = useAddToCartModalContext()
    const containerRef = useRef(null)

    // Handle variation changes from ProductView's swatch/size selectors.
    // This keeps variant selection in React state instead of URL params,
    // which is required for modal context (we're not on the PDP URL).
    const handleVariationChange = useCallback((attribute, value) => {
        setVariationValues((prev) => ({
            ...prev,
            [attribute]: value
        }))
    }, [])

    // When the add-to-cart confirmation modal opens, close the Quick View modal.
    // This must happen via effect rather than inside handleAddToCart because
    // ProductView's internal handler calls onAddToCartModalOpen AFTER our
    // addToCart callback returns. If we close the quick view inside
    // handleAddToCart, the unmount races ProductView's onAddToCartModalOpen call.
    useEffect(() => {
        if (isAddToCartModalOpen) {
            closeQuickView()
        }
    }, [isAddToCartModalOpen, closeQuickView])

    // Stamp data-testid on the Add-to-Cart button rendered by ProductView.
    // ProductView's button is identified by its "Add to Cart" text content.
    useEffect(() => {
        if (!containerRef.current) return
        const buttons = containerRef.current.querySelectorAll('button')
        for (const btn of buttons) {
            const text = (btn.textContent || '').toLowerCase()
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

    const productId = openProduct?.id || openProduct?.productId
    const pdpUrl = productId ? productUrlBuilder({id: productId}) : '#'

    const handleAddToCart = async (productSelectionValues) => {
        const productItems = productSelectionValues.map((item) => {
            const {variant, quantity} = item
            const prod = variant || item.product || product
            return {
                productId: prod?.productId || prod?.id,
                price: prod?.price,
                quantity
            }
        })

        await addItemToNewOrExistingBasket(productItems)
        // Do NOT call closeQuickView() here — ProductView needs to remain
        // mounted so it can call onAddToCartModalOpen after this returns.
        // The useEffect above watches isAddToCartModalOpen and closes
        // the quick view once the confirmation modal is open.
        return productSelectionValues
    }

    return (
        <Flex direction="column" height="100%">
            <Heading
                id="quick-view-modal-title"
                as="h2"
                fontSize="lg"
                mb={4}
                px={6}
                pt={4}
            >
                {product?.name || openProduct?.name || ''}
            </Heading>
            <Box flex="1" overflow="auto" px={6} pb={4} ref={containerRef}>
                <ProductView
                    product={product || openProduct}
                    showDeliveryOptions={false}
                    showImageGallery
                    imageSize="md"
                    category={undefined}
                    addToCart={handleAddToCart}
                    isProductLoading={isFetching}
                    controlledVariationValues={variationValues}
                    onVariationChange={handleVariationChange}
                />
            </Box>
            <Box px={6} pb={6} pt={2}>
                <Link
                    data-testid="quick-view-view-full-details-link"
                    to={pdpUrl}
                    onClick={() => closeQuickView()}
                    color="blue.600"
                    fontWeight="semibold"
                    textAlign="center"
                    display="block"
                    _hover={{textDecoration: 'underline'}}
                >
                    {intl.formatMessage(messages.viewFullDetailsLabel)}
                </Link>
            </Box>
        </Flex>
    )
}

export default QuickViewModalBody
