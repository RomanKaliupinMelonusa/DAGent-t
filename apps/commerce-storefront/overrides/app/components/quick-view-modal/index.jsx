/*
 * QuickViewModal — Displays product details in a modal overlay.
 * Uses useProductViewModal to fetch full product data from a search hit,
 * then renders ProductView inside a Chakra Modal.
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
import {WarningTwoIcon} from '@chakra-ui/icons'

const QuickViewModal = ({product, isOpen, onClose}) => {
    const productViewModalData = useProductViewModal(product)
    const intl = useIntl()

    const productName =
        productViewModalData?.product?.name ||
        product?.productName ||
        product?.name ||
        ''

    const ariaLabel = intl.formatMessage(
        {
            defaultMessage: 'Quick view for {productName}',
            id: 'quick_view_modal.aria_label'
        },
        {productName: productName || 'product'}
    )

    const isLoaded = !productViewModalData.isFetching
    const hasProduct = isLoaded && productViewModalData.product

    return (
        <Modal size="4xl" isOpen={isOpen} onClose={onClose}>
            <ModalOverlay />
            <ModalContent data-testid="quick-view-modal" aria-label={ariaLabel}>
                <ModalCloseButton />
                <ModalBody pb={8} bg="white" paddingBottom={6} marginTop={6}>
                    {productViewModalData.isFetching ? (
                        <Center py={10}>
                            <Spinner size="xl" data-testid="quick-view-spinner" />
                        </Center>
                    ) : hasProduct ? (
                        <ProductView
                            product={productViewModalData.product}
                            isProductLoading={productViewModalData.isFetching}
                            showFullLink={true}
                            imageSize="sm"
                        />
                    ) : (
                        <Center py={10} data-testid="quick-view-error">
                            <Box textAlign="center">
                                <WarningTwoIcon boxSize={8} color="orange.400" mb={3} />
                                <Text fontSize="lg" fontWeight="semibold">
                                    {intl.formatMessage({
                                        defaultMessage:
                                            'This product is no longer available',
                                        id: 'quick_view_modal.product_unavailable'
                                    })}
                                </Text>
                            </Box>
                        </Center>
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
