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
    Spinner
} from '@salesforce/retail-react-app/app/components/shared/ui'
import ProductView from '@salesforce/retail-react-app/app/components/product-view'
import {useProductViewModal} from '@salesforce/retail-react-app/app/hooks/use-product-view-modal'
import {useIntl} from 'react-intl'

/**
 * QuickViewModal — displays product details in a modal overlay from the PLP.
 * Reuses the existing ProductView component and useProductViewModal hook.
 */
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

    const {isFetching} = productViewModalData
    const fetchedProduct = productViewModalData?.product

    // After fetching is done, if product is null/undefined, show error
    const showError = !isFetching && !fetchedProduct
    const showProduct = !isFetching && !!fetchedProduct

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
                    {isFetching && (
                        <Center py={10}>
                            <Spinner size="xl" data-testid="quick-view-spinner" />
                        </Center>
                    )}
                    {showError && (
                        <Center py={10} data-testid="quick-view-error" flexDirection="column">
                            <span role="img" aria-label="warning" style={{fontSize: '2rem'}}>
                                ⚠️
                            </span>
                            <p style={{marginTop: '1rem'}}>
                                This product is no longer available.
                            </p>
                        </Center>
                    )}
                    {showProduct && (
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
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    product: PropTypes.object
}

export default QuickViewModal
