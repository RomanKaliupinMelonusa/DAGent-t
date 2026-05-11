/*
 * QuickViewModalShell — gated Chakra Modal with ErrorBoundary.
 *
 * Renders null when the Quick View is closed, so hooks inside the body
 * (useProductViewModal, useProduct) never run during SSR or while closed.
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
            scrollBehavior="inside"
            closeOnOverlayClick
            closeOnEsc
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
