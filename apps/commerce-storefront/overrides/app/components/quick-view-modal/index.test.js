/*
 * Copyright (c) 2024, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import React from 'react'
import {render, screen, fireEvent} from '@testing-library/react'
import {IntlProvider} from 'react-intl'
import {MemoryRouter} from 'react-router-dom'
import {ChakraProvider} from '@salesforce/retail-react-app/app/components/shared/ui'
import QuickViewModal from './index'

// ─── Mocks ───────────────────────────────────────────────────────────────

const mockUseProductViewModal = jest.fn()

jest.mock('@salesforce/retail-react-app/app/hooks/use-product-view-modal', () => ({
    useProductViewModal: (...args) => mockUseProductViewModal(...args)
}))

// Stub ProductView — it has deep dependency chains that are irrelevant for modal tests
jest.mock('@salesforce/retail-react-app/app/components/product-view', () => {
    const React = require('react')
    return {
        __esModule: true,
        default: (props) =>
            React.createElement('div', {'data-testid': 'product-view'}, 'ProductView')
    }
})

// ─── Helpers ─────────────────────────────────────────────────────────────

const mockProduct = {
    productId: 'test-product-1',
    productName: 'Test Shoes',
    name: 'Test Shoes',
    price: 99.99,
    currency: 'USD'
}

/**
 * Wraps the component under test with required providers.
 */
const renderModal = (props = {}) => {
    const defaults = {
        product: mockProduct,
        isOpen: true,
        onClose: jest.fn()
    }
    const merged = {...defaults, ...props}

    return render(
        <ChakraProvider>
            <IntlProvider locale="en-US" messages={{}}>
                <MemoryRouter>
                    <QuickViewModal {...merged} />
                </MemoryRouter>
            </IntlProvider>
        </ChakraProvider>
    )
}

// ─── Tests ───────────────────────────────────────────────────────────────

beforeEach(() => {
    jest.clearAllMocks()
})

describe('QuickViewModal', () => {
    test('renders loading spinner when product is fetching', () => {
        mockUseProductViewModal.mockReturnValue({product: null, isFetching: true})

        renderModal()

        expect(screen.getByTestId('quick-view-spinner')).toBeTruthy()
        expect(screen.queryByTestId('product-view')).toBeNull()
    })

    test('renders ProductView when product is loaded', () => {
        mockUseProductViewModal.mockReturnValue({product: mockProduct, isFetching: false})

        renderModal()

        expect(screen.getByTestId('product-view')).toBeTruthy()
        expect(screen.queryByTestId('quick-view-spinner')).toBeNull()
    })

    test('modal has correct data-testid', () => {
        mockUseProductViewModal.mockReturnValue({product: mockProduct, isFetching: false})

        renderModal()

        expect(screen.getByTestId('quick-view-modal')).toBeTruthy()
    })

    test('modal has accessible aria-label with product name', () => {
        mockUseProductViewModal.mockReturnValue({
            product: {...mockProduct, name: 'Test Shoes'},
            isFetching: false
        })

        renderModal()

        const modal = screen.getByTestId('quick-view-modal')
        const ariaLabel = modal.getAttribute('aria-label')
        expect(ariaLabel).toContain('Test Shoes')
    })

    test('does not render modal content when closed', () => {
        mockUseProductViewModal.mockReturnValue({product: mockProduct, isFetching: false})

        renderModal({isOpen: false})

        expect(screen.queryByTestId('quick-view-modal')).toBeNull()
    })

    test('calls onClose when close button is clicked', () => {
        mockUseProductViewModal.mockReturnValue({product: mockProduct, isFetching: false})
        const onClose = jest.fn()

        renderModal({onClose})

        // Chakra ModalCloseButton renders a button with aria-label "Close"
        const closeBtn = screen.getByLabelText('Close')
        fireEvent.click(closeBtn)

        expect(onClose).toHaveBeenCalledTimes(1)
    })

    test('renders unavailable message when product fetch returns null', () => {
        mockUseProductViewModal.mockReturnValue({product: null, isFetching: false})

        renderModal()

        expect(screen.getByText(/no longer available/i)).toBeTruthy()
        expect(screen.queryByTestId('product-view')).toBeNull()
        expect(screen.queryByTestId('quick-view-spinner')).toBeNull()
    })
})
