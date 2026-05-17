/*
 * QuickViewModalShell — gated Chakra Modal with ErrorBoundary.
 *
 * Renders nothing when closed. When open, mounts the modal body
 * (and its hooks) for the first time.
 *
 * See contracts/quick-view-modal.md §A for the binding surface.
 */
import React from 'react'
import {useIntl} from 'react-intl'
import {ErrorBoundary} from 'react-error-boundary'
import {
    Modal,
    ModalOverlay,
    ModalContent,
    ModalCloseButton,
    Box,
    Text,
    useBreakpointValue
} from '@salesforce/retail-react-app/app/components/shared/ui'
import {useQuickView} from './context'
import QuickViewModalBody from './modal-body'
import messages from './messages'

const ErrorFallback = ({intl}) => (
    <Box data-testid="quick-view-modal-error" p={8} textAlign="center">
        <Text>{intl.formatMessage(messages.errorFallback)}</Text>
    </Box>
)

const QuickViewModalShell = () => {
    const {isOpen, openProduct, closeQuickView} = useQuickView()
    const intl = useIntl()
    const size = useBreakpointValue({base: 'full', lg: '5xl'})

    // Gate: don't mount until opened
    if (!isOpen || !openProduct) {
        return null
    }

    return (
        <Modal
            isOpen
            onClose={closeQuickView}
            size={size}
            isCentered
            closeOnOverlayClick
            closeOnEsc
            scrollBehavior="inside"
            // Chakra default returnFocusOnClose=true handles focus restoration
        >
            <ModalOverlay />
            <ModalContent
                data-testid="quick-view-modal"
                aria-labelledby="quick-view-modal-title"
                maxH={{base: '100vh', lg: '90vh'}}
                p={{base: 4, lg: 8}}
            >
                <ModalCloseButton aria-label={intl.formatMessage(messages.closeLabel)} />
                <ErrorBoundary
                    fallback={<ErrorFallback intl={intl} />}
                    resetKeys={[openProduct?.id || openProduct?.productId]}
                >
                    <QuickViewModalBody />
                </ErrorBoundary>
            </ModalContent>
        </Modal>
    )
}

export default QuickViewModalShell
