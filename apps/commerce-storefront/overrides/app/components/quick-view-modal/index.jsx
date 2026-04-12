/*
 * Quick View Modal — displays product details in a modal overlay
 * without navigating to the PDP. Reuses the existing ProductView
 * component and useProductViewModal hook from the base template.
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
    Text
} from '@salesforce/retail-react-app/app/components/shared/ui'
import ProductView from '@salesforce/retail-react-app/app/components/product-view'
import {useProductViewModal} from '@salesforce/retail-react-app/app/hooks/use-product-view-modal'
import {useIntl} from 'react-intl'
import {WarningIcon} from '@chakra-ui/icons'

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
                            <WarningIcon boxSize={8} color="orange.400" mb={3} />
                            <Text fontSize="lg" fontWeight="semibold">
                                {intl.formatMessage({
                                    defaultMessage:
                                        'This product is no longer available',
                                    id: 'quick_view_modal.product_unavailable'
                                })}
                            </Text>
                        </Center>
                    ) : (
                        <ProductView
                            product={fetchedProduct}
                            isProductLoading={isFetching}
                            showFullLink={true}
                            imageSize="sm"
                        />
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
