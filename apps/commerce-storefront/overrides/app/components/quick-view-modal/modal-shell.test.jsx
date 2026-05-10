/*
 * Unit tests for QuickViewModalShell.
 * Covers: UT-SHELL-001, UT-SHELL-002, UT-SHELL-003, UT-SHELL-004, UT-SHELL-005
 */
import React from 'react'
import {render, fireEvent} from '@testing-library/react'
import '@testing-library/jest-dom'
import {IntlProvider} from 'react-intl'

// Mutable mock state so each test can configure isOpen/openProduct
const mockContextState = {
    isOpen: false,
    openProduct: null,
    closeQuickView: jest.fn()
}

jest.mock('./context', () => ({
    useQuickView: () => mockContextState
}))

// Mock the modal body — default renders normally; tests can override to throw
let mockShouldBodyThrow = false
jest.mock('./modal-body', () => {
    return function MockModalBody() {
        if (mockShouldBodyThrow) {
            throw new Error('Body render failure')
        }
        return <div data-testid="mock-modal-body">Modal Body Content</div>
    }
})

// Mock Chakra UI to render simple DOM elements preserving key props
jest.mock('@salesforce/retail-react-app/app/components/shared/ui', () => ({
    Modal: ({children, isOpen, onClose, closeOnEsc}) => {
        if (!isOpen) return null
        return (
            <div
                data-testid="chakra-modal"
                onKeyDown={(e) => {
                    if (closeOnEsc !== false && e.key === 'Escape') {
                        onClose()
                    }
                }}
            >
                {children}
            </div>
        )
    },
    ModalOverlay: () => <div data-testid="modal-overlay" />,
    ModalContent: ({children, ...props}) => <div {...props}>{children}</div>,
    ModalCloseButton: () => {
        return (
            <button data-testid="modal-close-btn" onClick={mockContextState.closeQuickView}>
                Close
            </button>
        )
    },
    ModalBody: ({children, ...props}) => <div {...props}>{children}</div>,
    Box: ({children, ...props}) => <div {...props}>{children}</div>,
    Text: ({children}) => <span>{children}</span>
}))

// Mock react-error-boundary using require('react') inside factory
jest.mock('react-error-boundary', () => {
    const ReactInFactory = require('react')
    return {
        ErrorBoundary: class ErrorBoundary extends ReactInFactory.Component {
            constructor(props) {
                super(props)
                this.state = {hasError: false}
            }
            static getDerivedStateFromError() {
                return {hasError: true}
            }
            render() {
                if (this.state.hasError) {
                    const FallbackComponent = this.props.FallbackComponent
                    return ReactInFactory.createElement(FallbackComponent)
                }
                return this.props.children
            }
        }
    }
})

import QuickViewModalShell from './modal-shell'

const renderShell = () => {
    return render(
        <IntlProvider locale="en-US" messages={{}}>
            <QuickViewModalShell />
        </IntlProvider>
    )
}

describe('QuickViewModalShell', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockContextState.isOpen = false
        mockContextState.openProduct = null
        mockContextState.closeQuickView = jest.fn()
        mockShouldBodyThrow = false
    })

    it('UT-SHELL-001 — modal not rendered when isOpen is false', () => {
        mockContextState.isOpen = false
        mockContextState.openProduct = null
        const {queryByTestId} = renderShell()
        expect(queryByTestId('quick-view-modal')).toBeNull()
    })

    it('UT-SHELL-002 — modal rendered when isOpen is true', () => {
        mockContextState.isOpen = true
        mockContextState.openProduct = {id: 'prod-1', name: 'Dress'}
        const {getByTestId} = renderShell()
        expect(getByTestId('quick-view-modal')).toBeInTheDocument()
    })

    it('UT-SHELL-003 — close button calls closeQuickView', () => {
        mockContextState.isOpen = true
        mockContextState.openProduct = {id: 'prod-1', name: 'Dress'}
        const {getByTestId} = renderShell()
        fireEvent.click(getByTestId('modal-close-btn'))
        expect(mockContextState.closeQuickView).toHaveBeenCalledTimes(1)
    })

    it('UT-SHELL-004 — Escape key calls closeQuickView', () => {
        mockContextState.isOpen = true
        mockContextState.openProduct = {id: 'prod-1', name: 'Dress'}
        const {getByTestId} = renderShell()
        fireEvent.keyDown(getByTestId('chakra-modal'), {key: 'Escape'})
        expect(mockContextState.closeQuickView).toHaveBeenCalledTimes(1)
    })

    it('UT-SHELL-005 — error boundary surfaces quick-view-modal-error when body throws', () => {
        mockShouldBodyThrow = true
        mockContextState.isOpen = true
        mockContextState.openProduct = {id: 'prod-1', name: 'Dress'}

        // Suppress React error boundary console.error
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

        const {getByTestId, queryByTestId} = renderShell()
        expect(getByTestId('quick-view-modal-error')).toBeInTheDocument()
        // Shell (quick-view-modal) remains mounted
        expect(queryByTestId('quick-view-modal')).toBeInTheDocument()

        consoleSpy.mockRestore()
    })
})
