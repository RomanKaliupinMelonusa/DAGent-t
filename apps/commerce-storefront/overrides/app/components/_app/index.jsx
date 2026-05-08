/*
 * App Shell Override — wraps the base PWA Kit App component to:
 * 1. Expose a deterministic hydration signal for E2E tests.
 * 2. Mount the QuickViewProvider (context only) at the app shell.
 * 3. Inject QuickViewModalShell as a BaseApp child so it sits inside
 *    the AddToCartModalProvider context tree (Chakra Modal uses a portal,
 *    so DOM position is irrelevant — only React context ancestry matters).
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
        <QuickViewProvider>
            <BaseApp {...props}>
                {props.children}
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
