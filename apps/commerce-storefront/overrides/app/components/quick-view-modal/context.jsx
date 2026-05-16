/*
 * Quick View Context & Provider
 *
 * Manages the open/close state and the currently-selected product for the
 * Quick View modal singleton. See contracts/quick-view-context.md.
 */
import React, {useState, useContext, useCallback} from 'react'
import PropTypes from 'prop-types'

export const QuickViewContext = React.createContext(undefined)

/**
 * Hook to consume the Quick View context.
 * Throws if used outside of <QuickViewProvider>.
 */
export const useQuickView = () => {
    const ctx = useContext(QuickViewContext)
    if (ctx === undefined) {
        throw new Error('useQuickView must be used within a <QuickViewProvider>')
    }
    return ctx
}

/**
 * Provider that holds Quick View open/close state + the product being previewed.
 * Mounts the QuickViewModalShell as a singleton child.
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

    const value = {isOpen, openProduct, openQuickView, closeQuickView}

    return (
        <QuickViewContext.Provider value={value}>
            {children}
        </QuickViewContext.Provider>
    )
}

QuickViewProvider.propTypes = {
    children: PropTypes.node
}
