/*
 * Unit tests for QuickViewModal component.
 */
import React from 'react'
import {render, screen, fireEvent} from '@testing-library/react'
import {IntlProvider} from 'react-intl'
import {ChakraProvider} from '@salesforce/retail-react-app/app/components/shared/ui'
import {MemoryRouter} from 'react-router-dom'
import QuickViewModal from './index'

// Mock useProductViewModal hook
jest.mock('@salesforce/retail-react-app/app/hooks/use-product-view-modal', () => ({
    useProductViewModal: jest.fn()
}))

// Mock ProductView as a simple stub (deep dependency chains)
jest.mock('@salesforce/retail-react-app/app/components/product-view', () => {
    const React = require('react')
    return {
        __esModule: true,
        default: (props) =>
            React.createElement('div', {'data-testid': 'product-view'}, 'ProductView')
    }
})

const {useProductViewModal} = require('@salesforce/retail-react-app/app/hooks/use-product-view-modal')

const mockProduct = {
    productId: 'test-product-123',
    productName: 'Test Shoes',
    name: 'Test Shoes'
}

const renderModal = (props = {}) => {
    const defaultProps = {
        product: mockProduct,
        isOpen: true,
        onClose: jest.fn(),
        ...props
    }

    return render(
        <ChakraProvider>
            <IntlProvider locale="en" defaultLocale="en" messages={{}}>
                <MemoryRouter>
                    <QuickViewModal {...defaultProps} />
                </MemoryRouter>
            </IntlProvider>
        </ChakraProvider>
    )
}

beforeEach(() => {
    jest.clearAllMocks()
})

describe('QuickViewModal', () => {
    test('renders loading spinner when product is fetching', () => {
        useProductViewModal.mockReturnValue({product: null, isFetching: true})
        renderModal()
        expect(screen.getByTestId('quick-view-spinner')).toBeTruthy()
        expect(screen.queryByTestId('product-view')).toBeNull()
    })

    test('renders ProductView when product is loaded', () => {
        useProductViewModal.mockReturnValue({
            product: {id: 'test-product-123', name: 'Test Shoes'},
            isFetching: false
        })
        renderModal()
        expect(screen.getByTestId('product-view')).toBeTruthy()
        expect(screen.queryByTestId('quick-view-spinner')).toBeNull()
    })

    test('modal has correct data-testid', () => {
        useProductViewModal.mockReturnValue({product: mockProduct, isFetching: false})
        renderModal()
        expect(screen.getByTestId('quick-view-modal')).toBeTruthy()
    })

    test('modal has accessible aria-label containing product name', () => {
        useProductViewModal.mockReturnValue({
            product: {id: 'test-product-123', name: 'Test Shoes'},
            isFetching: false
        })
        renderModal()
        const modal = screen.getByTestId('quick-view-modal')
        expect(modal.getAttribute('aria-label')).toContain('Test Shoes')
    })

    test('does not render modal content when closed', () => {
        useProductViewModal.mockReturnValue({product: null, isFetching: false})
        renderModal({isOpen: false})
        expect(screen.queryByTestId('quick-view-modal')).toBeNull()
    })

    test('calls onClose when close button clicked', () => {
        const onClose = jest.fn()
        useProductViewModal.mockReturnValue({
            product: {id: 'test-product-123', name: 'Test Shoes'},
            isFetching: false
        })
        renderModal({onClose})
        // Chakra ModalCloseButton renders a button with aria-label "Close"
        const closeBtn = screen.getByLabelText('Close')
        fireEvent.click(closeBtn)
        expect(onClose).toHaveBeenCalledTimes(1)
    })
})
