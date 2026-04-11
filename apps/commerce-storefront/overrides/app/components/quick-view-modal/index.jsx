/*
 * Copyright (c) 2024, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
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
import {
    QUICK_VIEW_TEST_IDS,
    QUICK_VIEW_MODAL_SIZE,
    QUICK_VIEW_IMAGE_SIZE
} from '../../constants'

/**
 * QuickViewModal — displays a product's details inside a Chakra Modal
 * so shoppers can browse variants and add-to-cart without leaving the PLP.
 *
 * Reuses the base template's `ProductView` and `useProductViewModal` hook
 * to stay DRY with the existing Cart/Wishlist edit modals.
 */
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

    // After fetching completes, determine if product data is unavailable
    const isFetching = productViewModalData.isFetching
    const fetchedProduct = productViewModalData.product
    const isUnavailable = !isFetching && !fetchedProduct

    return (
        <Modal size={QUICK_VIEW_MODAL_SIZE} isOpen={isOpen} onClose={onClose}>
            <ModalOverlay />
            <ModalContent
                data-testid={QUICK_VIEW_TEST_IDS.MODAL}
                aria-label={ariaLabel}
            >
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
                            <Spinner size="xl" data-testid={QUICK_VIEW_TEST_IDS.SPINNER} />
                        </Center>
                    ) : isUnavailable ? (
                        <Center py={10} flexDirection="column">
                            <Text fontSize="lg" mb={4}>
                                This product is no longer available.
                            </Text>
                        </Center>
                    ) : (
                        <ProductView
                            product={fetchedProduct}
                            isLoading={isFetching}
                            showFullLink={true}
                            imageSize={QUICK_VIEW_IMAGE_SIZE}
                        />
                    )}
                </ModalBody>
            </ModalContent>
        </Modal>
    )
}

QuickViewModal.propTypes = {
    /** ProductSearchHit from the PLP search results */
    product: PropTypes.object,
    /** Controls modal open state */
    isOpen: PropTypes.bool.isRequired,
    /** Callback to close the modal */
    onClose: PropTypes.func.isRequired
}

export default QuickViewModal
