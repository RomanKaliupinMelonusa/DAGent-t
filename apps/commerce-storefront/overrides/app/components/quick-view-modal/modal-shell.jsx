/*
 * QuickViewModalShell — the singleton modal container.
 *
 * - Renders nothing when the Quick View is closed (body hooks never run).
 * - Wraps the body in an ErrorBoundary with a localized fallback.
 * - Chakra Modal handles focus trap, Escape, overlay click, and focus restoration.
 *
 * See: contracts/quick-view-modal.md §A
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
import QuickViewModalBody from './modal-body'
import messages from './messages'

/**
 * ErrorFallback — rendered inside the modal when the body throws.
 * Exposes data-testid="quick-view-modal-error" per contract.
 */
const ErrorFallback = () => {
    const intl = useIntl()
    return (
        <Box p={8} textAlign="center" data-testid="quick-view-modal-error">
            <Text>{intl.formatMessage(messages.errorFallback)}</Text>
        </Box>
    )
}

const QuickViewModalShell = () => {
    const {isOpen, openProduct, closeQuickView} = useQuickView()

    // Always render the Modal so Chakra can manage its exit animation and
    // portal cleanup. Only mount the expensive body when open.
    return (
        <Modal
            isOpen={isOpen && !!openProduct}
            onClose={closeQuickView}
            size={{base: 'full', lg: '5xl'}}
            isCentered
            scrollBehavior="inside"
            closeOnEsc
            closeOnOverlayClick
        >
            <ModalOverlay />
            <ModalContent data-testid="quick-view-modal" aria-labelledby="quick-view-modal-title">
                <ModalCloseButton />
                <ModalBody p={{base: 4, lg: 8}}>
                    {isOpen && openProduct ? (
                        <ErrorBoundary FallbackComponent={ErrorFallback}>
                            <QuickViewModalBody />
                        </ErrorBoundary>
                    ) : null}
                </ModalBody>
            </ModalContent>
        </Modal>
    )
}

export default QuickViewModalShell
