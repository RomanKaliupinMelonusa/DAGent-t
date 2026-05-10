/*
 * Unit tests for QuickView Modal Shell
 * Test cases: UT-SHELL-001 through UT-SHELL-005
 */
import React from 'react'
import '@testing-library/jest-dom'
import {render, screen, fireEvent} from '@testing-library/react'
import {IntlProvider} from 'react-intl'
import {ChakraProvider} from '@chakra-ui/react'
import QuickViewModalShell from './modal-shell'
import {useQuickView} from './context'

// Mock context
jest.mock('./context', () => ({
    useQuickView: jest.fn()
}))

// Mock modal body — replaced with a controllable stub
const BODY_SHOULD_THROW = {current: false}
jest.mock('./modal-body', () => {
    const React = require('react')
    return {
        __esModule: true,
        default: function MockModalBody() {
            if (BODY_SHOULD_THROW.current) {
                throw new Error('Simulated body render error')
            }
            return <div data-testid="mock-modal-body">Modal Body Content</div>
        }
    }
})

// --- Fixtures ---
const openProduct = {
    id: 'prod-001',
    name: 'Classic Dress',
    type: {}
}

// --- Helpers ---
const mockCloseQuickView = jest.fn()

const Wrapper = ({children}) => (
    <IntlProvider locale="en-US" defaultLocale="en-US" messages={{}}>
        <ChakraProvider>{children}</ChakraProvider>
    </IntlProvider>
)

beforeEach(() => {
    jest.clearAllMocks()
    BODY_SHOULD_THROW.current = false
    // Suppress console.error from ErrorBoundary — it's expected in UT-SHELL-005
    jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
    // eslint-disable-next-line no-console
    console.error.mockRestore?.()
})

describe('QuickView Modal Shell', () => {
    it('UT-SHELL-001 — modal not rendered when closed', () => {
        useQuickView.mockReturnValue({
            isOpen: false,
            openProduct: null,
            closeQuickView: mockCloseQuickView
        })
        render(
            <Wrapper>
                <QuickViewModalShell />
            </Wrapper>
        )
        expect(screen.queryByTestId('quick-view-modal')).not.toBeInTheDocument()
    })

    it('UT-SHELL-002 — modal rendered when open', () => {
        useQuickView.mockReturnValue({
            isOpen: true,
            openProduct,
            closeQuickView: mockCloseQuickView
        })
        render(
            <Wrapper>
                <QuickViewModalShell />
            </Wrapper>
        )
        expect(screen.getByTestId('quick-view-modal')).toBeInTheDocument()
    })

    it('UT-SHELL-003 — close button calls closeQuickView', () => {
        useQuickView.mockReturnValue({
            isOpen: true,
            openProduct,
            closeQuickView: mockCloseQuickView
        })
        render(
            <Wrapper>
                <QuickViewModalShell />
            </Wrapper>
        )
        // Chakra ModalCloseButton renders with class "chakra-modal__close-btn".
        // The implementation passes aria-label={undefined} which removes the default
        // "Close" accessible name, so we locate by CSS class.
        const closeBtn = document.querySelector('.chakra-modal__close-btn')
        expect(closeBtn).toBeTruthy()
        fireEvent.click(closeBtn)
        expect(mockCloseQuickView).toHaveBeenCalled()
    })

    it('UT-SHELL-004 — Escape key calls closeQuickView', () => {
        useQuickView.mockReturnValue({
            isOpen: true,
            openProduct,
            closeQuickView: mockCloseQuickView
        })
        render(
            <Wrapper>
                <QuickViewModalShell />
            </Wrapper>
        )
        fireEvent.keyDown(screen.getByTestId('quick-view-modal'), {key: 'Escape'})
        expect(mockCloseQuickView).toHaveBeenCalled()
    })

    it('UT-SHELL-005 — error boundary surfaces quick-view-modal-error', () => {
        useQuickView.mockReturnValue({
            isOpen: true,
            openProduct,
            closeQuickView: mockCloseQuickView
        })
        BODY_SHOULD_THROW.current = true
        render(
            <Wrapper>
                <QuickViewModalShell />
            </Wrapper>
        )
        // The error fallback element should be visible
        expect(screen.getByTestId('quick-view-modal-error')).toBeInTheDocument()
        // The modal shell itself should still be mounted
        expect(screen.getByTestId('quick-view-modal')).toBeInTheDocument()
    })
})
