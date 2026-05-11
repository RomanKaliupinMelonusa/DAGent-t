/*
 * App Shell Override — wraps the base PWA Kit App component to:
 * 1. Expose a deterministic hydration signal (`window.__APP_HYDRATED__`) for E2E tests.
 * 2. Mount the QuickViewProvider (+ its singleton modal shell) inside the BaseApp
 *    provider chain so the Quick View context, modal, and all commerce hooks
 *    (useAddToCartModalContext, useCurrentBasket, etc.) are available.
 *
 * The QuickViewProvider wraps the route children so it sits INSIDE the commerce
 * SDK providers (CommerceApiProvider, AddToCartModalProvider, etc.) that BaseApp
 * provides. This ensures the modal body's hooks have access to the required context.
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

    // Wrap the route children with QuickViewProvider so it sits inside
    // BaseApp's AddToCartModalProvider. The modal shell is a singleton
    // mounted alongside the children — it renders nothing when closed.
    const {children, ...rest} = props

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
