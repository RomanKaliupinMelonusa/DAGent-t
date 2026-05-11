/*
 * QuickViewModalShell — modal chrome (overlay, content container, close button, error boundary).
 *
 * Renders nothing when the Quick View is closed. When open, mounts a Chakra Modal
 * with the QuickViewModalBody inside an ErrorBoundary.
 *
 * See contracts/quick-view-modal.md §A for the binding contract.
 */
import React from 'react'
import {useIntl} from 'react-intl'
import {ErrorBoundary} from 'react-error-boundary'
import {
    Box,
    Text,
    Modal,
    ModalOverlay,
    ModalContent,
    ModalCloseButton,
    ModalBody
} from '@salesforce/retail-react-app/app/components/shared/ui'
import {useQuickView} from './context'
import QuickViewModalBody from './modal-body'
import messages from './messages'

/**
 * Fallback UI rendered when an error is caught inside the modal body.
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

    // Do not mount when closed — prevents useProductViewModal from firing during SSR
    // and when no product is selected.
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
        >
            <ModalOverlay />
            <ModalContent
                data-testid="quick-view-modal"
                aria-labelledby="quick-view-modal-title"
                maxH={{lg: '90vh'}}
            >
                <ModalCloseButton />
                <ModalBody p={6}>
                    <ErrorBoundary FallbackComponent={ModalErrorFallback}>
                        <QuickViewModalBody />
                    </ErrorBoundary>
                </ModalBody>
            </ModalContent>
        </Modal>
    )
}

export default QuickViewModalShell
