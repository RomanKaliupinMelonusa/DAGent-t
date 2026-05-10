/*
 * App Shell Override — wraps the base PWA Kit App component with:
 * 1. A deterministic hydration signal for E2E tests (window.__APP_HYDRATED__).
 * 2. QuickViewProvider + QuickViewModalShell for the PLP Quick View feature.
 *
 * QuickViewProvider is mounted as a wrapper around the route children inside
 * BaseApp, which places them inside AddToCartModalProvider. This ensures the
 * modal body's hooks (useAddToCartModalContext, etc.) can access their providers.
 *
 * Static surface (getProps, getTemplateName, propTypes, displayName) is
 * forwarded from the base component so the PWA Kit SSR runtime continues
 * to discover route-level data fetchers.
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
                <QuickViewModalShell />
                {children}
            </QuickViewProvider>
        </BaseApp>
    )
}

App.getProps = BaseApp.getProps
App.getTemplateName = BaseApp.getTemplateName
App.propTypes = BaseApp.propTypes
App.displayName = BaseApp.displayName || 'App'

export default App
