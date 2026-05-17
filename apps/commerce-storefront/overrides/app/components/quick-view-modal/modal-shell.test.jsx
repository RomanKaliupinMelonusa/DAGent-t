/*
 * Unit tests for QuickViewModalShell
 * Cases: UT-SHELL-001..005
 */
import React from 'react'
import '@testing-library/jest-dom'
import {render, screen, fireEvent} from '@testing-library/react'
import {IntlProvider} from 'react-intl'

// Control mock context state per test
let mockContextState = {
    isOpen: false,
    openProduct: null,
    closeQuickView: jest.fn()
}

jest.mock('./context', () => ({
    useQuickView: () => mockContextState
}))

// Mock Chakra UI modal components
jest.mock('@salesforce/retail-react-app/app/components/shared/ui', () => {
    const React = require('react')
    return {
        Modal: ({children, isOpen, onClose, ...props}) => {
            if (!isOpen) return null
            return (
                <div data-testid="chakra-modal" role="dialog" onKeyDown={(e) => {
                    if (e.key === 'Escape') onClose()
                }}>
                    {children}
                </div>
            )
        },
        ModalOverlay: () => <div data-testid="modal-overlay" />,
        ModalContent: ({children, ...props}) => <div {...props}>{children}</div>,
        ModalCloseButton: () => {
            const ctx = require('./context').useQuickView()
            return <button data-testid="modal-close-btn" onClick={ctx.closeQuickView}>Close</button>
        },
        ModalBody: ({children}) => <div>{children}</div>,
        Box: ({children, ...props}) => <div {...props}>{children}</div>,
        Text: ({children, ...props}) => <span {...props}>{children}</span>
    }
})

// Mock the modal body — by default renders fine, but we can make it throw
let mockBodyThrows = false
jest.mock('./modal-body', () => {
    const MockReact = require('react')
    return function MockModalBody() {
        if (mockBodyThrows) throw new Error('Body render error')
        return MockReact.createElement('div', {'data-testid': 'mock-modal-body'}, 'Modal Body Content')
    }
})

jest.mock('./messages', () => ({
    __esModule: true,
    default: {
        errorFallback: {
            id: 'commerce-storefront.quickView.errorFallback',
            defaultMessage: 'Something went wrong loading product details. Please close and try again.'
        }
    }
}))

import QuickViewModalShell from './modal-shell'

const wrap = (ui) => (
    <IntlProvider locale="en" defaultLocale="en">
        {ui}
    </IntlProvider>
)

describe('QuickViewModalShell', () => {
    const sampleProduct = {id: 'prod-001', name: 'Test Dress'}

    beforeEach(() => {
        mockBodyThrows = false
        mockContextState = {
            isOpen: false,
            openProduct: null,
            closeQuickView: jest.fn()
        }
    })

    it('UT-SHELL-001 — modal not rendered when closed', () => {
        mockContextState.isOpen = false
        mockContextState.openProduct = null
        render(wrap(<QuickViewModalShell />))
        expect(screen.queryByTestId('quick-view-modal')).not.toBeInTheDocument()
    })

    it('UT-SHELL-002 — modal rendered when open', () => {
        mockContextState.isOpen = true
        mockContextState.openProduct = sampleProduct
        render(wrap(<QuickViewModalShell />))
        expect(screen.getByTestId('quick-view-modal')).toBeInTheDocument()
    })

    it('UT-SHELL-003 — close button calls closeQuickView', () => {
        mockContextState.isOpen = true
        mockContextState.openProduct = sampleProduct
        render(wrap(<QuickViewModalShell />))

        fireEvent.click(screen.getByTestId('modal-close-btn'))
        expect(mockContextState.closeQuickView).toHaveBeenCalledTimes(1)
    })

    it('UT-SHELL-004 — Escape key calls closeQuickView', () => {
        mockContextState.isOpen = true
        mockContextState.openProduct = sampleProduct
        render(wrap(<QuickViewModalShell />))

        const dialog = screen.getByRole('dialog')
        fireEvent.keyDown(dialog, {key: 'Escape', code: 'Escape'})
        expect(mockContextState.closeQuickView).toHaveBeenCalledTimes(1)
    })

    it('UT-SHELL-005 — error boundary surfaces quick-view-modal-error', () => {
        mockBodyThrows = true
        mockContextState.isOpen = true
        mockContextState.openProduct = sampleProduct

        // Suppress console.error from ErrorBoundary
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
        render(wrap(<QuickViewModalShell />))
        consoleSpy.mockRestore()

        expect(screen.getByTestId('quick-view-modal-error')).toBeInTheDocument()
        // The modal shell itself remains mounted
        expect(screen.getByTestId('quick-view-modal')).toBeInTheDocument()
    })
})
