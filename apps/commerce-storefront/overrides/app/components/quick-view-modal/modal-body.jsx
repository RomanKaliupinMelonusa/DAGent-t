/*
 * QuickViewModalBody — renders ProductView inside the Quick View modal.
 *
 * Gated on isOpen (via the shell), so hooks like useProductViewModal never
 * run during SSR or when the modal is closed.
 *
 * See contracts/quick-view-modal.md §B for the binding surface.
 */
import React, {useRef, useEffect} from 'react'
import {useIntl} from 'react-intl'
import {
    Box,
    Heading,
    ModalBody,
    ModalHeader
} from '@salesforce/retail-react-app/app/components/shared/ui'
import {useShopperBasketsV2MutationHelper as useShopperBasketsMutationHelper} from '@salesforce/commerce-sdk-react'
import ProductView from '@salesforce/retail-react-app/app/components/product-view'
import {useProductViewModal} from '@salesforce/retail-react-app/app/hooks/use-product-view-modal'
import {useAddToCartModalContext} from '@salesforce/retail-react-app/app/hooks/use-add-to-cart-modal'
import Link from '@salesforce/retail-react-app/app/components/link'
import {productUrlBuilder} from '@salesforce/retail-react-app/app/utils/url'
import {useQuickView} from './context'
import messages from './messages'

/**
 * Applies the contract testid to the "Add to Cart" button(s) rendered by
 * ProductView. The button is identified by its text content matching /cart/i.
 * This runs after every render to keep the testid in sync with re-renders.
 */
const useAddToCartButtonTestId = (wrapperRef) => {
    useEffect(() => {
        if (!wrapperRef.current) return
        const buttons = wrapperRef.current.querySelectorAll('button')
        for (const btn of buttons) {
            if (btn.textContent && /cart/i.test(btn.textContent)) {
                btn.setAttribute('data-testid', 'quick-view-add-to-cart-btn')
                // Tag only the first matching button (desktop view)
                return
            }
        }
    })
}

const QuickViewModalBody = () => {
    const intl = useIntl()
    const {openProduct, closeQuickView} = useQuickView()
    const addToCartModalContext = useAddToCartModalContext()
    const wrapperRef = useRef(null)

    // Fetch full product detail; seed with tile-level data for instant first paint
    const {product, isFetching} = useProductViewModal(openProduct)

    // Basket helper — same utility the PDP uses
    const {addItemToNewOrExistingBasket} = useShopperBasketsMutationHelper()

    // Apply testid to the ProductView's Add to Cart button
    useAddToCartButtonTestId(wrapperRef)

    /**
     * Slim add-to-cart handler.
     *
     * ProductView calls: addToCart([{product, variant, quantity}])
     * We do the basket mutation, close the quick view, open the
     * add-to-cart confirmation modal, and return undefined so
     * ProductView does NOT re-open the modal itself.
     */
    const handleAddToCart = async (items) => {
        const {product: itemProduct, variant, quantity} = items[0]
        const selectedProduct = variant || itemProduct
        const productId = selectedProduct?.productId || selectedProduct?.id
        const productItems = [{productId, quantity}]

        await addItemToNewOrExistingBasket(productItems)

        // Close quick view first, then open the global add-to-cart confirmation
        closeQuickView()
        addToCartModalContext.onOpen({
            product: product,
            itemsAdded: productItems,
            selectedQuantity: items[0].quantity
        })

        // Return undefined so ProductView does NOT double-open the
        // add-to-cart confirmation modal via its internal handler
    }

    const pdpUrl = productUrlBuilder({id: openProduct?.productId || openProduct?.id})

    return (
        <>
            <ModalHeader p={0} mb={2}>
                <Heading id="quick-view-modal-title" as="h2" size="lg">
                    {product?.name || openProduct?.name || openProduct?.productName || ''}
                </Heading>
            </ModalHeader>
            <ModalBody p={0}>
                <Box ref={wrapperRef}>
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
                <Box mt={4} textAlign="center">
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
                </Box>
            </ModalBody>
        </>
    )
}

export default QuickViewModalBody
