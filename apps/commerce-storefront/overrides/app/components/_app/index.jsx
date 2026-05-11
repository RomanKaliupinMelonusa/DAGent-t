/*
 * App Shell Override — wraps the base PWA Kit App component with the
 * QuickViewProvider and exposes a deterministic hydration signal for E2E tests.
 *
 * The QuickViewProvider wraps the route children *inside* BaseApp so it sits
 * within the existing commerce/SDK provider tree (AddToCartModalProvider,
 * CurrencyProvider, IntlProvider, etc.). This ensures hooks used by the modal
 * body (useShopperBasketsMutation, useCurrentBasket, useAddToCartModalContext)
 * have their required context available.
 *
 * The hydration flag (`window.__APP_HYDRATED__`) is set exactly once,
 * guarded by `typeof window !== 'undefined'` so SSR is unaffected.
 *
 * Static surface (`getProps`, `getTemplateName`, `propTypes`, `displayName`)
 * is forwarded from the base component so the PWA Kit SSR runtime continues
 * to discover route-level data fetchers.
 */
import React, {useEffect} from 'react'
import BaseApp from '@salesforce/retail-react-app/app/components/_app'
import {QuickViewProvider} from '../quick-view-modal/context'

const App = (props) => {
    const {children, ...rest} = props

    useEffect(() => {
        if (typeof window !== 'undefined') {
            window.__APP_HYDRATED__ = true
        }
    }, [])

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
