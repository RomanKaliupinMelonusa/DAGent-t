/*
 * QuickViewContext — provider and hook for Quick View modal state.
 *
 * Provides open/close state and the currently-previewed product to the
 * trigger, modal shell, and modal body.
 *
 * Contract: contracts/quick-view-context.md
 */
import React, {useState, useCallback, useContext} from 'react'
import PropTypes from 'prop-types'

const QuickViewContext = React.createContext(undefined)

/**
 * Hook to consume Quick View context.
 * Throws if used outside <QuickViewProvider>.
 */
const useQuickView = () => {
    const ctx = useContext(QuickViewContext)
    if (ctx === undefined) {
        throw new Error('useQuickView must be used within a <QuickViewProvider>')
    }
    return ctx
}

/**
 * Provider that manages Quick View open/close state.
 * Mounts the QuickViewModalShell as a singleton child.
 */
const QuickViewProvider = ({children}) => {
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

export {QuickViewContext, QuickViewProvider, useQuickView}
