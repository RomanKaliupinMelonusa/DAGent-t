/*
 * Unit tests for QuickViewModalShell.
 * Cases: UT-SHELL-001 through UT-SHELL-005
 */
import React from 'react'
import {render, screen, fireEvent} from '@testing-library/react'
import '@testing-library/jest-dom'

// --- Mocks ---
const mockCloseQuickView = jest.fn()
let mockIsOpen = false
let mockOpenProduct = null

jest.mock('./context', () => ({
    useQuickView: () => ({
        isOpen: mockIsOpen,
        openProduct: mockOpenProduct,
        closeQuickView: mockCloseQuickView,
        openQuickView: jest.fn()
    })
}))

// Mock react-intl
jest.mock('react-intl', () => ({
    useIntl: () => ({
        formatMessage: (msg) => msg.defaultMessage || msg.id
    }),
    defineMessages: (msgs) => msgs
}))

// Track whether modal body should throw
let mockBodyShouldThrow = false

jest.mock('./modal-body', () => {
    return function MockQuickViewModalBody() {
        if (mockBodyShouldThrow) {
            throw new Error('Simulated body render error')
        }
        return require('react').createElement('div', {'data-testid': 'mock-modal-body'}, 'Body')
    }
})

// Mock Chakra UI components
jest.mock('@chakra-ui/react', () => {
    const reactModule = require('react')
    return {
        Modal: ({children, isOpen, onClose, ...rest}) => {
            if (!isOpen) return null
            return reactModule.createElement(
                'div',
                {
                    'data-testid': 'chakra-modal',
                    role: 'dialog',
                    'aria-labelledby': rest['aria-labelledby'],
                    onKeyDown: (e) => {
                        if (e.key === 'Escape') onClose()
                    }
                },
                // Render an overlay div that calls onClose on click
                reactModule.createElement('div', {
                    'data-testid': 'chakra-modal-overlay',
                    onClick: onClose
                }),
                children
            )
        },
        ModalOverlay: () => null,
        ModalContent: ({children, ...props}) =>
            reactModule.createElement('div', props, children),
        ModalCloseButton: () => {
            // Access onClose via the mock context
            const ctx = require('./context').useQuickView()
            return reactModule.createElement(
                'button',
                {
                    'data-testid': 'modal-close-btn',
                    'aria-label': 'Close',
                    onClick: ctx.closeQuickView
                },
                '×'
            )
        },
        ModalBody: ({children, ...props}) =>
            reactModule.createElement('div', {'data-testid': 'chakra-modal-body', ...props}, children),
        Box: ({children, ...props}) => {
            const htmlProps = {}
            for (const [k, v] of Object.entries(props)) {
                if (k.startsWith('data-') || k === 'className' || k === 'id') htmlProps[k] = v
            }
            return reactModule.createElement('div', htmlProps, children)
        },
        Text: ({children}) => reactModule.createElement('span', null, children)
    }
})

// Mock react-error-boundary
jest.mock('react-error-boundary', () => {
    const reactModule = require('react')

    class MockErrorBoundary extends reactModule.Component {
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
                return reactModule.createElement(FallbackComponent, {})
            }
            return this.props.children
        }
    }

    return {ErrorBoundary: MockErrorBoundary}
})

// Mock messages
jest.mock('./messages', () => ({
    errorFallback: {
        id: 'commerce-storefront.quickView.errorFallback',
        defaultMessage: 'Unable to load product details. Please close and try again.'
    }
}))

import QuickViewModalShell from './modal-shell'

const sampleProduct = {
    id: 'prod-001',
    name: 'Test Dress'
}

describe('QuickViewModalShell', () => {
    beforeEach(() => {
        mockCloseQuickView.mockClear()
        mockIsOpen = false
        mockOpenProduct = null
        mockBodyShouldThrow = false
    })

    it('UT-SHELL-001 — modal not rendered when closed', () => {
        mockIsOpen = false
        mockOpenProduct = null
        const {container} = render(<QuickViewModalShell />)
        expect(container.querySelector('[data-testid="quick-view-modal"]')).toBeNull()
    })

    it('UT-SHELL-002 — modal rendered when open', () => {
        mockIsOpen = true
        mockOpenProduct = sampleProduct
        render(<QuickViewModalShell />)
        expect(screen.getByTestId('quick-view-modal')).toBeInTheDocument()
    })

    it('UT-SHELL-003 — close button calls closeQuickView', () => {
        mockIsOpen = true
        mockOpenProduct = sampleProduct
        render(<QuickViewModalShell />)
        fireEvent.click(screen.getByTestId('modal-close-btn'))
        expect(mockCloseQuickView).toHaveBeenCalledTimes(1)
    })

    it('UT-SHELL-004 — Escape key calls closeQuickView', () => {
        mockIsOpen = true
        mockOpenProduct = sampleProduct
        render(<QuickViewModalShell />)
        const modal = screen.getByTestId('chakra-modal')
        fireEvent.keyDown(modal, {key: 'Escape', code: 'Escape'})
        expect(mockCloseQuickView).toHaveBeenCalledTimes(1)
    })

    it('UT-SHELL-005 — error boundary surfaces quick-view-modal-error on body throw', () => {
        mockIsOpen = true
        mockOpenProduct = sampleProduct
        mockBodyShouldThrow = true

        // Suppress console.error from the error boundary
        const spy = jest.spyOn(console, 'error').mockImplementation(() => {})

        render(<QuickViewModalShell />)

        // The error fallback should be visible
        expect(screen.getByTestId('quick-view-modal-error')).toBeInTheDocument()
        // The shell (modal container) should still be mounted
        expect(screen.getByTestId('quick-view-modal')).toBeInTheDocument()

        spy.mockRestore()
    })
})
