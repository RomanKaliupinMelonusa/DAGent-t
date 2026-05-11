/*
 * QuickViewModalBody — product detail content rendered inside the Quick View modal.
 *
 * Uses useProductViewModal to fetch product detail on demand (only when modal opens).
 * Renders <ProductView showDeliveryOptions={false}> to exclude Ship-to-Store UI (FR-004).
 * Wires a slim Add-to-Bag handler that delegates to the SDK basket mutations
 * and then closes QV + opens the global add-to-cart confirmation modal.
 *
 * Uses useControlledVariations to manage variation state via React state (not URL params)
 * so that swatch clicks update the modal instead of navigating away from the PLP.
 *
 * See contracts/quick-view-modal.md §B for the binding contract.
 */
import React, {useRef, useEffect, useCallback} from 'react'
import {useIntl} from 'react-intl'
import {
    Box,
    Heading,
    Divider
} from '@salesforce/retail-react-app/app/components/shared/ui'
import {
    useShopperBasketsV2MutationHelper as useShopperBasketsMutationHelper
} from '@salesforce/commerce-sdk-react'
import ProductView from '@salesforce/retail-react-app/app/components/product-view'
import {useProductViewModal} from '@salesforce/retail-react-app/app/hooks/use-product-view-modal'
import {useAddToCartModalContext} from '@salesforce/retail-react-app/app/hooks/use-add-to-cart-modal'
import {useControlledVariations} from '@salesforce/retail-react-app/app/hooks/use-controlled-variations'
import Link from '@salesforce/retail-react-app/app/components/link'
import {productUrlBuilder} from '@salesforce/retail-react-app/app/utils/url'
import {useQuickView} from './context'
import messages from './messages'

const QuickViewModalBody = () => {
    const intl = useIntl()
    const {openProduct, closeQuickView} = useQuickView()
    const addToCartModalContext = useAddToCartModalContext()
    const productViewRef = useRef(null)

    // Manage variation state via React state (not URL params) since we're in a modal.
    // This prevents swatch clicks from navigating away from the PLP.
    const {controlledVariationValues, handleVariationChange} = useControlledVariations(openProduct)

    // Fetch full product detail on demand (only fires when the modal is open)
    const {product, isFetching} = useProductViewModal(openProduct, controlledVariationValues)

    // Basket mutation helper handles basket create-or-add logic
    const {addItemToNewOrExistingBasket} = useShopperBasketsMutationHelper()

    // Add the quick-view-add-to-cart-btn testid to the base ProductView's
    // Add-to-Cart button via DOM observation. The button is rendered internally
    // by ProductView and we can't inject props on it directly.
    useEffect(() => {
        if (!productViewRef.current) return
        const container = productViewRef.current
        const applyTestId = () => {
            const buttons = container.querySelectorAll('button')
            for (const btn of buttons) {
                const text = btn.textContent?.toLowerCase() || ''
                if (
                    text.includes('add to cart') ||
                    text.includes('add to bag') ||
                    text.includes('add set to cart') ||
                    text.includes('add bundle to cart')
                ) {
                    btn.setAttribute('data-testid', 'quick-view-add-to-cart-btn')
                    return true
                }
            }
            return false
        }
        // Apply immediately
        applyTestId()
        // Observe for DOM changes (e.g. loading states, variant switches)
        const observer = new MutationObserver(() => applyTestId())
        observer.observe(container, {childList: true, subtree: true})
        return () => observer.disconnect()
    })

    // Slim add-to-cart handler.
    // Receives [{product, variant, quantity}] from ProductView's internal handleCartItem.
    // Returns undefined so ProductView does NOT call onAddToCartModalOpen
    // (we handle closing QV + opening the confirmation modal ourselves).
    const handleAddToCart = useCallback(
        async (productSelectionValues) => {
            // Build the basket API payload — just productId + quantity
            const productItems = productSelectionValues.map((item) => {
                const prod = item.variant || item.product
                return {
                    productId: prod?.productId || prod?.id,
                    quantity: item.quantity
                }
            })

            await addItemToNewOrExistingBasket(productItems)

            // Build the product object for the AddToCartModal.
            // Ensure imageGroups is present — PLP search results (openProduct) always
            // have imageGroups; variant-level useProduct responses may not.
            const pvProduct = productSelectionValues[0]?.product
            const fullProduct = {
                ...(openProduct || {}),
                ...(product || {}),
                ...(pvProduct || {}),
                imageGroups: pvProduct?.imageGroups || product?.imageGroups || openProduct?.imageGroups || []
            }

            // Build itemsAdded with full product/variant objects for AddToCartModal.
            // AddToCartModal iterates itemsAdded and accesses product.imageGroups
            // and variant.variationValues on each item.
            const itemsAdded = productSelectionValues.map((item) => ({
                product: {
                    ...fullProduct,
                    ...(item.product || {})
                },
                variant: item.variant || null,
                quantity: item.quantity
            }))

            const selectedQuantity = productSelectionValues[0]?.quantity || 1

            // Close Quick View and open global add-to-cart confirmation modal
            closeQuickView()
            addToCartModalContext.onOpen({
                product: fullProduct,
                itemsAdded,
                selectedQuantity
            })

            // Return undefined so ProductView's handleCartItem does NOT
            // also call onAddToCartModalOpen (it only does so when addToCart returns truthy).
        },
        [addItemToNewOrExistingBasket, closeQuickView, addToCartModalContext, product, openProduct]
    )

    const productId = openProduct?.id || openProduct?.productId
    const pdpUrl = productUrlBuilder({id: productId})

    return (
        <Box ref={productViewRef}>
            {/* Heading anchors aria-labelledby on the modal shell */}
            <Heading id="quick-view-modal-title" size="md" mb={4}>
                {product?.name || openProduct?.name || ''}
            </Heading>

            <ProductView
                product={product || openProduct}
                showDeliveryOptions={false}
                showImageGallery
                imageSize="md"
                category={undefined}
                addToCart={handleAddToCart}
                isLoading={isFetching}
                isProductPartOfSet={false}
                isProductPartOfBundle={false}
                controlledVariationValues={controlledVariationValues}
                onVariationChange={handleVariationChange}
            />

            <Divider my={4} />

            <Link
                data-testid="quick-view-view-full-details-link"
                to={pdpUrl}
                onClick={() => closeQuickView()}
                color="blue.600"
                fontWeight="semibold"
                textAlign="center"
                display="block"
            >
                {intl.formatMessage(messages.viewFullDetailsLabel)}
            </Link>
        </Box>
    )
}

export default QuickViewModalBody
