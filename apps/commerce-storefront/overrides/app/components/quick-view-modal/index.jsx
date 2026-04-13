/*
 * Quick View Modal — displays product details in a modal overlay
 * without navigating to the PDP. Reuses the existing ProductView
 * component and useProductViewModal hook from the base template.
 *
 * Wrapped in a local ErrorBoundary so that a render failure in
 * ProductView does NOT propagate to the route-level AppErrorBoundary,
 * which would replace the entire page with a crash screen.
 */
import React from 'react'
import PropTypes from 'prop-types'
import {
    Modal,
    ModalBody,
    ModalCloseButton,
    ModalContent,
    ModalOverlay,
    Center,
    Spinner,
    Text,
    Box
} from '@salesforce/retail-react-app/app/components/shared/ui'
import ProductView from '@salesforce/retail-react-app/app/components/product-view'
import {useProductViewModal} from '@salesforce/retail-react-app/app/hooks/use-product-view-modal'
import {useIntl} from 'react-intl'

/**
 * Class-based ErrorBoundary (react-error-boundary is not installed).
 * Catches render errors inside the modal so the PLP page stays intact.
 */
class QuickViewErrorBoundary extends React.Component {
    constructor(props) {
        super(props)
        this.state = {hasError: false}
    }

    static getDerivedStateFromError() {
        return {hasError: true}
    }

    componentDidCatch(error, info) {
        // eslint-disable-next-line no-console
        console.error('[QuickViewModal] Render error caught by ErrorBoundary:', error, info)
    }

    render() {
        if (this.state.hasError) {
            return (
                <Center py={10} flexDirection="column" data-testid="quick-view-error">
                    <Text fontSize="lg" fontWeight="semibold">
                        Unable to load product details.
                    </Text>
                </Center>
            )
        }
        return this.props.children
    }
}

QuickViewErrorBoundary.propTypes = {
    children: PropTypes.node
}

/**
 * QuickViewModal — renders a Chakra modal that fetches full product
 * data via useProductViewModal and renders ProductView inside it.
 */
const QuickViewModal = ({product, isOpen, onClose}) => {
    const productViewModalData = useProductViewModal(product)
    const intl = useIntl()

    const productName =
        productViewModalData?.product?.name ||
        product?.productName ||
        product?.name ||
        intl.formatMessage({
            defaultMessage: 'product',
            id: 'quick_view_modal.fallback_product_name'
        })

    const ariaLabel = intl.formatMessage(
        {
            defaultMessage: 'Quick view for {productName}',
            id: 'quick_view_modal.aria_label'
        },
        {productName}
    )

    const isFetching = productViewModalData.isFetching
    const fetchedProduct = productViewModalData.product

    // Product loaded but is null/undefined — unavailable
    const isUnavailable = !isFetching && !fetchedProduct

    return (
        <Modal size="4xl" isOpen={isOpen} onClose={onClose}>
            <ModalOverlay />
            <ModalContent data-testid="quick-view-modal" aria-label={ariaLabel}>
                <ModalCloseButton />
                <ModalBody
                    pb={8}
                    bg="white"
                    paddingBottom={6}
                    marginTop={6}
                    overflow="auto"
                    maxHeight="80vh"
                >
                    {isFetching ? (
                        <Center py={10}>
                            <Spinner size="xl" data-testid="quick-view-spinner" />
                        </Center>
                    ) : isUnavailable ? (
                        <Center py={10} flexDirection="column" data-testid="quick-view-error">
                            <Box mb={3} color="orange.400" fontSize="2xl">⚠</Box>
                            <Text fontSize="lg" fontWeight="semibold">
                                {intl.formatMessage({
                                    defaultMessage:
                                        'This product is no longer available',
                                    id: 'quick_view_modal.product_unavailable'
                                })}
                            </Text>
                        </Center>
                    ) : (
                        <QuickViewErrorBoundary>
                            <ProductView
                                product={fetchedProduct}
                                isProductLoading={isFetching}
                                showFullLink={true}
                                imageSize="sm"
                            />
                        </QuickViewErrorBoundary>
                    )}
                </ModalBody>
            </ModalContent>
        </Modal>
    )
}

QuickViewModal.propTypes = {
    /** Product search hit from the PLP */
    product: PropTypes.object,
    /** Whether the modal is open */
    isOpen: PropTypes.bool.isRequired,
    /** Callback to close the modal */
    onClose: PropTypes.func.isRequired
}

export default QuickViewModal
