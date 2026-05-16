/*
 * QuickViewModalShell — the Chakra Modal wrapper that gates mount on isOpen.
 *
 * - Renders null when the modal is not open (body hooks never run during SSR).
 * - Wraps the body in an ErrorBoundary with a fallback exposing
 *   data-testid="quick-view-modal-error".
 * - Chakra handles focus trap, Escape, overlay click, and returnFocusOnClose.
 *
 * See contracts/quick-view-modal.md §A.
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

const ErrorFallback = () => {
    const intl = useIntl()
    return (
        <Box
            data-testid="quick-view-modal-error"
            p={8}
            textAlign="center"
        >
            <Text>{intl.formatMessage(messages.errorFallback)}</Text>
        </Box>
    )
}

const QuickViewModalShell = () => {
    const {isOpen, openProduct, closeQuickView} = useQuickView()

    // Gate: do not mount anything when modal is closed.
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
                maxH={{base: '100vh', lg: '90vh'}}
            >
                <ModalCloseButton />
                <ModalBody p={0} display="flex" flexDirection="column">
                    <ErrorBoundary FallbackComponent={ErrorFallback}>
                        <QuickViewModalBody />
                    </ErrorBoundary>
                </ModalBody>
            </ModalContent>
        </Modal>
    )
}

export default QuickViewModalShell
