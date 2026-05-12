/*
 * QuickViewModalBody — renders ProductView inside the Quick View modal.
 *
 * Uses useProductViewModal for variation state and useShopperBasketsV2MutationHelper
 * for add-to-bag. On success, closes Quick View and lets ProductView's internal
 * onAddToCartModalOpen open the global confirmation modal.
 *
 * Contract: contracts/quick-view-modal.md §B
 */
import React, {useMemo, useRef, useEffect} from 'react'
import {useIntl} from 'react-intl'
import {
    useShopperBasketsV2MutationHelper as useShopperBasketsMutationHelper
} from '@salesforce/commerce-sdk-react'
import ProductView from '@salesforce/retail-react-app/app/components/product-view'
import {useProductViewModal} from '@salesforce/retail-react-app/app/hooks/use-product-view-modal'
import Link from '@salesforce/retail-react-app/app/components/link'
import {productUrlBuilder} from '@salesforce/retail-react-app/app/utils/url'
import {
    Heading,
    Box,
    Divider,
    Center
} from '@salesforce/retail-react-app/app/components/shared/ui'
import {useQuickView} from './context'
import messages from './messages'

/**
 * Tags the internal add-to-cart button rendered by ProductView with the
 * contract-mandated data-testid. ProductView doesn't expose a prop for
 * button testids, so we locate the button post-render via the ref.
 *
 * The add-to-cart button is the first `<button>` with meaningful visible
 * text that isn't inside a swatch radio group or a quantity number input.
 */
const tagAddToCartButton = (containerEl) => {
    if (!containerEl) return

    // Clean up previous tag (handles re-renders where the button moves)
    const prev = containerEl.querySelector('[data-testid="quick-view-add-to-cart-btn"]')
    if (prev) prev.removeAttribute('data-testid')

    const buttons = containerEl.querySelectorAll('button')
    for (const btn of buttons) {
        const text = btn.textContent?.trim()
        // Skip icon-only / empty buttons (quantity +/-, close, swatches)
        if (!text || text.length < 3) continue
        // Skip swatch buttons (live inside a radiogroup)
        if (btn.closest('[role="radiogroup"]')) continue
        // Skip quantity stepper buttons
        if (btn.closest('.chakra-numberinput')) continue

        btn.setAttribute('data-testid', 'quick-view-add-to-cart-btn')
        break
    }
}

const QuickViewModalBody = () => {
    const intl = useIntl()
    const {openProduct, closeQuickView} = useQuickView()
    const productViewRef = useRef(null)

    // Fetch full product details via the base hook
    const {product, isFetching} = useProductViewModal(openProduct)

    // Basket mutations
    const {addItemToNewOrExistingBasket} = useShopperBasketsMutationHelper()

    // Build PDP URL
    const productId = openProduct?.id || openProduct?.productId
    const pdpUrl = useMemo(() => productUrlBuilder({id: productId}), [productId])

    // Tag the internal add-to-cart button after every render
    useEffect(() => {
        tagAddToCartButton(productViewRef.current)
    })

    /**
     * Slim add-to-cart handler.
     *
     * Signature matches ProductView's `addToCart` prop contract:
     *   addToCart(productSelectionValues: [{product, variant, quantity}]) => items | undefined
     *
     * When this returns a truthy value, ProductView internally calls
     * `onAddToCartModalOpen` to open the global confirmation modal.
     * We close the Quick View modal and return the selection values
     * so ProductView can handle the confirmation surface.
     */
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

        // This helper handles create-or-add automatically
        await addItemToNewOrExistingBasket(productItems)

        // Close Quick View before the confirmation modal opens.
        // ProductView's handleCartItem continues executing and calls
        // onAddToCartModalOpen with the returned value.
        closeQuickView()

        // Truthy return → ProductView opens the global AddToCartModal
        return productSelectionValues
    }

    return (
        <Box>
            {/* Heading anchors aria-labelledby on the modal shell */}
            <Heading
                id="quick-view-modal-title"
                as="h2"
                fontSize={{base: 'lg', lg: 'xl'}}
                mb={4}
            >
                {product?.name || openProduct?.name || ''}
            </Heading>

            <ProductView
                ref={productViewRef}
                product={product || openProduct}
                showDeliveryOptions={false}
                showImageGallery
                imageSize="md"
                category={undefined}
                addToCart={handleAddToCart}
                isProductLoading={isFetching}
            />

            <Divider my={4} />

            {/* View Full Details link */}
            <Center>
                <Link
                    data-testid="quick-view-view-full-details-link"
                    to={pdpUrl}
                    onClick={() => closeQuickView()}
                    color="blue.600"
                    fontWeight="semibold"
                    _hover={{textDecoration: 'underline'}}
                >
                    {intl.formatMessage(messages.viewFullDetailsLabel)}
                </Link>
            </Center>
        </Box>
    )
}

export default QuickViewModalBody
