/*
 * App Shell Override — wraps the base PWA Kit App component to:
 *   1. Expose a deterministic hydration signal for E2E tests.
 *   2. Mount the QuickViewProvider (+ its modal singleton) inside the
 *      BaseApp provider chain so it has access to AddToCartModalProvider,
 *      CommerceApiProvider, etc.
 *
 * Strategy: BaseApp renders `{children}` inside its own provider chain
 * (AddToCartModalProvider, IntlProvider, etc.). By passing QuickViewProvider
 * as explicit children, it sits INSIDE those providers while still wrapping
 * the page routes (props.children from the router).
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
