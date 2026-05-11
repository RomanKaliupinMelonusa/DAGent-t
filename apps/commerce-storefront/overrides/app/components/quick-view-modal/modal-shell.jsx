/*
 * QuickViewModalShell — gated Chakra Modal with ErrorBoundary.
 *
 * Uses Chakra's `isOpen` prop to control visibility so the Modal's portal
 * cleanup runs correctly on close. The body is gated on `isOpen && openProduct`
 * so commerce hooks (useProductViewModal, basket mutations) never fire during
 * SSR or while the modal is closed.
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

    const shouldShow = isOpen && !!openProduct

    return (
        <Modal
            isOpen={shouldShow}
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
                        {shouldShow && <QuickViewModalBody />}
                    </ErrorBoundary>
                </ModalBody>
            </ModalContent>
        </Modal>
    )
}

export default QuickViewModalShell
