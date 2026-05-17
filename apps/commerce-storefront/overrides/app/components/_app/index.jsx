/*
 * App Shell Override — wraps the base PWA Kit App component to expose a
 * deterministic hydration signal for E2E tests and mounts the QuickViewProvider
 * for the Quick View modal singleton.
 *
 * QuickViewProvider wraps BaseApp so the tile triggers can access the context.
 * QuickViewModalShell is rendered as a child of BaseApp so it sits INSIDE
 * the ChakraProvider, IntlProvider, and AddToCartModalProvider trees.
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
