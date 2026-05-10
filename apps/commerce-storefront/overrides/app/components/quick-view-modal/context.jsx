/*
 * QuickViewContext — provider + hook for Quick View modal state.
 *
 * The provider mounts the modal shell as a singleton. State is useState-only.
 * SSR-safe: initial isOpen=false, openProduct=null.
 */
import React, {createContext, useContext, useState, useCallback} from 'react'
import PropTypes from 'prop-types'
import QuickViewModalShell from './modal-shell'

export const QuickViewContext = createContext(undefined)

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
            <QuickViewModalShell />
        </QuickViewContext.Provider>
    )
}

QuickViewProvider.propTypes = {
    children: PropTypes.node
}

export const useQuickView = () => {
    const context = useContext(QuickViewContext)
    if (context === undefined) {
        throw new Error('useQuickView must be used within a QuickViewProvider')
    }
    return context
}
