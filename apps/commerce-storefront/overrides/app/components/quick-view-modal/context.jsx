/*
 * QuickViewContext — provider + hook for Quick View modal state.
 *
 * Exposes: QuickViewContext, QuickViewProvider, useQuickView
 * See contracts/quick-view-context.md for the binding API surface.
 */
import React, {useState, useCallback, useContext} from 'react'
import PropTypes from 'prop-types'

export const QuickViewContext = React.createContext(undefined)

/**
 * Provider for Quick View modal state. Mounts the modal shell as a
 * singleton inside the provider so it lives next to its state.
 *
 * Must be placed inside the commerce SDK providers so hooks used by
 * the modal body (useShopperBasketsMutation, useCurrentBasket, etc.)
 * have access to the required context.
 */
export const QuickViewProvider = ({children}) => {
    const [isOpen, setIsOpen] = useState(false)
    const [openProduct, setOpenProduct] = useState(null)

    const openQuickView = useCallback((product) => {
        setOpenProduct(product)
        setIsOpen(true)
    }, [])

    const closeQuickView = useCallback(() => {
        setIsOpen(false)
        setOpenProduct(null)
    }, [])

    const value = {
        isOpen,
        openProduct,
        openQuickView,
        closeQuickView
    }

    return (
        <QuickViewContext.Provider value={value}>
            {children}
        </QuickViewContext.Provider>
    )
}

QuickViewProvider.propTypes = {
    children: PropTypes.node.isRequired
}

/**
 * Hook to access Quick View context. Throws if used outside QuickViewProvider.
 */
export const useQuickView = () => {
    const context = useContext(QuickViewContext)
    if (context === undefined) {
        throw new Error('useQuickView must be used within a QuickViewProvider')
    }
    return context
}
