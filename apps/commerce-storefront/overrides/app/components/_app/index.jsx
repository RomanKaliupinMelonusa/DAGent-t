/*
 * App Shell Override — wraps the base PWA Kit App component with:
 * 1. A hydration signal for E2E tests (window.__APP_HYDRATED__).
 * 2. The QuickViewProvider for the PLP Quick View modal feature.
 *
 * The QuickViewProvider wraps the route-level children BEFORE they are
 * passed into BaseApp. BaseApp renders them inside its own provider chain
 * (AddToCartModalProvider, IntlProvider, CurrencyProvider, etc.), so the
 * QuickViewModalShell (mounted inside QuickViewProvider) has access to
 * all SDK hooks and contexts.
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
