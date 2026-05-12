/*
 * QuickViewModalShell — Chakra Modal wrapper with ErrorBoundary.
 *
 * Gated on `isOpen` so the body (and its hooks) never mount during SSR
 * or while the modal is closed.
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
 * The shell stays mounted so the close button still works.
 */
const QuickViewErrorFallback = () => {
    const intl = useIntl()
    return (
        <Box data-testid="quick-view-modal-error" p={6} textAlign="center">
            <Text>{intl.formatMessage(messages.errorFallback)}</Text>
        </Box>
    )
}

const QuickViewModalShell = () => {
    const {isOpen, openProduct, closeQuickView} = useQuickView()

    // Don't mount the modal at all when closed — prevents hooks in body from running
    if (!isOpen || !openProduct) return null

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
                <ModalBody p={{base: 4, lg: 6}}>
                    <ErrorBoundary FallbackComponent={QuickViewErrorFallback}>
                        <QuickViewModalBody />
                    </ErrorBoundary>
                </ModalBody>
            </ModalContent>
        </Modal>
    )
}

export default QuickViewModalShell
