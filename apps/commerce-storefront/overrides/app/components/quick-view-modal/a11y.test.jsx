/*
 * Unit tests for Quick View accessibility.
 * Covers: UT-A11Y-001, UT-A11Y-002, UT-A11Y-003
 *
 * Each test uses jest.resetModules + doMock + require for isolation.
 * For UT-A11Y-002 (trigger), we use a simplified approach that avoids
 * React instance mismatch issues with jest.resetModules.
 */
import React from 'react'
import {render} from '@testing-library/react'
import '@testing-library/jest-dom'
import {IntlProvider} from 'react-intl'

// --- Static mocks for UT-A11Y-002 (trigger test) ---
// These are hoisted and used when the trigger module is first required
const mockOpenQuickViewA11y = jest.fn()
jest.mock('./context', () => ({
    useQuickView: () => ({
        openQuickView: mockOpenQuickViewA11y,
        closeQuickView: jest.fn(),
        isOpen: false,
        openProduct: null
    })
}))

jest.mock('@salesforce/retail-react-app/app/components/icons', () => ({
    VisibilityIcon: () => 'icon'
}))

jest.mock('@salesforce/retail-react-app/app/components/shared/ui', () => {
    const ReactInFactory = require('react')
    return {
        IconButton: ReactInFactory.forwardRef(function MockIconButton(props, ref) {
            const {
                icon, colorScheme, boxShadow, borderRadius,
                _hover, _groupHover, _focusVisible, ...domProps
            } = props
            return <button ref={ref} {...domProps}>{icon}</button>
        }),
        Modal: (props) => props.isOpen ? <div data-modal-props={JSON.stringify({returnFocusOnClose: props.returnFocusOnClose})}>{props.children}</div> : null,
        ModalOverlay: () => <div />,
        ModalContent: ({children, ...rest}) => <div {...rest}>{children}</div>,
        ModalCloseButton: () => <button>X</button>,
        ModalBody: ({children}) => <div>{children}</div>,
        Box: ({children, ...props}) => <div {...props}>{children}</div>,
        Text: ({children}) => <span>{children}</span>
    }
})

jest.mock('react-error-boundary', () => ({
    ErrorBoundary: ({children}) => <>{children}</>
}))

jest.mock('./modal-body', () => {
    return function MockBody() {
        return <h2 id="quick-view-modal-title">Mock Product</h2>
    }
})

import QuickViewTrigger from './trigger'
import QuickViewModalShell from './modal-shell'

describe('Quick View Accessibility', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('UT-A11Y-001 — modal element has aria-labelledby pointing at quick-view-modal-title', () => {
        // Override the context mock for this test to have isOpen=true
        const useQuickView = require('./context').useQuickView
        const originalImpl = useQuickView

        // We can't easily override a jest.mock per test, so we test via the shell.
        // The shell sets aria-labelledby="quick-view-modal-title" on ModalContent.
        // Since the static mock has isOpen=false, we need to re-mock. 
        // Instead, let's read the source and verify the attribute is set in the render.
        
        // Use jest.spyOn on the mocked module to override return value for this test
        const contextModule = require('./context')
        const spy = jest.spyOn(contextModule, 'useQuickView').mockReturnValue({
            isOpen: true,
            openProduct: {id: 'prod-1', name: 'Dress'},
            closeQuickView: jest.fn(),
            openQuickView: jest.fn()
        })

        const {getByTestId} = render(
            <IntlProvider locale="en-US" messages={{}}>
                <QuickViewModalShell />
            </IntlProvider>
        )

        const modalContent = getByTestId('quick-view-modal')
        expect(modalContent).toHaveAttribute('aria-labelledby', 'quick-view-modal-title')

        spy.mockRestore()
    })

    it('UT-A11Y-002 — trigger element has aria-haspopup="dialog"', () => {
        const product = {id: 'prod-a11y', name: 'A11y Dress', type: {}}

        const {getByTestId} = render(
            <IntlProvider locale="en-US" messages={{}}>
                <QuickViewTrigger product={product} />
            </IntlProvider>
        )

        const trigger = getByTestId('quick-view-trigger-prod-a11y')
        expect(trigger).toHaveAttribute('aria-haspopup', 'dialog')
    })

    it('UT-A11Y-003 — focus restored to trigger on close (returnFocusOnClose is enabled)', () => {
        // Override context to have isOpen=true for this test
        const contextModule = require('./context')
        const spy = jest.spyOn(contextModule, 'useQuickView').mockReturnValue({
            isOpen: true,
            openProduct: {id: 'prod-focus', name: 'Focus Dress'},
            closeQuickView: jest.fn(),
            openQuickView: jest.fn()
        })

        const {container} = render(
            <IntlProvider locale="en-US" messages={{}}>
                <QuickViewModalShell />
            </IntlProvider>
        )

        // The Modal mock renders data-modal-props with returnFocusOnClose value
        const modalEl = container.querySelector('[data-modal-props]')
        const modalProps = JSON.parse(modalEl.getAttribute('data-modal-props'))
        // Chakra Modal returnFocusOnClose: the implementation sets it (or relies on default true)
        expect(modalProps.returnFocusOnClose).not.toBe(false)

        spy.mockRestore()
    })
})
