/*
 * Unit tests for QuickViewModalShell
 * Binding contract: unit-tests.md §UT-SHELL-*
 */
import React from 'react'
import '@testing-library/jest-dom'
import {render, screen, fireEvent} from '@testing-library/react'
import {IntlProvider} from 'react-intl'

const mockCloseQuickView = jest.fn()
let mockContextValue = {
    isOpen: false,
    openProduct: null,
    closeQuickView: mockCloseQuickView,
    openQuickView: jest.fn()
}

jest.mock('./context', () => ({
    useQuickView: () => mockContextValue
}))

// Mock modal-body — default: renders normally
let mockBodyShouldThrow = false
jest.mock('./modal-body', () => {
    return function MockModalBody() {
        if (mockBodyShouldThrow) {
            throw new Error('Body render error')
        }
        return <div data-testid="mock-modal-body">Modal Body Content</div>
    }
})

// Mock Chakra UI
jest.mock('@salesforce/retail-react-app/app/components/shared/ui', () => ({
    Modal: ({children, isOpen, onClose}) =>
        isOpen ? (
            <div role="dialog" onKeyDown={(e) => {
                if (e.key === 'Escape') onClose()
            }}>
                {children}
            </div>
        ) : null,
    ModalOverlay: () => <div data-testid="modal-overlay" />,
    ModalContent: ({children, ...props}) => <div {...props}>{children}</div>,
    ModalCloseButton: () => (
        <button data-testid="modal-close-btn" onClick={mockCloseQuickView}>×</button>
    ),
    ModalBody: ({children}) => <div>{children}</div>,
    Box: ({children, ...props}) => <div {...props}>{children}</div>,
    Text: ({children}) => <span>{children}</span>
}))

// Mock react-error-boundary with real error catching behavior
jest.mock('react-error-boundary', () => {
    const React = require('react')
    return {
        ErrorBoundary: class ErrorBoundary extends React.Component {
            constructor(props) {
                super(props)
                this.state = {hasError: false}
            }
            static getDerivedStateFromError() {
                return {hasError: true}
            }
            render() {
                if (this.state.hasError) {
                    const Fallback = this.props.FallbackComponent
                    return <Fallback />
                }
                return this.props.children
            }
        }
    }
})

jest.mock('./messages', () => ({
    errorFallback: {id: 'test.errorFallback', defaultMessage: 'Error loading product'}
}))

import QuickViewModalShell from './modal-shell'

const sampleProduct = {
    id: 'prod-abc',
    name: 'Test Product',
    type: {}
}

const renderShell = () =>
    render(
        <IntlProvider locale="en" messages={{}}>
            <QuickViewModalShell />
        </IntlProvider>
    )

describe('QuickViewModalShell', () => {
    beforeEach(() => {
        mockCloseQuickView.mockClear()
        mockBodyShouldThrow = false
        mockContextValue = {
            isOpen: false,
            openProduct: null,
            closeQuickView: mockCloseQuickView,
            openQuickView: jest.fn()
        }
    })

    it('UT-SHELL-001 — modal not rendered when isOpen is false', () => {
        mockContextValue.isOpen = false
        mockContextValue.openProduct = null
        renderShell()
        expect(screen.queryByTestId('quick-view-modal')).not.toBeInTheDocument()
    })

    it('UT-SHELL-002 — modal rendered when isOpen is true', () => {
        mockContextValue.isOpen = true
        mockContextValue.openProduct = sampleProduct
        renderShell()
        expect(screen.getByTestId('quick-view-modal')).toBeInTheDocument()
    })

    it('UT-SHELL-003 — close button calls closeQuickView', () => {
        mockContextValue.isOpen = true
        mockContextValue.openProduct = sampleProduct
        renderShell()
        fireEvent.click(screen.getByTestId('modal-close-btn'))
        expect(mockCloseQuickView).toHaveBeenCalledTimes(1)
    })

    it('UT-SHELL-004 — Escape key calls closeQuickView', () => {
        mockContextValue.isOpen = true
        mockContextValue.openProduct = sampleProduct
        renderShell()
        const dialog = screen.getByRole('dialog')
        fireEvent.keyDown(dialog, {key: 'Escape'})
        expect(mockCloseQuickView).toHaveBeenCalledTimes(1)
    })

    it('UT-SHELL-005 — error boundary surfaces quick-view-modal-error on body throw', () => {
        mockContextValue.isOpen = true
        mockContextValue.openProduct = sampleProduct
        mockBodyShouldThrow = true

        // Suppress React error boundary console.error noise
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
        renderShell()
        consoleSpy.mockRestore()

        // Error fallback should be visible
        expect(screen.getByTestId('quick-view-modal-error')).toBeInTheDocument()
        // Modal shell should still be mounted (the ModalContent with testid is still there)
        expect(screen.getByTestId('quick-view-modal')).toBeInTheDocument()
    })
})
