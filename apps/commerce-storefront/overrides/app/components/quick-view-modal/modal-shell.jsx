/*
 * QuickViewModalShell — gated Chakra Modal with ErrorBoundary.
 *
 * Renders `null` when the Quick View is closed so the body's commerce hooks
 * (useProductViewModal, basket mutations) never fire during SSR or while idle.
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
            aria-labelledby="quick-view-modal-title"
        >
            <ModalOverlay />
            <ModalContent data-testid="quick-view-modal" maxH={{lg: '90vh'}}>
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
