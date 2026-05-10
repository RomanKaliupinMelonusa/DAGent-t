/*
 * App Shell Override — wraps the base PWA Kit App component to:
 * 1. Expose a deterministic hydration signal for E2E tests.
 * 2. Mount the QuickViewProvider for the PLP Quick View modal feature.
 *
 * QuickViewProvider wraps the children passed to BaseApp so it sits INSIDE
 * the base app's provider chain (commerce-sdk-react, AddToCartModalProvider,
 * CurrencyProvider, IntlProvider, etc.) which the modal body's hooks require.
 *
 * Static surface (`getProps`, `getTemplateName`, `propTypes`, `displayName`)
 * is forwarded from the base component so the PWA Kit SSR runtime continues
 * to discover route-level data fetchers.
 */
import React, {useEffect} from 'react'
import BaseApp from '@salesforce/retail-react-app/app/components/_app'
import {QuickViewProvider} from '../quick-view-modal/context'

const App = (props) => {
    useEffect(() => {
        if (typeof window !== 'undefined') {
            window.__APP_HYDRATED__ = true
        }
    }, [])

    // Wrap children with QuickViewProvider so it has access to all base providers
    // (AddToCartModalProvider, commerce-sdk-react, IntlProvider, etc.)
    const {children, ...rest} = props

    return (
        <BaseApp {...rest}>
            <QuickViewProvider>{children}</QuickViewProvider>
        </BaseApp>
    )
}

App.getProps = BaseApp.getProps
App.getTemplateName = BaseApp.getTemplateName
App.propTypes = BaseApp.propTypes
App.displayName = BaseApp.displayName || 'App'

export default App
