/*
 * Quick View Modal — renders base ProductView inside a Chakra Modal.
 * Reuses useProductViewModal for product data fetching and useDerivedProduct
 * for variant/inventory state. Does NOT clone ProductView; passes it as the
 * display body and adds Quick-View-specific affordances (custom add-to-cart
 * button, view-full-details link, inventory message) with required data-testids.
 */
import React, {useState, useCallback} from 'react'
import PropTypes from 'prop-types'
import {useIntl} from 'react-intl'
import {
    Modal,
    ModalBody,
    ModalCloseButton,
    ModalContent,
    ModalOverlay,
    Button,
    Box,
    Text,
    Flex,
    Spinner,
    useBreakpointValue
} from '@salesforce/retail-react-app/app/components/shared/ui'
import {ErrorBoundary} from 'react-error-boundary'
import ProductView from '@salesforce/retail-react-app/app/components/product-view'
import {useProductViewModal} from '@salesforce/retail-react-app/app/hooks/use-product-view-modal'
import {useDerivedProduct} from '@salesforce/retail-react-app/app/hooks'
import {useAddToCartModalContext} from '@salesforce/retail-react-app/app/hooks/use-add-to-cart-modal'
import {useShopperBasketsV2MutationHelper as useShopperBasketsMutationHelper} from '@salesforce/commerce-sdk-react'
import Link from '@salesforce/retail-react-app/app/components/link'

/**
 * ErrorBoundary fallback rendered inside the Quick View modal body.
 */
function QuickViewErrorFallback({error}) {
    return (
        <Box data-testid="quick-view-modal-error" p={6} textAlign="center">
            <Text fontSize="lg" fontWeight="bold" mb={2}>
                Unable to load product details.
            </Text>
            <Text color="gray.600" fontSize="sm">
                {error?.message || 'An unexpected error occurred.'}
            </Text>
        </Box>
    )
}
QuickViewErrorFallback.propTypes = {
    error: PropTypes.object
}

/**
 * The Quick View Modal content component — mounts ONLY when isOpen is true
 * (client-only render, no SSR per guidelines).
 */
function QuickViewContent({product: initialProduct, onClose}) {
    const intl = useIntl()
    const {onOpen: onAddToCartModalOpen} = useAddToCartModalContext()
    const {addItemToNewOrExistingBasket} = useShopperBasketsMutationHelper()

    // Manage controlled variation state
    const [variationValues, setVariationValues] = useState({})
    const handleVariationChange = useCallback((attributeId, value) => {
        setVariationValues((prev) => ({...prev, [attributeId]: value}))
    }, [])

    // Fetch product detail with controlled variation values
    const {product, isFetching} = useProductViewModal(initialProduct, variationValues)

    // Derive variant/inventory state using the same hook ProductView uses internally
    const {
        variant,
        quantity,
        showInventoryMessage,
        inventoryMessage,
        stockLevel,
        isOutOfStock
    } = useDerivedProduct(product, false, false, false, variationValues, handleVariationChange)

    // Track loading state for add-to-cart
    const [isAddingToCart, setIsAddingToCart] = useState(false)

    // Determine if the Add to Cart button should be disabled
    const hasVariations = product?.variationAttributes?.length > 0
    const isVariantSelected = !!variant
    const isOrderable = hasVariations
        ? isVariantSelected && variant?.orderable
        : product?.inventory?.orderable
    const disableAddToCart =
        !isOrderable || isOutOfStock || isFetching || quantity < 1 || quantity > stockLevel

    // Handle Add to Cart
    const handleAddToCart = useCallback(async () => {
        if (disableAddToCart) return
        setIsAddingToCart(true)
        try {
            const selectedProduct = variant || product
            const productId = selectedProduct?.productId || selectedProduct?.id
            if (!productId) return

            await addItemToNewOrExistingBasket([{productId, quantity}])

            // Open the global AddToCartModal confirmation surface
            onAddToCartModalOpen({
                product,
                itemsAdded: [{productId, quantity}],
                selectedQuantity: quantity
            })

            // Close the Quick View modal
            onClose()
        } catch (e) {
            // Error stays visible — user can retry inside the modal
        } finally {
            setIsAddingToCart(false)
        }
    }, [
        variant,
        product,
        quantity,
        disableAddToCart,
        addItemToNewOrExistingBasket,
        onAddToCartModalOpen,
        onClose
    ])

    // Product URL for "View Full Details" link
    const productUrl = product?.master?.masterId
        ? `/product/${product.master.masterId}`
        : product?.id
            ? `/product/${product.id}`
            : '#'

    return (
        <ErrorBoundary FallbackComponent={QuickViewErrorFallback}>
            {isFetching && !product ? (
                <Flex justify="center" align="center" minH="300px">
                    <Spinner size="xl" />
                </Flex>
            ) : (
                <Box>
                    {/* Base ProductView — handles image gallery, swatches, quantity, price.
                        We do NOT pass addToCart so it renders no button (we render our own below). */}
                    <ProductView
                        product={product}
                        isProductLoading={isFetching}
                        showFullLink={false}
                        showDeliveryOptions={false}
                        imageSize="sm"
                        controlledVariationValues={variationValues}
                        onVariationChange={handleVariationChange}
                    />

                    {/* Inventory message with required testid */}
                    {showInventoryMessage && (
                        <Box data-testid="inventory-message" mt={2} mb={4}>
                            <Text color="orange.600" fontWeight={600}>
                                {inventoryMessage}
                            </Text>
                        </Box>
                    )}

                    {/* Add to Cart button with required testid */}
                    <Button
                        data-testid="quick-view-add-to-cart-btn"
                        onClick={handleAddToCart}
                        isDisabled={disableAddToCart}
                        isLoading={isAddingToCart}
                        width="100%"
                        variant="solid"
                        colorScheme="blue"
                        size="lg"
                        mb={4}
                    >
                        {intl.formatMessage({
                            id: 'quick_view.button.add_to_cart',
                            defaultMessage: 'Add to Cart'
                        })}
                    </Button>

                    {/* View Full Details link with required testid */}
                    <Box textAlign="center" mb={2}>
                        <Link
                            to={productUrl}
                            data-testid="quick-view-view-full-details-link"
                            color="blue.600"
                            onClick={onClose}
                        >
                            {intl.formatMessage({
                                id: 'quick_view.link.view_full_details',
                                defaultMessage: 'View Full Details'
                            })}
                        </Link>
                    </Box>
                </Box>
            )}
        </ErrorBoundary>
    )
}
QuickViewContent.propTypes = {
    product: PropTypes.object.isRequired,
    onClose: PropTypes.func.isRequired
}

/**
 * QuickViewModal — the shell modal component.
 * Only mounts QuickViewContent when isOpen (client-only, no SSR hooks firing).
 */
const QuickViewModal = ({product, isOpen, onClose}) => {
    const size = useBreakpointValue({base: 'full', md: '5xl'})

    return (
        <Modal
            size={size}
            isOpen={isOpen}
            onClose={onClose}
            scrollBehavior="inside"
        >
            <ModalOverlay />
            <ModalContent
                data-testid="quick-view-modal"
                containerProps={{alignItems: {base: 'flex-end', md: 'center'}}}
                maxH={{base: '90vh', md: '85vh'}}
                my={{base: 0, md: 8}}
                borderRadius={{base: 'lg', md: 'xl'}}
            >
                <ModalCloseButton data-testid="quick-view-modal-close-btn" />
                <ModalBody pb={6} pt={10}>
                    {isOpen && product && (
                        <QuickViewContent product={product} onClose={onClose} />
                    )}
                </ModalBody>
            </ModalContent>
        </Modal>
    )
}

QuickViewModal.propTypes = {
    product: PropTypes.object,
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired
}

export default QuickViewModal
