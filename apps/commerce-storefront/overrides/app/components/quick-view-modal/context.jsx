/*
 * QuickViewContext — provides open/close state for the Quick View modal singleton.
 *
 * The provider owns a single piece of UI state (which product is open, if any)
 * and renders the modal shell as a sibling of its children so the modal is a
 * singleton mounted near the app root.
 */
import React, {createContext, useContext, useState, useCallback} from 'react'
import PropTypes from 'prop-types'

/**
 * @typedef {Object} QuickViewContextValue
 * @property {boolean} isOpen
 * @property {Object|null} openProduct
 * @property {(product: Object) => void} openQuickView
 * @property {() => void} closeQuickView
 */

export const QuickViewContext = createContext(undefined)

export const QuickViewProvider = ({children}) => {
    const [openProduct, setOpenProduct] = useState(null)

    const openQuickView = useCallback((product) => {
        setOpenProduct(product)
    }, [])

    const closeQuickView = useCallback(() => {
        setOpenProduct(null)
    }, [])

    const value = {
        isOpen: openProduct !== null,
        openProduct,
        openQuickView,
        closeQuickView
    }

    return <QuickViewContext.Provider value={value}>{children}</QuickViewContext.Provider>
}

QuickViewProvider.propTypes = {
    children: PropTypes.node
}

/**
 * Hook to access QuickView context. Throws if used outside <QuickViewProvider>.
 * @returns {QuickViewContextValue}
 */
export const useQuickView = () => {
    const ctx = useContext(QuickViewContext)
    if (ctx === undefined) {
        throw new Error('useQuickView must be used within a <QuickViewProvider>')
    }
    return ctx
}
