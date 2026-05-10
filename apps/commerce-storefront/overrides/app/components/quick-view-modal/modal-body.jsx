/*
 * QuickViewModalBody — renders ProductView inside the Quick View modal.
 *
 * Gated on isOpen via the shell so hooks here (useProductViewModal,
 * useShopperBasketsMutation) only run when the modal is actually visible.
 *
 * Contract: contracts/quick-view-modal.md §B
 */
import React, {useRef, useEffect, useState, useCallback} from 'react'
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
 * Tags the ProductView's built-in add-to-cart button with our contract testid.
 *
 * We can't add data-testid directly to the base component's <Button> because of the
 * prop-spread footgun. Instead we find the cart button in the DOM post-render.
 *
 * Identification strategy: match by text content ("Add to Cart" / "Add to Bag").
 * This is more reliable than getBoundingClientRect width checks which fail during
 * modal opening animation when widths are transitioning.
 */
const TAG_TESTID = 'quick-view-add-to-cart-btn'

const tagCartButtons = (container) => {
    if (!container) return false
    // Already tagged — nothing to do
    if (container.querySelector(`[data-testid="${TAG_TESTID}"]`)) return true

    const productView = container.querySelector('[data-testid="product-view"]')
    if (!productView) return false

    const buttons = productView.querySelectorAll('button')
    for (const btn of buttons) {
        // Skip buttons that already have a data-testid
        if (btn.getAttribute('data-testid')) continue
        // Skip icon-only buttons (aria-label present, no visible text)
        if (btn.getAttribute('aria-label')) continue

        // Match the add-to-cart button by its text content
        const text = (btn.textContent || '').trim().toLowerCase()
        if (text.includes('add to cart') || text.includes('add to bag')) {
            btn.setAttribute('data-testid', TAG_TESTID)
            return true
        }
    }
    return false
}

const QuickViewModalBody = () => {
    const intl = useIntl()
    const {openProduct, closeQuickView} = useQuickView()
    const addToCartModalContext = useAddToCartModalContext()
    const {data: basket} = useCurrentBasket()
    const containerRef = useRef(null)

    // Local controlled variation state — prevents swatch clicks from
    // navigating the PLP URL. Instead, swatches render as callback-driven
    // radio buttons and update this local state, which flows back into
    // useProductViewModal → useDerivedProduct → useVariant to resolve the
    // selected variant without any URL side-effects.
    const [variationValues, setVariationValues] = useState({})

    // Reset variation values when a new product is opened
    const productId = openProduct?.productId || openProduct?.id
    useEffect(() => {
        setVariationValues({})
    }, [productId])

    const handleVariationChange = useCallback((attributeId, value) => {
        setVariationValues((prev) => ({...prev, [attributeId]: value}))
    }, [])

    // useProductViewModal fetches full product details from SCAPI.
    // Pass controlledVariationValues so variation selection is managed
    // locally instead of via URL params.
    const productViewModal = useProductViewModal(openProduct, variationValues)

    const createBasket = useShopperBasketsMutation('createBasket')
    const addItemToBasket = useShopperBasketsMutation('addItemToBasket')

    // Store mutation functions in refs to avoid recreating handleAddToCart
    // on every render. The mutation objects from useShopperBasketsMutation
    // are not referentially stable — their result metadata (status, data)
    // changes reference on each render cycle. Using refs breaks the
    // cascade: callback stays stable → ProductView doesn't re-render →
    // modal DOM is stable → Playwright clicks succeed.
    const createBasketRef = useRef(createBasket)
    const addItemToBasketRef = useRef(addItemToBasket)
    const addToCartModalRef = useRef(addToCartModalContext)
    const closeQuickViewRef = useRef(closeQuickView)
    const basketRef = useRef(basket)

    useEffect(() => {
        createBasketRef.current = createBasket
    }, [createBasket])
    useEffect(() => {
        addItemToBasketRef.current = addItemToBasket
    }, [addItemToBasket])
    useEffect(() => {
        addToCartModalRef.current = addToCartModalContext
    }, [addToCartModalContext])
    useEffect(() => {
        closeQuickViewRef.current = closeQuickView
    }, [closeQuickView])
    useEffect(() => {
        basketRef.current = basket
    }, [basket])

    /**
     * Slim add-to-cart handler.
     * Signature: addToCart([{product, variant, quantity}]) => Promise<items | undefined>
     *
     * Returns undefined so ProductView does NOT also open the add-to-cart
     * confirmation modal (we handle that after closing quick view).
     *
     * Uses refs for all dependencies so the callback reference is stable
     * across renders, preventing unnecessary ProductView re-renders.
     */
    const handleAddToCart = useCallback(
        async (items) => {
            const [{product: itemProduct, variant, quantity}] = items
            const resolvedProduct = variant || itemProduct
            const productItem = {
                productId: resolvedProduct.productId || resolvedProduct.id,
                quantity
            }

            const currentBasket = basketRef.current
            if (!currentBasket?.basketId) {
                await createBasketRef.current.mutateAsync({
                    body: {productItems: [productItem]}
                })
            } else {
                await addItemToBasketRef.current.mutateAsync({
                    parameters: {basketId: currentBasket.basketId},
                    body: [productItem]
                })
            }

            // Close quick view, then open the global add-to-cart confirmation.
            closeQuickViewRef.current()
            addToCartModalRef.current.onOpen({
                product: itemProduct,
                itemsAdded: [productItem],
                selectedQuantity: quantity
            })
        },
        [] // Stable — all dependencies accessed via refs
    )

    // Tag the cart button with our testid after render and on DOM mutations.
    // Uses text-content matching (reliable) instead of getBoundingClientRect
    // width checks (unreliable during modal animation).
    useEffect(() => {
        const el = containerRef.current
        if (!el) return

        let cancelled = false

        // Retry loop: ProductView may not have rendered the button yet
        // (data still loading from SCAPI). Poll briefly until found.
        const poll = () => {
            if (cancelled) return
            if (!tagCartButtons(el)) {
                requestAnimationFrame(poll)
            }
        }
        // Start after a microtask to let React finish its commit phase
        requestAnimationFrame(poll)

        // Also observe childList mutations as a fallback for when
        // ProductView re-renders after SCAPI data arrives.
        const observer = new MutationObserver(() => {
            tagCartButtons(el)
        })
        observer.observe(el, {childList: true, subtree: true})

        return () => {
            cancelled = true
            observer.disconnect()
        }
    }, [])

    const product = productViewModal?.product || openProduct

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
                controlledVariationValues={variationValues}
                onVariationChange={handleVariationChange}
            />

            <Box textAlign="center" mt={4} mb={2}>
                <Link
                    data-testid="quick-view-view-full-details-link"
                    to={productUrlBuilder({id: productId})}
                    onClick={() => closeQuickViewRef.current()}
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
