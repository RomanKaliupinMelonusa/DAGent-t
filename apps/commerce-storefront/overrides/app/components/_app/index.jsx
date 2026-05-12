/*
 * App Shell Override — wraps the base PWA Kit App component to expose a
 * deterministic hydration signal for E2E tests and mounts the Quick View
 * provider for the PLP Quick View modal feature.
 *
 * The QuickViewProvider sits inside the existing provider chain (BaseApp
 * mounts CommerceApiProvider, AddToCartModalProvider, etc.) so hooks used
 * by the Quick View modal body (useCurrentBasket, useShopperBasketsMutation,
 * useAddToCartModalContext) have their required providers above them.
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
    useEffect(() => {
        if (typeof window !== 'undefined') {
            window.__APP_HYDRATED__ = true
        }
    }, [])

    return (
        <BaseApp {...props}>
            <QuickViewProvider>
                {props.children}
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
