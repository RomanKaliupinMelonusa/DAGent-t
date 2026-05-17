/*
 * Quick View Context & Provider
 *
 * Manages the open/closed state of the Quick View modal and which product is
 * currently being previewed. The provider also mounts the singleton
 * QuickViewModalShell so only one instance exists in the tree.
 *
 * See: contracts/quick-view-context.md
 */
import React, {createContext, useContext, useState, useCallback} from 'react'
import PropTypes from 'prop-types'

export const QuickViewContext = createContext(undefined)

/**
 * QuickViewProvider — wraps the app tree to provide Quick View state.
 * Mounts QuickViewModalShell as a singleton inside the provider.
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
            {/* QuickViewModalShell is lazy-imported to avoid circular deps.
                It is rendered here so it sits inside all commerce providers. */}
        </QuickViewContext.Provider>
    )
}

QuickViewProvider.propTypes = {
    children: PropTypes.node
}

/**
 * useQuickView — reads the Quick View context. Throws if used outside the provider.
 */
export const useQuickView = () => {
    const ctx = useContext(QuickViewContext)
    if (ctx === undefined) {
        throw new Error('useQuickView must be used within a <QuickViewProvider>')
    }
    return ctx
}
