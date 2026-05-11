/*
 * QuickViewModalShell — Chakra Modal wrapper that renders only when Quick View
 * is open. Wraps the body in a React ErrorBoundary for isolation.
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
 * ErrorBoundary fallback rendered inside the modal when the body throws.
 * Exposes data-testid="quick-view-modal-error" per the E2E contract.
 */
const ModalErrorFallback = () => {
    // useIntl is NOT available here because ErrorBoundary fallback renders
    // outside the normal component tree's hooks. Use a static English string
    // as a safe default; the intl version is in messages.js for the wrapped component.
    return (
        <Box data-testid="quick-view-modal-error" p={6} textAlign="center">
            <Text>Unable to load product details. Please close and try again.</Text>
        </Box>
    )
}

const QuickViewModalShell = () => {
    const {isOpen, openProduct, closeQuickView} = useQuickView()

    // Don't mount anything (including the body's hooks) when closed.
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
