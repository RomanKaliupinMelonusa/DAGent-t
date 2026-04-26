/*
 * App Shell Override — wraps the base PWA Kit App component to expose a
 * deterministic hydration signal for E2E tests.
 *
 * Why: Playwright specs that click SSR-rendered buttons before React has
 * attached its event handlers race with hydration and time out silently.
 * By flipping `window.__APP_HYDRATED__ = true` from a single useEffect
 * after the first client-side mount, specs can gate first interaction on
 * `awaitHydrated(page)` (see `e2e/fixtures.ts`).
 *
 * The flag is set exactly once, guarded by `typeof window !== 'undefined'`
 * so SSR is unaffected. Static surface (`getProps`, `getTemplateName`,
 * `propTypes`, `displayName`) is forwarded from the base component so the
 * PWA Kit SSR runtime continues to discover route-level data fetchers.
 */
import React, {useEffect} from 'react'
import BaseApp from '@salesforce/retail-react-app/app/components/_app'

const App = (props) => {
    useEffect(() => {
        if (typeof window !== 'undefined') {
            window.__APP_HYDRATED__ = true
        }
    }, [])

    return <BaseApp {...props} />
}

App.getProps = BaseApp.getProps
App.getTemplateName = BaseApp.getTemplateName
App.propTypes = BaseApp.propTypes
App.displayName = BaseApp.displayName || 'App'

export default App
