/*
 * QuickViewModalBody — renders <ProductView> with product detail inside the
 * Quick View modal shell. Commerce hooks (useProductViewModal, basket mutations)
 * only fire when the modal is open because the shell gates mounting on `isOpen`.
 *
 * FR-004: showDeliveryOptions={false} — no Ship-to-Store / Pickup UI.
 */
import React, {useRef, useEffect, useCallback} from 'react'
import {useIntl} from 'react-intl'
import {Box, Text} from '@chakra-ui/react'
import {useShopperBasketsV2MutationHelper as useShopperBasketsMutationHelper} from '@salesforce/commerce-sdk-react'
import ProductView from '@salesforce/retail-react-app/app/components/product-view'
import {useProductViewModal} from '@salesforce/retail-react-app/app/hooks/use-product-view-modal'
import Link from '@salesforce/retail-react-app/app/components/link'
import {productUrlBuilder} from '@salesforce/retail-react-app/app/utils/url'
import {useQuickView} from './context'
import messages from './messages'

const QuickViewModalBody = () => {
    const intl = useIntl()
    const {openProduct, closeQuickView} = useQuickView()
    const {addItemToNewOrExistingBasket} = useShopperBasketsMutationHelper()
    const productViewContainerRef = useRef(null)

    // Normalize product id — PLP search hits use `productId`, detail responses use `id`
    const productId = openProduct?.id || openProduct?.productId
    const initialProduct = React.useMemo(
        () => ({...openProduct, id: productId, productId}),
        [openProduct, productId]
    )

    const {product, isFetching} = useProductViewModal(initialProduct)

    // Annotate the Add-to-Cart button rendered by ProductView with our testid
    // and enforce the disabled state when variant selection is incomplete.
    //
    // ProductView's button is only disabled by `showInventoryMessage` (stock-level
    // checks), but `validateOrderability` also rejects clicks when a master product
    // has no variant selected. To keep the button state consistent with what
    // the click handler will actually do, we mirror that check here.
    useEffect(() => {
        if (!productViewContainerRef.current) return

        const productView = productViewContainerRef.current.querySelector(
            '[data-testid="product-view"]'
        )
        if (!productView) return

        // Determine if a variant selection is required but missing.
        // ProductView's useDerivedProduct exposes the selected swatch state
        // via aria-checked="true" on the swatch buttons.
        const hasVariationAttrs = product?.variationAttributes?.length > 0
        let allVariationsSelected = true
        if (hasVariationAttrs) {
            // Each SwatchGroup is a [role="radiogroup"]. If any group has no
            // aria-checked="true" swatch, then the variation is incomplete.
            const swatchGroups = productView.querySelectorAll('[role="radiogroup"]')
            for (const group of swatchGroups) {
                const selected = group.querySelector('[aria-checked="true"]')
                if (!selected) {
                    allVariationsSelected = false
                    break
                }
            }
        }

        const needsVariant = hasVariationAttrs && !allVariationsSelected

        // Find the Add-to-Cart button. Since we only pass `addToCart`
        // (not `addToWishlist` or `updateCart`), there is exactly one
        // action button whose text contains "Add to Cart".
        const allButtons = productView.querySelectorAll('button')
        for (const btn of allButtons) {
            const text = btn.textContent || ''
            if (text.match(/add to/i)) {
                btn.setAttribute('data-testid', 'quick-view-add-to-cart-btn')
                // Disable the button when variant selection is incomplete
                // so the E2E test knows to select variations first.
                if (needsVariant || isFetching) {
                    btn.disabled = true
                }
                break
            }
        }
    })

    const handleAddToCart = useCallback(async (productSelectionValues) => {
        // Build the slim payload for the basket API
        const productItems = productSelectionValues.map((item) => {
            const {variant, quantity} = item
            const selectedProduct = variant || item.product
            return {
                productId: selectedProduct?.productId || selectedProduct?.id,
                price: selectedProduct?.price,
                quantity
            }
        })

        await addItemToNewOrExistingBasket(productItems)

        // Close Quick View — ProductView's internal handler will call
        // onAddToCartModalOpen via the closure-captured context ref
        closeQuickView()

        // Return the original selection values (with full product/variant objects)
        // so ProductView can pass them to AddToCartModal. The modal expects each
        // item to have {product, variant, quantity} with imageGroups, name, etc.
        return productSelectionValues
    }, [addItemToNewOrExistingBasket, closeQuickView])

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
