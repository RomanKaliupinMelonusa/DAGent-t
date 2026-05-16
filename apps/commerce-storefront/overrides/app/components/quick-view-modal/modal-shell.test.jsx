/*
 * Unit tests for QuickViewModalShell
 * Binding contract: unit-tests.md §3 — Modal shell (UT-SHELL-001..005)
 */
import React from 'react'
import '@testing-library/jest-dom'
import {render, screen, fireEvent} from '@testing-library/react'
import {IntlProvider} from 'react-intl'
import {ChakraProvider} from '@salesforce/retail-react-app/app/components/shared/ui'
import theme from '@salesforce/retail-react-app/app/theme'
import {QuickViewContext} from './context'

// ---- Mocks ----

// Mock the modal body to control its behaviour in each test.
// By default it renders a simple placeholder; the error-boundary test
// overrides it to throw. Variable must be prefixed with `mock` for Jest hoisting.
let mockShouldBodyThrow = false

jest.mock('./modal-body', () => {
    const MockBody = () => {
        if (mockShouldBodyThrow) {
            throw new Error('Simulated body render failure')
        }
        return <div data-testid="mock-modal-body">Mock Body</div>
    }
    MockBody.displayName = 'MockQuickViewModalBody'
    return MockBody
})

// Mock useBreakpointValue for Chakra responsive props
jest.mock('@salesforce/retail-react-app/app/components/shared/ui', () => {
    const actual = jest.requireActual('@salesforce/retail-react-app/app/components/shared/ui')
    return {
        ...actual,
        useBreakpointValue: jest.fn(() => '5xl')
    }
})

import QuickViewModalShell from './modal-shell'

const simpleProduct = {id: 'prod-001', name: 'Test Dress'}

const mockCloseQuickView = jest.fn()

const renderShell = ({isOpen = false, openProduct = null} = {}) => {
    return render(
        <IntlProvider locale="en-GB" defaultLocale="en-GB">
            <ChakraProvider theme={theme}>
                <QuickViewContext.Provider
                    value={{
                        isOpen,
                        openProduct,
                        openQuickView: jest.fn(),
                        closeQuickView: mockCloseQuickView
                    }}
                >
                    <QuickViewModalShell />
                </QuickViewContext.Provider>
            </ChakraProvider>
        </IntlProvider>
    )
}

describe('QuickViewModalShell', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockShouldBodyThrow = false
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
        // Chakra ModalCloseButton renders a button with aria-label "Close"
        const closeBtn = screen.getByRole('button', {name: /close/i})
        fireEvent.click(closeBtn)
        expect(mockCloseQuickView).toHaveBeenCalled()
    })

    it('UT-SHELL-004 — Escape key calls closeQuickView', () => {
        renderShell({isOpen: true, openProduct: simpleProduct})
        const dialog = screen.getByRole('dialog')
        fireEvent.keyDown(dialog, {key: 'Escape', code: 'Escape'})
        expect(mockCloseQuickView).toHaveBeenCalled()
    })

    it('UT-SHELL-005 — error boundary surfaces quick-view-modal-error', () => {
        // Suppress the expected console.error from ErrorBoundary
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
        mockShouldBodyThrow = true

        renderShell({isOpen: true, openProduct: simpleProduct})

        expect(screen.getByTestId('quick-view-modal-error')).toBeInTheDocument()
        // The shell (modal container) remains mounted
        expect(screen.getByTestId('quick-view-modal')).toBeInTheDocument()

        consoleSpy.mockRestore()
    })
})
