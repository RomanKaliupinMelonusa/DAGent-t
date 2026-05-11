/*
 * Unit tests for QuickViewModalShell.
 *
 * Cases: UT-SHELL-001 through UT-SHELL-005
 * Contract: contracts/quick-view-modal.md §A
 */
import React from 'react'
import {render, screen, fireEvent} from '@testing-library/react'
import '@testing-library/jest-dom/extend-expect'
import {IntlProvider} from 'react-intl'
import {ChakraProvider} from '@salesforce/retail-react-app/app/components/shared/ui'
import theme from '@salesforce/retail-react-app/app/theme'
import {QuickViewContext} from './context'

// ── Mocks ───────────────────────────────────────────────────────────────────

// Variable prefixed with `mock` to satisfy Jest's scoping rules.
let mockShouldBodyThrow = false

jest.mock('./modal-body', () => {
    const MockBody = () => {
        if (mockShouldBodyThrow) {
            throw new Error('Simulated body render error')
        }
        return <div data-testid="mock-modal-body">Modal Body Content</div>
    }
    return {__esModule: true, default: MockBody}
})

// ── Fixtures ────────────────────────────────────────────────────────────────
const simpleProduct = {
    id: 'prod-simple-001',
    productId: 'prod-simple-001',
    name: 'Simple Dress',
    price: 49.99,
    type: {set: false, bundle: false}
}

// ── Helpers ─────────────────────────────────────────────────────────────────
const QuickViewModalShell = require('./modal-shell').default

const renderShell = (ctxValue) => {
    return render(
        <ChakraProvider theme={theme}>
            <IntlProvider locale="en" defaultLocale="en" messages={{}}>
                <QuickViewContext.Provider value={ctxValue}>
                    <QuickViewModalShell />
                </QuickViewContext.Provider>
            </IntlProvider>
        </ChakraProvider>
    )
}

beforeEach(() => {
    jest.clearAllMocks()
    mockShouldBodyThrow = false
})

describe('QuickViewModalShell', () => {
    it('UT-SHELL-001 — modal not rendered when closed', () => {
        renderShell({
            isOpen: false,
            openProduct: null,
            openQuickView: jest.fn(),
            closeQuickView: jest.fn()
        })
        expect(screen.queryByTestId('quick-view-modal')).not.toBeInTheDocument()
    })

    it('UT-SHELL-002 — modal rendered when open', () => {
        renderShell({
            isOpen: true,
            openProduct: simpleProduct,
            openQuickView: jest.fn(),
            closeQuickView: jest.fn()
        })
        expect(screen.getByTestId('quick-view-modal')).toBeInTheDocument()
    })

    it('UT-SHELL-003 — close button calls closeQuickView', () => {
        const closeQuickView = jest.fn()
        renderShell({
            isOpen: true,
            openProduct: simpleProduct,
            openQuickView: jest.fn(),
            closeQuickView
        })

        const closeBtn = screen.getByLabelText('Close')
        fireEvent.click(closeBtn)
        expect(closeQuickView).toHaveBeenCalledTimes(1)
    })

    it('UT-SHELL-004 — Escape key calls closeQuickView', () => {
        const closeQuickView = jest.fn()
        renderShell({
            isOpen: true,
            openProduct: simpleProduct,
            openQuickView: jest.fn(),
            closeQuickView
        })

        // Chakra Modal attaches the keyDown handler on the modal content element
        const modalContent = screen.getByTestId('quick-view-modal')
        fireEvent.keyDown(modalContent, {key: 'Escape', code: 'Escape'})
        expect(closeQuickView).toHaveBeenCalledTimes(1)
    })

    it('UT-SHELL-005 — error boundary surfaces quick-view-modal-error on body throw', () => {
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

        mockShouldBodyThrow = true
        renderShell({
            isOpen: true,
            openProduct: simpleProduct,
            openQuickView: jest.fn(),
            closeQuickView: jest.fn()
        })

        expect(screen.getByTestId('quick-view-modal-error')).toBeInTheDocument()
        expect(screen.getByTestId('quick-view-modal')).toBeInTheDocument()

        consoleSpy.mockRestore()
    })
})
