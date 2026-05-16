/*
 * QuickViewModalShell — the Chakra Modal container for Quick View.
 *
 * Contract: contracts/quick-view-modal.md §A
 *
 * The shell renders `null` when the Quick View is closed, so the body
 * (and its hooks) never mount during SSR or while inactive. When open,
 * it wraps the body in an ErrorBoundary so fetch failures render a
 * contained fallback instead of crashing the PLP.
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

    // Gated mount: body hooks never run when closed (FR-015 / SSR safety)
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
                maxHeight={{lg: '90vh'}}
            >
                <ModalCloseButton />
                <ModalBody p={0}>
                    <ErrorBoundary FallbackComponent={ErrorFallback}>
                        <QuickViewModalBody />
                    </ErrorBoundary>
                </ModalBody>
            </ModalContent>
        </Modal>
    )
}

export default QuickViewModalShell
