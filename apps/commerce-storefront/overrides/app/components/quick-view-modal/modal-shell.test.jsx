/*
 * Unit tests for QuickViewModalShell component.
 * Cases: UT-SHELL-001 through UT-SHELL-005
 */
import React from 'react'
import {render, fireEvent} from '@testing-library/react'
import '@testing-library/jest-dom'
import {IntlProvider} from 'react-intl'
import {QuickViewContext} from './context'

// Control variable for mock body behavior (prefixed with `mock` per jest rule)
let mockBodyShouldThrow = false
let mockCloseQuickView = jest.fn()

// Mock react-error-boundary
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
                    const FallbackComponent = this.props.FallbackComponent
                    return <FallbackComponent />
                }
                return this.props.children
            }
        }
    }
})

// Mock the modal-body to control its behavior
jest.mock('./modal-body', () => {
    return function MockQuickViewModalBody() {
        if (mockBodyShouldThrow) {
            throw new Error('Test body error')
        }
        return <div data-testid="mock-modal-body">Modal Body Content</div>
    }
})

// Mock Chakra UI components
jest.mock('@salesforce/retail-react-app/app/components/shared/ui', () => {
    const React = require('react')
    return {
        Box: ({children, ...props}) => <div {...props}>{children}</div>,
        Text: ({children, ...props}) => <span {...props}>{children}</span>,
        Modal: ({children, isOpen, onClose, closeOnEsc, closeOnOverlayClick, ...rest}) => {
            if (!isOpen) return null
            return (
                <div
                    data-testid="chakra-modal"
                    role="dialog"
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
        ModalContent: ({children, ...props}) => {
            const htmlProps = {}
            if (props['data-testid']) htmlProps['data-testid'] = props['data-testid']
            if (props['aria-labelledby']) htmlProps['aria-labelledby'] = props['aria-labelledby']
            return <div {...htmlProps}>{children}</div>
        },
        ModalCloseButton: () => (
            <button
                data-testid="modal-close-button"
                onClick={() => mockCloseQuickView()}
            >
                Close
            </button>
        ),
        ModalBody: ({children}) => <div>{children}</div>
    }
})

import QuickViewModalShell from './modal-shell'

// Fixtures
const sampleProduct = {
    id: 'prod-123',
    name: 'Test Dress',
    price: 49.99
}

const renderShell = (contextOverrides = {}) => {
    mockCloseQuickView = jest.fn()
    const contextValue = {
        isOpen: false,
        openProduct: null,
        openQuickView: jest.fn(),
        closeQuickView: mockCloseQuickView,
        ...contextOverrides
    }

    return render(
        <IntlProvider locale="en" defaultLocale="en">
            <QuickViewContext.Provider value={contextValue}>
                <QuickViewModalShell />
            </QuickViewContext.Provider>
        </IntlProvider>
    )
}

describe('QuickViewModalShell', () => {
    beforeEach(() => {
        mockBodyShouldThrow = false
        mockCloseQuickView = jest.fn()
    })

    it('UT-SHELL-001 — modal not rendered when isOpen is false', () => {
        const {container} = renderShell({isOpen: false, openProduct: sampleProduct})
        expect(container.querySelector('[data-testid="quick-view-modal"]')).toBeNull()
    })

    it('UT-SHELL-002 — modal rendered when isOpen is true', () => {
        const {getByTestId} = renderShell({isOpen: true, openProduct: sampleProduct})
        expect(getByTestId('quick-view-modal')).toBeInTheDocument()
    })

    it('UT-SHELL-003 — close button click invokes closeQuickView', () => {
        const {getByTestId} = renderShell({isOpen: true, openProduct: sampleProduct})
        fireEvent.click(getByTestId('modal-close-button'))
        expect(mockCloseQuickView).toHaveBeenCalledTimes(1)
    })

    it('UT-SHELL-004 — Escape key invokes closeQuickView', () => {
        const {getByTestId} = renderShell({isOpen: true, openProduct: sampleProduct})
        const modal = getByTestId('chakra-modal')
        fireEvent.keyDown(modal, {key: 'Escape', code: 'Escape'})
        expect(mockCloseQuickView).toHaveBeenCalledTimes(1)
    })

    it('UT-SHELL-005 — error boundary surfaces quick-view-modal-error when body throws', () => {
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

        mockBodyShouldThrow = true
        const {getByTestId, queryByTestId} = renderShell({isOpen: true, openProduct: sampleProduct})

        expect(getByTestId('quick-view-modal-error')).toBeInTheDocument()
        expect(getByTestId('quick-view-modal')).toBeInTheDocument()
        expect(queryByTestId('mock-modal-body')).toBeNull()

        consoleSpy.mockRestore()
    })
})
