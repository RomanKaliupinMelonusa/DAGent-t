/*
 * Unit tests for QuickViewModalShell.
 *
 * Covers: UT-SHELL-001 through UT-SHELL-005
 */
import React from 'react'
import {render, fireEvent} from '@testing-library/react'
import '@testing-library/jest-dom'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockCloseQuickView = jest.fn()
let mockIsOpen = false
let mockOpenProduct = null

jest.mock('./context', () => ({
    useQuickView: () => ({
        isOpen: mockIsOpen,
        openProduct: mockOpenProduct,
        openQuickView: jest.fn(),
        closeQuickView: mockCloseQuickView
    })
}))

jest.mock('react-intl', () => ({
    useIntl: () => ({
        formatMessage: (msg) => msg.defaultMessage || ''
    }),
    defineMessages: (msgs) => msgs
}))

// Track the onClose callback the Modal receives
let mockCapturedOnClose = null

jest.mock('@salesforce/retail-react-app/app/components/shared/ui', () => ({
    Modal: ({children, isOpen, onClose, ...rest}) => {
        mockCapturedOnClose = onClose
        return isOpen ? (
            <div data-testid="chakra-modal" role="dialog" {...rest}>
                {children}
            </div>
        ) : null
    },
    ModalOverlay: ({children}) => <div data-testid="modal-overlay">{children}</div>,
    ModalContent: ({children, ...rest}) => <div {...rest}>{children}</div>,
    ModalCloseButton: () => {
        return (
            <button
                data-testid="modal-close-btn"
                aria-label="Close"
                onClick={() => mockCapturedOnClose && mockCapturedOnClose()}
            />
        )
    },
    ModalBody: ({children}) => <div>{children}</div>,
    Box: ({children, ...rest}) => <div {...rest}>{children}</div>,
    Text: ({children}) => <span>{children}</span>
}))

// Mock the modal body — default: renders normally
let mockShouldBodyThrow = false
jest.mock('./modal-body', () => {
    return function MockQuickViewModalBody() {
        if (mockShouldBodyThrow) {
            throw new Error('Simulated render error in modal body')
        }
        return <div data-testid="quick-view-modal-body">Modal Body Content</div>
    }
})

jest.mock('./messages', () => ({
    errorFallback: {
        id: 'commerce-storefront.quickView.errorFallback',
        defaultMessage: 'Unable to load product details. Please close and try again.'
    }
}))

// Import after mocks
import QuickViewModalShell from './modal-shell'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const simpleProduct = {
    id: 'prod-simple-001',
    name: 'Simple Dress',
    price: 49.99,
    type: {}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('QuickViewModalShell', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockIsOpen = false
        mockOpenProduct = null
        mockShouldBodyThrow = false
        mockCapturedOnClose = null
    })

    it('UT-SHELL-001 — modal not rendered when closed', () => {
        mockIsOpen = false
        mockOpenProduct = null
        const {queryByTestId} = render(<QuickViewModalShell />)
        expect(queryByTestId('quick-view-modal')).not.toBeInTheDocument()
    })

    it('UT-SHELL-002 — modal rendered when open', () => {
        mockIsOpen = true
        mockOpenProduct = simpleProduct
        const {getByTestId} = render(<QuickViewModalShell />)
        expect(getByTestId('quick-view-modal')).toBeInTheDocument()
    })

    it('UT-SHELL-003 — close button calls closeQuickView', () => {
        mockIsOpen = true
        mockOpenProduct = simpleProduct
        const {getByTestId} = render(<QuickViewModalShell />)
        fireEvent.click(getByTestId('modal-close-btn'))
        expect(mockCloseQuickView).toHaveBeenCalledTimes(1)
    })

    it('UT-SHELL-004 — Escape key calls closeQuickView', () => {
        mockIsOpen = true
        mockOpenProduct = simpleProduct
        render(<QuickViewModalShell />)

        // Chakra Modal calls onClose when Escape is pressed.
        // Our mock captures onClose; invoke it directly to simulate Chakra's behavior.
        expect(mockCapturedOnClose).toBeTruthy()
        mockCapturedOnClose()
        expect(mockCloseQuickView).toHaveBeenCalledTimes(1)
    })

    it('UT-SHELL-005 — error boundary surfaces quick-view-modal-error', () => {
        mockIsOpen = true
        mockOpenProduct = simpleProduct
        mockShouldBodyThrow = true

        // Suppress React error boundary console.error noise
        const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {})

        const {getByTestId, queryByTestId} = render(<QuickViewModalShell />)

        // The error fallback should be visible
        expect(getByTestId('quick-view-modal-error')).toBeInTheDocument()
        // The shell (modal container) should still be mounted
        expect(getByTestId('quick-view-modal')).toBeInTheDocument()
        // The body should NOT be visible (replaced by fallback)
        expect(queryByTestId('quick-view-modal-body')).not.toBeInTheDocument()

        mockConsoleError.mockRestore()
    })
})
