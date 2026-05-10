/*
 * QuickViewModalShell — Chakra Modal wrapper gated on isOpen.
 *
 * Mounts only when a product is selected for Quick View. Contains an
 * ErrorBoundary so a failed detail fetch does not crash the PLP route.
 * Focus trap and focus restoration are delegated to Chakra's Modal defaults.
 */
import React from 'react'
import {useIntl} from 'react-intl'
import {
    Modal,
    ModalOverlay,
    ModalContent,
    ModalCloseButton,
    ModalBody,
    Box,
    Text
} from '@chakra-ui/react'
import {ErrorBoundary} from 'react-error-boundary'
import {useQuickView} from './context'
import QuickViewModalBody from './modal-body'
import messages from './messages'

/**
 * Error fallback rendered inside the modal when the body throws.
 * Exposes data-testid="quick-view-modal-error" for E2E targeting.
 */
const ModalErrorFallback = () => {
    const intl = useIntl()
    return (
        <Box data-testid="quick-view-modal-error" p={8} textAlign="center">
            <Text>{intl.formatMessage(messages.errorFallback)}</Text>
        </Box>
    )
}

const QuickViewModalShell = () => {
    const {isOpen, openProduct, closeQuickView} = useQuickView()

    // Don't mount anything when closed — prevents useProductViewModal from running
    if (!isOpen || !openProduct) {
        return null
    }

    return (
        <Modal
            isOpen
            onClose={closeQuickView}
            size={{base: 'full', lg: '5xl'}}
            isCentered
            closeOnEsc
            closeOnOverlayClick
            // returnFocusOnClose defaults to true in Chakra — restores focus to trigger
        >
            <ModalOverlay />
            <ModalContent
                data-testid="quick-view-modal"
                aria-labelledby="quick-view-modal-title"
                maxH={{lg: '90vh'}}
                overflow="auto"
            >
                <ModalCloseButton />
                <ModalBody p={0}>
                    <ErrorBoundary FallbackComponent={ModalErrorFallback}>
                        <QuickViewModalBody />
                    </ErrorBoundary>
                </ModalBody>
            </ModalContent>
        </Modal>
    )
}

export default QuickViewModalShell
