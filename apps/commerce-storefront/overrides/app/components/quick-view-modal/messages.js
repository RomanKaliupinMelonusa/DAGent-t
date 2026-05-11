/*
 * i18n messages for the Quick View modal feature.
 */
import {defineMessages} from 'react-intl'

const messages = defineMessages({
    triggerLabel: {
        id: 'commerce-storefront.quickView.triggerLabel',
        defaultMessage: 'Quick View'
    },
    triggerAriaLabelMobile: {
        id: 'commerce-storefront.quickView.triggerAriaLabelMobile',
        defaultMessage: 'Quick View {productName}'
    },
    closeLabel: {
        id: 'commerce-storefront.quickView.closeLabel',
        defaultMessage: 'Close Quick View'
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
