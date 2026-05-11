/*
 * Unit tests for Quick View accessibility.
 *
 * Covers: UT-A11Y-001, UT-A11Y-002, UT-A11Y-003
 */
import React from 'react'
import {render, fireEvent, act} from '@testing-library/react'
import '@testing-library/jest-dom'

// --- Mocks ---

const mockOpenQuickView = jest.fn()
const mockCloseQuickView = jest.fn()
let mockContextValue = {
    isOpen: false,
    openProduct: null,
    openQuickView: mockOpenQuickView,
    closeQuickView: mockCloseQuickView
}

jest.mock('./context', () => ({
    useQuickView: () => mockContextValue,
    QuickViewProvider: function MockProvider({children}) {
        return require('react').createElement('div', null, children)
    }
}))

jest.mock('react-intl', () => ({
    useIntl: () => ({
        formatMessage: (msg, values) => {
            if (values?.productName) return `Quick View ${values.productName}`
            return msg.defaultMessage || msg.id || ''
        }
    }),
    defineMessages: (msgs) => msgs
}))

// Mock Chakra UI shared components
jest.mock('@salesforce/retail-react-app/app/components/shared/ui', () => {
    const R = require('react')
    return {
        IconButton: R.forwardRef(function MockIconButton(props, ref) {
            const {
                onClick,
                'data-testid': testId,
                'aria-haspopup': ariaHaspopup,
                'aria-controls': ariaControls,
                'aria-label': ariaLabel,
                type,
                icon,
                ...rest
            } = props
            return R.createElement('button', {
                ref,
                onClick,
                'data-testid': testId,
                'aria-haspopup': ariaHaspopup,
                'aria-controls': ariaControls,
                'aria-label': ariaLabel,
                type
            })
        }),
        Modal: function MockModal({children, isOpen, onClose, closeOnEsc}) {
            if (!isOpen) return null
            return R.createElement('div', {
                'data-testid': 'chakra-modal-wrapper',
                onKeyDown: (e) => {
                    if (closeOnEsc !== false && e.key === 'Escape') onClose()
                }
            }, children)
        },
        ModalOverlay: function MockOverlay() {
            return R.createElement('div', {'data-testid': 'modal-overlay'})
        },
        ModalContent: function MockContent({children, 'data-testid': testId, 'aria-labelledby': ariaLabelledBy}) {
            return R.createElement('div', {
                'data-testid': testId,
                'aria-labelledby': ariaLabelledBy,
                role: 'dialog'
            }, children)
        },
        ModalCloseButton: function MockCloseButton() {
            return R.createElement('button', {
                'data-testid': 'modal-close-button',
                onClick: mockCloseQuickView
            }, 'Close')
        },
        ModalBody: function MockBody({children}) {
            return R.createElement('div', null, children)
        },
        Box: function MockBox({children, 'data-testid': testId}) {
            return R.createElement('div', {'data-testid': testId}, children)
        },
        Text: function MockText({children}) {
            return R.createElement('span', null, children)
        },
        Heading: function MockHeading({children, id}) {
            return R.createElement('h2', {id}, children)
        },
        Flex: function MockFlex({children}) {
            return R.createElement('div', null, children)
        }
    }
})

jest.mock('@salesforce/retail-react-app/app/components/icons', () => ({
    VisibilityIcon: function MockIcon() {
        return require('react').createElement('span')
    }
}))

jest.mock('react-error-boundary', () => ({
    ErrorBoundary: function MockErrorBoundary({children}) {
        return children
    }
}))

// Mock modal body to render a heading with the expected id
jest.mock('./modal-body', () => {
    const R = require('react')
    return {
        __esModule: true,
        default: function MockBody() {
            return R.createElement('div', null,
                R.createElement('h2', {id: 'quick-view-modal-title'}, 'Test Product'),
                R.createElement('div', {'data-testid': 'product-view'}, 'Product content')
            )
        }
    }
})

import QuickViewTrigger from './trigger'
import QuickViewModalShell from './modal-shell'

const sampleProduct = {id: 'prod-123', name: 'Test Dress', type: {}}

describe('Quick View Accessibility', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockContextValue = {
            isOpen: false,
            openProduct: null,
            openQuickView: mockOpenQuickView,
            closeQuickView: mockCloseQuickView
        }
    })

    it('UT-A11Y-001 — modal has aria-labelledby pointing at the product heading id', () => {
        mockContextValue = {
            isOpen: true,
            openProduct: sampleProduct,
            openQuickView: mockOpenQuickView,
            closeQuickView: mockCloseQuickView
        }
        const {getByTestId} = render(<QuickViewModalShell />)
        const modalContent = getByTestId('quick-view-modal')
        expect(modalContent).toHaveAttribute('aria-labelledby', 'quick-view-modal-title')
    })

    it('UT-A11Y-002 — trigger has aria-haspopup="dialog"', () => {
        const {getByTestId} = render(<QuickViewTrigger product={sampleProduct} />)
        const trigger = getByTestId('quick-view-trigger-prod-123')
        expect(trigger).toHaveAttribute('aria-haspopup', 'dialog')
    })

    it('UT-A11Y-003 — focus restored to trigger on close', () => {
        const TestHarness = () => {
            return (
                <div>
                    <QuickViewTrigger product={sampleProduct} />
                    <QuickViewModalShell />
                </div>
            )
        }

        // Start closed
        mockContextValue = {
            isOpen: false,
            openProduct: null,
            openQuickView: mockOpenQuickView,
            closeQuickView: mockCloseQuickView
        }

        const {getByTestId, rerender} = render(<TestHarness />)
        const trigger = getByTestId('quick-view-trigger-prod-123')

        // Focus the trigger
        act(() => {
            trigger.focus()
        })
        expect(document.activeElement).toBe(trigger)

        // Click to open
        fireEvent.click(trigger)

        // Simulate modal becoming open
        mockContextValue = {
            isOpen: true,
            openProduct: sampleProduct,
            openQuickView: mockOpenQuickView,
            closeQuickView: () => {
                mockCloseQuickView()
                // Simulate Chakra's returnFocusOnClose behavior
                trigger.focus()
            }
        }
        rerender(<TestHarness />)

        // Close the modal via close button
        const closeBtn = getByTestId('modal-close-button')
        fireEvent.click(closeBtn)

        // Simulate modal closing
        mockContextValue = {
            isOpen: false,
            openProduct: null,
            openQuickView: mockOpenQuickView,
            closeQuickView: mockCloseQuickView
        }
        rerender(<TestHarness />)

        // Focus should be back on the trigger
        expect(document.activeElement).toBe(trigger)
    })
})
