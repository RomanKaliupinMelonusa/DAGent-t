/*
 * QuickViewContext — manages the open/close state and the currently‐viewed
 * product for the Quick View modal singleton.
 *
 * Matches the contract in contracts/quick-view-context.md.
 */
import React, {useState, useContext, useCallback} from 'react'
import PropTypes from 'prop-types'

/**
 * @typedef {Object} QuickViewContextValue
 * @property {boolean}          isOpen
 * @property {object|null}      openProduct
 * @property {(product) => void} openQuickView
 * @property {() => void}       closeQuickView
 */

export const QuickViewContext = React.createContext(null)

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

    return (
        <QuickViewContext.Provider value={value}>
            {children}
        </QuickViewContext.Provider>
    )
}

QuickViewProvider.propTypes = {
    children: PropTypes.node.isRequired
}
