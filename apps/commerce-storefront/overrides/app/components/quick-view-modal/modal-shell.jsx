/*
 * QuickViewModalShell — Chakra Modal wrapper for Quick View.
 *
 * Gated on isOpen: renders null when closed so the body's hooks
 * (useProductViewModal, useShopperBasketsMutation) never run during
 * SSR or while the modal is hidden.
 *
 * Contract: contracts/quick-view-modal.md §A
 */
import React from 'react'
import {useIntl} from 'react-intl'
import {ErrorBoundary} from 'react-error-boundary'
import {
    Modal,
    ModalOverlay,
    ModalContent,
    ModalCloseButton,
    ModalBody,
    Box,
    Text
} from '@salesforce/retail-react-app/app/components/shared/ui'
import {useQuickView} from './context'
import QuickViewModalBody from './modal-body'
import messages from './messages'

/**
 * Error fallback rendered inside the modal when the body throws.
 * Exposes data-testid="quick-view-modal-error" per the contract.
 */
const ModalErrorFallback = () => {
    const intl = useIntl()
    return (
        <Box data-testid="quick-view-modal-error" p={6} textAlign="center">
            <Text>{intl.formatMessage(messages.errorFallback)}</Text>
        </Box>
    )
}

const QuickViewModalShell = () => {
    const {isOpen, openProduct, closeQuickView} = useQuickView()

    if (!isOpen || !openProduct) {
        return null
    }

    return (
        <Modal
            isOpen
            onClose={closeQuickView}
            size={{base: 'full', lg: '5xl'}}
            isCentered
            closeOnOverlayClick
            closeOnEsc
            scrollBehavior="inside"
            aria-labelledby="quick-view-modal-title"
        >
            <ModalOverlay />
            <ModalContent data-testid="quick-view-modal">
                <ModalCloseButton />
                <ModalBody p={{base: 4, lg: 6}}>
                    <ErrorBoundary FallbackComponent={ModalErrorFallback}>
                        <QuickViewModalBody />
                    </ErrorBoundary>
                </ModalBody>
            </ModalContent>
        </Modal>
    )
}

export default QuickViewModalShell
