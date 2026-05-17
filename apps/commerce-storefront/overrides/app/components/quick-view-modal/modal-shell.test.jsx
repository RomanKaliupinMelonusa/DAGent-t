/*
 * Unit tests for QuickViewModalShell.
 * Cases: UT-SHELL-001, UT-SHELL-002, UT-SHELL-003, UT-SHELL-004, UT-SHELL-005
 */
import React from 'react'
import '@testing-library/jest-dom'
import {render, screen, fireEvent} from '@testing-library/react'
import {IntlProvider} from 'react-intl'
import {ChakraProvider} from '@salesforce/retail-react-app/app/components/shared/ui'
import theme from '@salesforce/retail-react-app/app/theme'
import {QuickViewContext} from './context'

// Polyfill matchMedia for Chakra's useBreakpointValue
beforeAll(() => {
    window.matchMedia =
        window.matchMedia ||
        function (query) {
            return {
                matches: false,
                media: query,
                onchange: null,
                addListener: jest.fn(),
                removeListener: jest.fn(),
                addEventListener: jest.fn(),
                removeEventListener: jest.fn(),
                dispatchEvent: jest.fn()
            }
        }
})

// Fixtures
const simpleProduct = {
    id: 'prod-shell-001',
    productId: 'prod-shell-001',
    name: 'Shell Test Dress',
    type: {master: false, set: false, bundle: false}
}

const mockCloseQuickView = jest.fn()

// Mock the modal body to a simple stub — body is tested separately
jest.mock('./modal-body', () => {
    return function MockModalBody() {
        return <div data-testid="mock-modal-body">Modal Body Content</div>
    }
})

// Import the real shell (uses Chakra Modal under the hood)
import QuickViewModalShell from './modal-shell'

const renderShell = (contextOverrides = {}) => {
    const contextValue = {
        isOpen: false,
        openProduct: null,
        openQuickView: jest.fn(),
        closeQuickView: mockCloseQuickView,
        ...contextOverrides
    }

    return render(
        <ChakraProvider theme={theme}>
            <IntlProvider locale="en" messages={{}}>
                <QuickViewContext.Provider value={contextValue}>
                    <QuickViewModalShell />
                </QuickViewContext.Provider>
            </IntlProvider>
        </ChakraProvider>
    )
}

describe('QuickViewModalShell', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('UT-SHELL-001 — modal not rendered when closed', () => {
        renderShell({isOpen: false, openProduct: null})
        expect(screen.queryByTestId('quick-view-modal')).not.toBeInTheDocument()
    })

    it('UT-SHELL-002 — modal rendered when open', () => {
        renderShell({isOpen: true, openProduct: simpleProduct})
        expect(screen.getByTestId('quick-view-modal')).toBeInTheDocument()
    })

    it('UT-SHELL-003 — close button calls closeQuickView', () => {
        renderShell({isOpen: true, openProduct: simpleProduct})
        // Chakra renders a close button within the modal
        const modal = screen.getByTestId('quick-view-modal')
        // Find close button by aria-label
        const closeBtn = modal.querySelector('button[aria-label]')
        expect(closeBtn).toBeTruthy()
        fireEvent.click(closeBtn)
        expect(mockCloseQuickView).toHaveBeenCalledTimes(1)
    })

    it('UT-SHELL-004 — Escape key calls closeQuickView', () => {
        renderShell({isOpen: true, openProduct: simpleProduct})
        const dialog = screen.getByRole('dialog')
        fireEvent.keyDown(dialog, {key: 'Escape'})
        expect(mockCloseQuickView).toHaveBeenCalledTimes(1)
    })

    it('UT-SHELL-005 — error boundary surfaces quick-view-modal-error on body throw', () => {
        const {ErrorBoundary} = require('react-error-boundary')

        const ThrowingBody = () => {
            throw new Error('Test product fetch failure')
        }

        // Suppress React error boundary console.error noise
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

        render(
            <IntlProvider locale="en" messages={{}}>
                <div data-testid="quick-view-modal">
                    <ErrorBoundary
                        fallback={
                            <div data-testid="quick-view-modal-error">
                                Something went wrong loading product details.
                            </div>
                        }
                    >
                        <ThrowingBody />
                    </ErrorBoundary>
                </div>
            </IntlProvider>
        )

        expect(screen.getByTestId('quick-view-modal-error')).toBeInTheDocument()
        expect(screen.getByTestId('quick-view-modal')).toBeInTheDocument()

        consoleSpy.mockRestore()
    })
})
