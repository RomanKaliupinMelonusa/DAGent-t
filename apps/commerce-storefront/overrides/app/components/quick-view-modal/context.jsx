/*
 * QuickViewContext — provides open/close state for the Quick View modal singleton.
 *
 * See contracts/quick-view-context.md for the binding surface.
 */
import React, {useState, useContext, useCallback} from 'react'
import PropTypes from 'prop-types'

const QuickViewContext = React.createContext(undefined)

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
    children: PropTypes.node
}

const useQuickView = () => {
    const context = useContext(QuickViewContext)
    if (context === undefined) {
        throw new Error('useQuickView must be used within a QuickViewProvider')
    }
    return context
}

export {QuickViewContext, QuickViewProvider, useQuickView}
