/*
 * Unit tests for QuickViewModalShell.
 *
 * Covers: UT-SHELL-001, UT-SHELL-002, UT-SHELL-003, UT-SHELL-004, UT-SHELL-005
 */
import React from 'react'
import {render, fireEvent} from '@testing-library/react'
import '@testing-library/jest-dom'

// --- Mocks ---

const mockCloseQuickView = jest.fn()
let mockContextValue = {
    isOpen: false,
    openProduct: null,
    closeQuickView: mockCloseQuickView
}

jest.mock('./context', () => ({
    useQuickView: () => mockContextValue
}))

// Handle compiled ICU messages from babel-plugin-formatjs
jest.mock('react-intl', () => ({
    useIntl: () => ({
        formatMessage: (msg) => {
            if (typeof msg === 'string') return msg
            const dm = msg?.defaultMessage
            if (Array.isArray(dm)) {
                return dm.map((node) => (node.value != null ? String(node.value) : '')).join('')
            }
            return typeof dm === 'string' ? dm : msg?.id || 'Error loading product'
        }
    }),
    defineMessages: (msgs) => msgs
}))

// Mock Chakra modal components
jest.mock('@salesforce/retail-react-app/app/components/shared/ui', () => {
    const R = require('react')
    return {
        Modal: function MockModal({children, isOpen, onClose, closeOnEsc}) {
            if (!isOpen) return null
            return R.createElement(
                'div',
                {
                    'data-testid': 'chakra-modal-wrapper',
                    onKeyDown: (e) => {
                        if (closeOnEsc !== false && e.key === 'Escape') onClose()
                    }
                },
                children
            )
        },
        ModalOverlay: function MockOverlay() {
            return R.createElement('div', {'data-testid': 'modal-overlay'})
        },
        ModalContent: function MockContent({children, 'data-testid': testId, ...rest}) {
            return R.createElement('div', {'data-testid': testId, ...rest}, children)
        },
        ModalCloseButton: function MockCloseButton() {
            return R.createElement('button', {
                'data-testid': 'modal-close-button',
                onClick: mockCloseQuickView
            }, 'Close')
        },
        ModalBody: function MockBody({children, ...rest}) {
            return R.createElement('div', {'data-testid': 'modal-body', ...rest}, children)
        },
        Box: function MockBox({children, 'data-testid': testId}) {
            return R.createElement('div', {'data-testid': testId}, children)
        },
        Text: function MockText({children}) {
            return R.createElement('span', null, typeof children === 'string' ? children : String(children || ''))
        }
    }
})

// Mock react-error-boundary with require('react') inside factory
jest.mock('react-error-boundary', () => {
    const R = require('react')
    class MockErrorBoundary extends R.Component {
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
                return R.createElement(FallbackComponent)
            }
            return this.props.children
        }
    }
    return {ErrorBoundary: MockErrorBoundary}
})

// Mock modal body
let mockModalBodyImpl = function MockModalBody() {
    return require('react').createElement('div', {'data-testid': 'mock-modal-body'}, 'Modal Body Content')
}
jest.mock('./modal-body', () => ({
    __esModule: true,
    default: function ModalBodyProxy(props) {
        return mockModalBodyImpl(props)
    }
}))

import QuickViewModalShell from './modal-shell'

const sampleProduct = {id: 'prod-123', name: 'Test Dress'}

describe('QuickViewModalShell', () => {
    beforeEach(() => {
        mockCloseQuickView.mockClear()
        mockModalBodyImpl = function MockModalBody() {
            return require('react').createElement('div', {'data-testid': 'mock-modal-body'}, 'Modal Body Content')
        }
        mockContextValue = {
            isOpen: false,
            openProduct: null,
            closeQuickView: mockCloseQuickView
        }
    })

    it('UT-SHELL-001 — modal not rendered when closed', () => {
        mockContextValue = {
            isOpen: false,
            openProduct: null,
            closeQuickView: mockCloseQuickView
        }
        const {queryByTestId} = render(<QuickViewModalShell />)
        expect(queryByTestId('quick-view-modal')).not.toBeInTheDocument()
    })

    it('UT-SHELL-002 — modal rendered when open', () => {
        mockContextValue = {
            isOpen: true,
            openProduct: sampleProduct,
            closeQuickView: mockCloseQuickView
        }
        const {getByTestId} = render(<QuickViewModalShell />)
        expect(getByTestId('quick-view-modal')).toBeInTheDocument()
    })

    it('UT-SHELL-003 — close button calls closeQuickView', () => {
        mockContextValue = {
            isOpen: true,
            openProduct: sampleProduct,
            closeQuickView: mockCloseQuickView
        }
        const {getByTestId} = render(<QuickViewModalShell />)
        fireEvent.click(getByTestId('modal-close-button'))
        expect(mockCloseQuickView).toHaveBeenCalledTimes(1)
    })

    it('UT-SHELL-004 — Escape key calls closeQuickView', () => {
        mockContextValue = {
            isOpen: true,
            openProduct: sampleProduct,
            closeQuickView: mockCloseQuickView
        }
        const {getByTestId} = render(<QuickViewModalShell />)
        fireEvent.keyDown(getByTestId('chakra-modal-wrapper'), {key: 'Escape'})
        expect(mockCloseQuickView).toHaveBeenCalledTimes(1)
    })

    it('UT-SHELL-005 — error boundary surfaces quick-view-modal-error on body throw', () => {
        mockContextValue = {
            isOpen: true,
            openProduct: sampleProduct,
            closeQuickView: mockCloseQuickView
        }

        // Override the body mock to throw
        mockModalBodyImpl = function ThrowingBody() {
            throw new Error('Simulated body render error')
        }

        // Suppress the error boundary's console.error output
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

        const {getByTestId, queryByTestId} = render(<QuickViewModalShell />)

        // The error fallback should be visible
        expect(getByTestId('quick-view-modal-error')).toBeInTheDocument()
        // The modal shell should still be mounted
        expect(queryByTestId('quick-view-modal')).toBeInTheDocument()

        consoleSpy.mockRestore()
    })
})
