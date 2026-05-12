/*
 * QuickViewContext — provides open/close state for the Quick View modal singleton.
 *
 * Contract: contracts/quick-view-context.md
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

export const QuickViewContext = createContext(null)

export const useQuickView = () => {
    const ctx = useContext(QuickViewContext)
    if (!ctx) {
        throw new Error('useQuickView must be used within a <QuickViewProvider>')
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

    const value = {isOpen, openProduct, openQuickView, closeQuickView}

    return <QuickViewContext.Provider value={value}>{children}</QuickViewContext.Provider>
}

QuickViewProvider.propTypes = {
    children: PropTypes.node.isRequired
}
