/*
 * App Shell Override — wraps the base PWA Kit App component to:
 * 1. Expose a deterministic hydration signal for E2E tests.
 * 2. Mount the QuickViewProvider + modal singleton for the PLP Quick View feature.
 *
 * The QuickViewProvider wraps BaseApp (it only holds React state, no SDK dependencies).
 * The QuickViewModalShell is injected as an additional child of BaseApp so it sits
 * INSIDE the commerce-SDK/Chakra/IntlProvider/AddToCartModalProvider chain that
 * BaseApp establishes — giving the modal body access to useAddToCartModalContext,
 * useShopperBasketsMutationHelper, useIntl, etc.
 *
 * Static surface (getProps, getTemplateName, propTypes, displayName) is forwarded
 * from the base component so the PWA Kit SSR runtime continues to discover
 * route-level data fetchers.
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

    // Separate children from rest so we can inject the modal shell
    // alongside the route content inside BaseApp's provider tree.
    const {children, ...rest} = props

    return (
        <QuickViewProvider>
            <BaseApp {...rest}>
                {children}
                <QuickViewModalShell />
            </BaseApp>
        </QuickViewProvider>
    )
}

App.getProps = BaseApp.getProps
App.getTemplateName = BaseApp.getTemplateName
App.propTypes = BaseApp.propTypes
App.displayName = BaseApp.displayName || 'App'

export default App
