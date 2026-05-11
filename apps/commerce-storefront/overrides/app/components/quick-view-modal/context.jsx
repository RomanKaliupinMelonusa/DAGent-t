/*
 * QuickViewContext — provides open/close state and the currently-viewed product
 * for the Quick View modal singleton.
 *
 * The provider renders <QuickViewModalShell /> as a sibling of its children so
 * the modal is co-located with its state. The shell gates its body on `isOpen`
 * so no commerce hooks fire during SSR or while the modal is closed.
 */
import React, {useState, useCallback, useMemo} from 'react'
import PropTypes from 'prop-types'
import QuickViewModalShell from './modal-shell'

export const QuickViewContext = React.createContext(null)

export const useQuickView = () => {
    const ctx = React.useContext(QuickViewContext)
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

    const value = useMemo(
        () => ({isOpen, openProduct, openQuickView, closeQuickView}),
        [isOpen, openProduct, openQuickView, closeQuickView]
    )

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
