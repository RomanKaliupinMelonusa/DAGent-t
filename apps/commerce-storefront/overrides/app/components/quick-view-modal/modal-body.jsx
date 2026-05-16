/*
 * QuickViewModalBody — renders ProductView inside the Quick View modal.
 *
 * - Uses useProductViewModal to fetch product detail on demand.
 * - Passes showDeliveryOptions={false} to suppress Pickup-in-Store UI (FR-004).
 * - Tracks variation state externally via controlledVariationValues so we can
 *   render our own Add-to-Bag button with data-testid="quick-view-add-to-cart-btn"
 *   and forward the correct disabled state.
 * - On add-to-bag success, closes Quick View and lets ProductView's internal
 *   onAddToCartModalOpen open the global AddToCartModal.
 * - Renders a "View Full Details" link to the PDP.
 *
 * See contracts/quick-view-modal.md §B.
 */
import React, {useState, useCallback} from 'react'
import {useIntl} from 'react-intl'
import {Box, Button, Flex} from '@salesforce/retail-react-app/app/components/shared/ui'
import ProductView from '@salesforce/retail-react-app/app/components/product-view'
import {useProductViewModal} from '@salesforce/retail-react-app/app/hooks/use-product-view-modal'
import {useDerivedProduct} from '@salesforce/retail-react-app/app/hooks'
import {useCurrentBasket} from '@salesforce/retail-react-app/app/hooks/use-current-basket'
import {useAddToCartModalContext} from '@salesforce/retail-react-app/app/hooks/use-add-to-cart-modal'
import {useShopperBasketsV2Mutation as useShopperBasketsMutation} from '@salesforce/commerce-sdk-react'
import {useToast} from '@salesforce/retail-react-app/app/hooks/use-toast'
import {API_ERROR_MESSAGE} from '@salesforce/retail-react-app/app/constants'
import Link from '@salesforce/retail-react-app/app/components/link'
import {productUrlBuilder} from '@salesforce/retail-react-app/app/utils/url'
import {useQuickView} from './context'
import messages from './messages'

const QuickViewModalBody = () => {
    const intl = useIntl()
    const showToast = useToast()
    const {openProduct, closeQuickView} = useQuickView()
    const {product, isFetching} = useProductViewModal(openProduct)
    const {data: basket} = useCurrentBasket()
    const addToCartModalContext = useAddToCartModalContext()
    const createBasket = useShopperBasketsMutation('createBasket')
    const addItemToBasket = useShopperBasketsMutation('addItemToBasket')

    // Track variation state externally so we can compute disabled state for our button
    const [variationValues, setVariationValues] = useState({})
    const handleVariationChange = useCallback((attrId, value) => {
        setVariationValues((prev) => ({...prev, [attrId]: value}))
    }, [])

    // Use useDerivedProduct to compute variant, quantity, disabled state
    const derivedProduct = useDerivedProduct(
        product || openProduct,
        false,
        false,
        false,
        variationValues,
        handleVariationChange
    )

    const {variant, quantity, showInventoryMessage, stockLevel} = derivedProduct

    // Compute button disabled state (mirrors ProductView's internal logic)
    const hasVariations = (product || openProduct)?.variationAttributes?.length > 0
    const isButtonDisabled =
        isFetching ||
        showInventoryMessage ||
        (hasVariations && !variant) ||
        (!hasVariations &&
            !(product || openProduct)?.inventory?.orderable)

    const [isAddingToCart, setIsAddingToCart] = useState(false)

    const handleAddToCart = useCallback(async () => {
        const selectedProduct = variant || product || openProduct
        const productId = selectedProduct?.productId || selectedProduct?.id
        if (!productId) return

        const productItems = [{productId, quantity}]

        setIsAddingToCart(true)
        try {
            if (!basket?.basketId) {
                await createBasket.mutateAsync({body: {productItems}})
            } else {
                await addItemToBasket.mutateAsync({
                    parameters: {basketId: basket.basketId},
                    body: productItems
                })
            }

            // Close quick view and open the global AddToCartModal
            closeQuickView()
            addToCartModalContext.onOpen({
                product: product || openProduct,
                itemsAdded: productItems,
                selectedQuantity: quantity
            })
        } catch (err) {
            showToast({
                title: intl.formatMessage(API_ERROR_MESSAGE),
                status: 'error'
            })
        } finally {
            setIsAddingToCart(false)
        }
    }, [
        variant,
        product,
        openProduct,
        quantity,
        basket,
        createBasket,
        addItemToBasket,
        closeQuickView,
        addToCartModalContext,
        showToast,
        intl
    ])

    const pdpUrl = productUrlBuilder({
        id: openProduct?.productId || openProduct?.id
    })

    return (
        <Flex direction="column" flex={1}>
            <Box
                id="quick-view-modal-title"
                fontSize="xl"
                fontWeight="bold"
                px={[4, 4, 6]}
                pt={[4, 4, 6]}
                pb={2}
            >
                {product?.name ||
                    product?.productName ||
                    openProduct?.productName ||
                    openProduct?.name}
            </Box>

            <Box flex={1} overflow="auto" px={[4, 4, 6]} pb={4}>
                <ProductView
                    product={product || openProduct}
                    isProductLoading={isFetching}
                    showDeliveryOptions={false}
                    showImageGallery
                    imageSize="md"
                    category={undefined}
                    showFullLink={false}
                    controlledVariationValues={variationValues}
                    onVariationChange={handleVariationChange}
                />
            </Box>

            <Box px={[4, 4, 6]} pb={2}>
                <Button
                    data-testid="quick-view-add-to-cart-btn"
                    width="100%"
                    variant="solid"
                    colorScheme="blue"
                    isDisabled={isButtonDisabled}
                    isLoading={isAddingToCart}
                    onClick={handleAddToCart}
                    marginBottom={4}
                >
                    {intl.formatMessage({
                        defaultMessage: 'Add to Cart',
                        id: 'product_view.button.add_to_cart'
                    })}
                </Button>
            </Box>

            <Box px={[4, 4, 6]} pb={[4, 4, 6]} textAlign="center">
                <Link
                    to={pdpUrl}
                    data-testid="quick-view-view-full-details-link"
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
