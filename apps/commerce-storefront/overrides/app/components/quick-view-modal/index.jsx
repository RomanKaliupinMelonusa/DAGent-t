/*
 * Quick View Modal — opens from ProductTile to show product details
 * without navigating to the PDP. Reuses the base template's ProductView
 * and useProductViewModal hook.
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
    Box,
    Text,
    Button
} from '@salesforce/retail-react-app/app/components/shared/ui'
import ProductView from '@salesforce/retail-react-app/app/components/product-view'
import {useProductViewModal} from '@salesforce/retail-react-app/app/hooks/use-product-view-modal'
import {useIntl} from 'react-intl'

const QuickViewModal = ({product, isOpen, onClose}) => {
    const productViewModalData = useProductViewModal(product)
    const intl = useIntl()

    const productName =
        productViewModalData?.product?.name ||
        product?.productName ||
        product?.name ||
        'product'

    const ariaLabel = intl.formatMessage(
        {
            defaultMessage: 'Quick view for {productName}',
            id: 'quick_view_modal.aria_label'
        },
        {productName}
    )

    const isFetching = productViewModalData.isFetching
    const fetchedProduct = productViewModalData.product
    const doneAndEmpty = !isFetching && !fetchedProduct

    return (
        <Modal size="4xl" isOpen={isOpen} onClose={onClose} closeOnOverlayClick={true}>
            <ModalOverlay />
            <ModalContent data-testid="quick-view-modal" aria-label={ariaLabel}>
                <ModalCloseButton />
                <ModalBody pb={8} bg="white" paddingBottom={6} marginTop={6} overflow="auto">
                    {isFetching ? (
                        <Center py={10}>
                            <Spinner size="xl" data-testid="quick-view-spinner" />
                        </Center>
                    ) : doneAndEmpty ? (
                        <Box textAlign="center" py={10}>
                            <Text mb={4}>This product is no longer available.</Text>
                            <Button onClick={onClose}>Close</Button>
                        </Box>
                    ) : (
                        <ProductView
                            product={fetchedProduct}
                            isLoading={isFetching}
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
    product: PropTypes.object,
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired
}

export default QuickViewModal
