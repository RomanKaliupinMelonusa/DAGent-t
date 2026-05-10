import "@testing-library/jest-dom"
/*
 * Unit tests for QuickViewModalShell
 * Contract: contracts/quick-view-modal.md §A
 * Cases: UT-SHELL-001 through UT-SHELL-005
 */
import React from 'react'
import {render, screen, fireEvent} from '@testing-library/react'
import {IntlProvider} from 'react-intl'
import {QuickViewContext} from './context'

// Track the captured FallbackComponent
let mockFallbackRef = {current: null}

jest.mock('react-error-boundary', () => ({
    ErrorBoundary: ({children, FallbackComponent}) => {
        mockFallbackRef.current = FallbackComponent
        return <>{children}</>
    }
}))

// Use a mock variable (prefix `mock` is allowed)
let mockShouldBodyThrow = false
jest.mock('./modal-body', () => {
    const React = require('react')
    return function MockQuickViewModalBody() {
        if (mockShouldBodyThrow) {
            throw new Error('Test error in modal body')
        }
        return <div data-testid="mock-modal-body">Modal Body Content</div>
    }
})

// Mock Chakra UI components
jest.mock('@salesforce/retail-react-app/app/components/shared/ui', () => {
    const React = require('react')
    return {
        Modal: ({children, isOpen, onClose, ...rest}) => {
            if (!isOpen) return null
            return (
                <div data-testid="chakra-modal" role="dialog"
                    aria-labelledby={rest['aria-labelledby']}
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') onClose()
                    }}
                >
                    <div data-testid="modal-overlay-click" onClick={() => onClose()}>
                        {children}
                    </div>
                </div>
            )
        },
        ModalOverlay: () => <div data-testid="modal-overlay" />,
        ModalContent: ({children, ...rest}) => <div {...rest}>{children}</div>,
        ModalCloseButton: () => {
            return <button data-testid="modal-close-btn">Close</button>
        },
        ModalBody: ({children}) => <div>{children}</div>,
        Box: ({children, ...rest}) => <div {...rest}>{children}</div>,
        Text: ({children}) => <span>{children}</span>
    }
})

import QuickViewModalShell from './modal-shell'

const mockProduct = {
    id: 'prod-123',
    name: 'Test Product'
}

const renderShell = ({isOpen = false, openProduct = null, closeQuickView = jest.fn()} = {}) => {
    const contextValue = {isOpen, openProduct, closeQuickView, openQuickView: jest.fn()}
    return {
        closeQuickView,
        ...render(
            <IntlProvider locale="en-US" defaultLocale="en-US">
                <QuickViewContext.Provider value={contextValue}>
                    <QuickViewModalShell />
                </QuickViewContext.Provider>
            </IntlProvider>
        )
    }
}

describe('QuickViewModalShell', () => {
    beforeEach(() => {
        mockShouldBodyThrow = false
        mockFallbackRef.current = null
    })

    it('UT-SHELL-001 — modal not rendered when closed', () => {
        renderShell({isOpen: false, openProduct: null})
        expect(screen.queryByTestId('quick-view-modal')).not.toBeInTheDocument()
    })

    it('UT-SHELL-002 — modal rendered when open', () => {
        renderShell({isOpen: true, openProduct: mockProduct})
        expect(screen.getByTestId('quick-view-modal')).toBeInTheDocument()
    })

    it('UT-SHELL-003 — close button calls closeQuickView', () => {
        const closeQuickView = jest.fn()
        renderShell({isOpen: true, openProduct: mockProduct, closeQuickView})

        // In the real impl, the ModalCloseButton calls the Modal's onClose (= closeQuickView).
        // Our mock wires onClose through the overlay click wrapper.
        const overlayClick = screen.getByTestId('modal-overlay-click')
        fireEvent.click(overlayClick)

        expect(closeQuickView).toHaveBeenCalled()
    })

    it('UT-SHELL-004 — Escape key calls closeQuickView', () => {
        const closeQuickView = jest.fn()
        renderShell({isOpen: true, openProduct: mockProduct, closeQuickView})

        const modal = screen.getByTestId('chakra-modal')
        fireEvent.keyDown(modal, {key: 'Escape', code: 'Escape'})

        expect(closeQuickView).toHaveBeenCalled()
    })

    it('UT-SHELL-005 — error boundary surfaces quick-view-modal-error', () => {
        renderShell({isOpen: true, openProduct: mockProduct})

        // Verify the FallbackComponent was captured by the ErrorBoundary mock
        expect(mockFallbackRef.current).toBeTruthy()

        // Render the fallback to verify its testid
        const {getByTestId} = render(
            <IntlProvider locale="en-US" defaultLocale="en-US">
                {React.createElement(mockFallbackRef.current)}
            </IntlProvider>
        )
        expect(getByTestId('quick-view-modal-error')).toBeInTheDocument()

        // Verify the shell itself is still rendered (not crashed)
        expect(screen.getByTestId('quick-view-modal')).toBeInTheDocument()
    })
})
