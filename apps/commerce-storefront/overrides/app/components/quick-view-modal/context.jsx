/*
 * QuickViewContext — provides open/close state and the active product
 * for the Quick View modal singleton.
 *
 * Contract: contracts/quick-view-context.md
 */
import React, {createContext, useContext, useState, useCallback, useMemo} from 'react'
import PropTypes from 'prop-types'

export const QuickViewContext = createContext(undefined)

/**
 * Hook to consume the Quick View context.
 * Throws if used outside <QuickViewProvider>.
 */
export const useQuickView = () => {
    const ctx = useContext(QuickViewContext)
    if (ctx === undefined) {
        throw new Error('useQuickView must be used within a <QuickViewProvider>')
    }
    return ctx
}

/**
 * QuickViewProvider — manages Quick View open/close state.
 * Renders children + the modal shell (lazy-mounted when open).
 */
export const QuickViewProvider = ({children}) => {
    const [openProduct, setOpenProduct] = useState(null)
    const isOpen = openProduct !== null

    const openQuickView = useCallback((product) => {
        setOpenProduct(product)
    }, [])

    const closeQuickView = useCallback(() => {
        setOpenProduct(null)
    }, [])

    // Memoize the context value to prevent cascading re-renders of all
    // consumers when an unrelated parent re-render causes this provider
    // to re-render with identical state.
    const value = useMemo(
        () => ({isOpen, openProduct, openQuickView, closeQuickView}),
        [isOpen, openProduct, openQuickView, closeQuickView]
    )

    return (
        <QuickViewContext.Provider value={value}>
            {children}
        </QuickViewContext.Provider>
    )
}

QuickViewProvider.propTypes = {
    children: PropTypes.node
}
