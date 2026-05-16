/*
 * QuickViewContext — manages the open/close state of the Quick View modal
 * and which product is currently being previewed.
 *
 * Contract: contracts/quick-view-context.md
 */
import React, {useState, useContext, useCallback} from 'react'
import PropTypes from 'prop-types'

/**
 * @typedef {Object} QuickViewContextValue
 * @property {boolean} isOpen
 * @property {Object|null} openProduct
 * @property {(product: Object) => void} openQuickView
 * @property {() => void} closeQuickView
 */

export const QuickViewContext = React.createContext(undefined)

/**
 * Hook to consume the QuickView context.
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
 * Provider that owns Quick View UI state.
 * Mount inside _app, inside the SDK/commerce providers.
 * Renders children + the QuickViewModalShell singleton.
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
    children: PropTypes.node.isRequired
}
