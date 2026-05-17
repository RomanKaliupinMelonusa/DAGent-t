/*
 * App Shell Override — wraps the base PWA Kit App component to:
 *   1. Expose a deterministic hydration signal for E2E tests.
 *   2. Mount the QuickViewProvider so Quick View state is available app-wide.
 *   3. Inject QuickViewModalShell into BaseApp's children so the modal renders
 *      INSIDE AddToCartModalProvider (which BaseApp mounts internally).
 *
 * Static surface (getProps, getTemplateName, propTypes, displayName) is
 * forwarded from the base component so the PWA Kit SSR runtime continues to
 * discover route-level data fetchers.
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
