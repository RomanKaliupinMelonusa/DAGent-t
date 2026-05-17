/*
 * Quick View Context & Provider
 *
 * Provides open/close state for the Quick View modal singleton.
 * See contracts/quick-view-context.md for the binding surface.
 */
import React, {useState, useCallback, createContext, useContext} from 'react'
import PropTypes from 'prop-types'

export const QuickViewContext = createContext(null)

export const useQuickView = () => {
    const ctx = useContext(QuickViewContext)
    if (!ctx) {
        throw new Error(
            'useQuickView must be used within a <QuickViewProvider>. ' +
                'Wrap your component tree with <QuickViewProvider>.'
        )
    }
    return ctx
}

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
