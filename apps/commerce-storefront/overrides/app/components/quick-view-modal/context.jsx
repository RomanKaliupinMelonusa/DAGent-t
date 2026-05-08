/*
 * QuickViewContext — provides open/close state for the Quick View modal singleton.
 */
import React, {createContext, useContext, useState, useCallback} from 'react'
import PropTypes from 'prop-types'

export const QuickViewContext = createContext(undefined)

export const useQuickView = () => {
    const ctx = useContext(QuickViewContext)
    if (ctx === undefined) {
        throw new Error('useQuickView must be used within a QuickViewProvider')
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
