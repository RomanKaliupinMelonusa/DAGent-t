/*
 * App Shell Override — wraps the base PWA Kit App component to:
 * 1. Expose a deterministic hydration signal for E2E tests.
 * 2. Mount the QuickViewProvider + QuickViewModalShell inside BaseApp's
 *    children so the modal body has access to AddToCartModalProvider
 *    and other commerce SDK contexts that live inside BaseApp.
 */
import React, {useEffect} from 'react'
import BaseApp from '@salesforce/retail-react-app/app/components/_app'
import {QuickViewProvider} from '../quick-view-modal/context'
import QuickViewModalShell from '../quick-view-modal/modal-shell'

const App = (props) => {
    const {children, ...rest} = props

    useEffect(() => {
        if (typeof window !== 'undefined') {
            window.__APP_HYDRATED__ = true
        }
    }, [])

    return (
        <BaseApp {...rest}>
            <QuickViewProvider>
                {children}
                <QuickViewModalShell />
            </QuickViewProvider>
        </BaseApp>
    )
}

App.getProps = BaseApp.getProps
App.getTemplateName = BaseApp.getTemplateName
App.propTypes = BaseApp.propTypes
App.displayName = BaseApp.displayName || 'App'

export default App
