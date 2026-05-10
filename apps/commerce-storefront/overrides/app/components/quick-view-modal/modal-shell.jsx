/*
 * QuickViewModalShell — gated Chakra Modal with ErrorBoundary.
 *
 * Renders null when the Quick View is closed. When open, composes
 * Modal/ModalOverlay/ModalContent/ModalCloseButton and wraps the body
 * in an ErrorBoundary whose fallback exposes data-testid="quick-view-modal-error".
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
        <Box data-testid="quick-view-modal-error" p={8} textAlign="center">
            <Text>{intl.formatMessage(messages.errorFallback)}</Text>
        </Box>
    )
}

const QuickViewModalShell = () => {
    const {isOpen, openProduct, closeQuickView} = useQuickView()

    if (!isOpen || !openProduct) return null

    return (
        <Modal
            isOpen
            onClose={closeQuickView}
            size={{base: 'full', lg: '5xl'}}
            isCentered
            closeOnOverlayClick
            closeOnEsc
            returnFocusOnClose
        >
            <ModalOverlay />
            <ModalContent
                data-testid="quick-view-modal"
                aria-labelledby="quick-view-modal-title"
                maxH={{lg: '90vh'}}
                overflow="auto"
            >
                <ModalCloseButton />
                <ModalBody p={{base: 4, lg: 8}}>
                    <ErrorBoundary FallbackComponent={ErrorFallback}>
                        <QuickViewModalBody />
                    </ErrorBoundary>
                </ModalBody>
            </ModalContent>
        </Modal>
    )
}

export default QuickViewModalShell
