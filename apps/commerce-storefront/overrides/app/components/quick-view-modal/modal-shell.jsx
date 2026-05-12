/*
 * QuickViewModalShell — the gated Chakra Modal wrapper.
 * Mounts only when isOpen is true, so the body's hooks never fire during SSR.
 *
 * Contract: contracts/quick-view-modal.md §A
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
} from '@salesforce/retail-react-app/app/components/shared/ui'
import {ErrorBoundary} from 'react-error-boundary'
import {useQuickView} from './context'
import QuickViewModalBodyComponent from './modal-body'
import messages from './messages'

/**
 * Error fallback rendered when the modal body throws during render.
 * The shell stays mounted (close button still works).
 */
const ErrorFallback = () => {
    const intl = useIntl()
    return (
        <Box data-testid="quick-view-modal-error" p={6} textAlign="center">
            <Text>{intl.formatMessage(messages.errorFallback)}</Text>
        </Box>
    )
}

const QuickViewModalShell = () => {
    const {isOpen, openProduct, closeQuickView} = useQuickView()

    // Don't mount modal at all when closed — prevents body hooks from running
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
            returnFocusOnClose
        >
            <ModalOverlay />
            <ModalContent
                data-testid="quick-view-modal"
                aria-labelledby="quick-view-modal-title"
                maxH={{lg: '90vh'}}
            >
                <ModalCloseButton />
                <ModalBody p={0}>
                    <ErrorBoundary FallbackComponent={ErrorFallback}>
                        <QuickViewModalBodyComponent />
                    </ErrorBoundary>
                </ModalBody>
            </ModalContent>
        </Modal>
    )
}

export default QuickViewModalShell
