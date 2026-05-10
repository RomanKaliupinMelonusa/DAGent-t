/*
 * QuickViewModalBody — renders ProductView inside the Quick View modal.
 *
 * Gated on isOpen via the shell so hooks here (useProductViewModal,
 * useShopperBasketsMutation) only run when the modal is actually visible.
 *
 * Contract: contracts/quick-view-modal.md §B
 */
import React, {useRef, useEffect, useCallback} from 'react'
import {useIntl} from 'react-intl'
import {Box, Heading} from '@salesforce/retail-react-app/app/components/shared/ui'
import Link from '@salesforce/retail-react-app/app/components/link'
import ProductView from '@salesforce/retail-react-app/app/components/product-view'
import {useProductViewModal} from '@salesforce/retail-react-app/app/hooks/use-product-view-modal'
import {useCurrentBasket} from '@salesforce/retail-react-app/app/hooks/use-current-basket'
import {useAddToCartModalContext} from '@salesforce/retail-react-app/app/hooks/use-add-to-cart-modal'
import {useShopperBasketsV2Mutation as useShopperBasketsMutation} from '@salesforce/commerce-sdk-react'
import {productUrlBuilder} from '@salesforce/retail-react-app/app/utils/url'
import {useQuickView} from './context'
import messages from './messages'

/**
 * Tags the ProductView's built-in add-to-cart button(s) with our contract testid.
 *
 * We can't add data-testid directly to the base component's <Button> because of the
 * prop-spread footgun. Instead we find the cart button in the DOM post-render.
 *
 * Identification strategy: the cart button is the only `<button>` inside
 * `[data-testid="product-view"]` that has `width: 100%` styling (via Chakra's
 * style system). Swatch buttons, quantity buttons, and icon buttons are all
 * narrower. We tag every matching button (desktop + mobile sticky renderings).
 */
const TAG_TESTID = 'quick-view-add-to-cart-btn'

const tagCartButtons = (container) => {
    if (!container) return
    const productView = container.querySelector('[data-testid="product-view"]')
    if (!productView) return

    const buttons = productView.querySelectorAll('button')
    for (const btn of buttons) {
        // Skip buttons that already have a different data-testid
        const existingTestId = btn.getAttribute('data-testid')
        if (existingTestId && existingTestId !== TAG_TESTID) continue

        // The cart button is styled width:100% by Chakra. Check computed style.
        // Also skip icon-only buttons (aria-label present, no visible text besides icon)
        if (btn.getAttribute('aria-label')) continue

        // Check for full-width styling - Chakra applies this inline or via class
        const computed = window.getComputedStyle(btn)
        const parentWidth = btn.parentElement?.getBoundingClientRect().width || 0
        const btnWidth = btn.getBoundingClientRect().width

        // Cart button takes full width of its container
        if (parentWidth > 0 && btnWidth / parentWidth > 0.9) {
            btn.setAttribute('data-testid', TAG_TESTID)
        }
    }
}

const QuickViewModalBody = () => {
    const intl = useIntl()
    const {openProduct, closeQuickView} = useQuickView()
    const addToCartModalContext = useAddToCartModalContext()
    const {data: basket} = useCurrentBasket()
    const containerRef = useRef(null)

    // useProductViewModal fetches full product details from SCAPI
    const productViewModal = useProductViewModal(openProduct)

    const createBasket = useShopperBasketsMutation('createBasket')
    const addItemToBasket = useShopperBasketsMutation('addItemToBasket')

    /**
     * Slim add-to-cart handler.
     * Signature: addToCart([{product, variant, quantity}]) => Promise<items | undefined>
     *
     * Returns undefined so ProductView does NOT also open the add-to-cart
     * confirmation modal (we handle that after closing quick view).
     */
    const handleAddToCart = useCallback(
        async (items) => {
            const [{product: itemProduct, variant, quantity}] = items
            const resolvedProduct = variant || itemProduct
            const productItem = {
                productId: resolvedProduct.productId || resolvedProduct.id,
                quantity
            }

            if (!basket?.basketId) {
                await createBasket.mutateAsync({body: {productItems: [productItem]}})
            } else {
                await addItemToBasket.mutateAsync({
                    parameters: {basketId: basket.basketId},
                    body: [productItem]
                })
            }

            // Close quick view, then open the global add-to-cart confirmation.
            // addToCartModalContext lives at _app level — safe to call post-unmount.
            closeQuickView()
            addToCartModalContext.onOpen({
                product: itemProduct,
                itemsAdded: [productItem],
                selectedQuantity: quantity
            })
        },
        [basket?.basketId, closeQuickView, addToCartModalContext, createBasket, addItemToBasket]
    )

    // Tag the cart button with our testid after each render + on DOM mutations
    useEffect(() => {
        const el = containerRef.current
        if (!el) return

        // Small delay to let Chakra finish rendering styles
        const timer = setTimeout(() => tagCartButtons(el), 50)

        const observer = new MutationObserver(() => {
            tagCartButtons(el)
        })
        observer.observe(el, {childList: true, subtree: true, attributes: true})

        return () => {
            clearTimeout(timer)
            observer.disconnect()
        }
    })

    const product = productViewModal?.product || openProduct
    const productId = product?.productId || product?.id

    return (
        <Box ref={containerRef}>
            <Heading id="quick-view-modal-title" as="h2" size="md" mb={4}>
                {product?.name || product?.productName || ''}
            </Heading>

            <ProductView
                product={product}
                showDeliveryOptions={false}
                showImageGallery
                imageSize="md"
                category={undefined}
                addToCart={handleAddToCart}
            />

            <Box textAlign="center" mt={4} mb={2}>
                <Link
                    data-testid="quick-view-view-full-details-link"
                    to={productUrlBuilder({id: productId})}
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
