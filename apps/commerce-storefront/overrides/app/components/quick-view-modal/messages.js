/*
 * Quick View Modal — react-intl message descriptors.
 *
 * Stable IDs namespaced under `commerce-storefront.quickView.*`.
 * Extracted by `npm run build-translations` into per-locale JSON.
 */
import {defineMessages} from 'react-intl'

const messages = defineMessages({
    triggerLabel: {
        id: 'commerce-storefront.quickView.triggerLabel',
        defaultMessage: 'Quick View'
    },
    triggerAriaLabelMobile: {
        id: 'commerce-storefront.quickView.triggerAriaLabelMobile',
        defaultMessage: 'Quick view for {productName}'
    },
    closeLabel: {
        id: 'commerce-storefront.quickView.closeLabel',
        defaultMessage: 'Close quick view'
    },
    viewFullDetailsLabel: {
        id: 'commerce-storefront.quickView.viewFullDetailsLabel',
        defaultMessage: 'View Full Details'
    },
    errorFallback: {
        id: 'commerce-storefront.quickView.errorFallback',
        defaultMessage: 'Unable to load product details. Please close and try again.'
    }
})

export default messages
