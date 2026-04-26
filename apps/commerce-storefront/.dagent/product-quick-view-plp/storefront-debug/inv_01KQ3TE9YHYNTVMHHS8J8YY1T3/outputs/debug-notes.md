---
schemaVersion: 1
producedBy: storefront-debug
producedAt: 2026-04-26T02:56:00.000Z
---

# Debug Notes — product-quick-view-plp

## Triage Handoff Summary

- **Failing item:** e2e-runner
- **Error signature:** `109f28273bb9303e`
- **Triage domain:** `code-defect`
- **Triage reason:** The category page route returns a 404, indicating the storefront application is not serving the expected PLP page, so the quick-view-trigger element is never rendered.
- **Prior attempt count:** 0

## Root Cause Analysis

### Defect 1: Multi-site URL routing not configured (PRIMARY — caused 404)

The acceptance contract and E2E tests navigate to `/uk/en-GB/category/mens-clothing-jackets`.
The storefront config had `url.site: 'none'` and `url.locale: 'none'`, meaning URLs
with site/locale path prefixes were not recognized by the router — returning HTTP 404.

**Fix applied:**
1. `config/default.js` — changed `url.site` from `'none'` to `'path'` and `url.locale` from `'none'` to `'path'`
2. `config/default.js` — uncommented `siteAliases` and set `RefArch: 'uk'`
3. `config/sites.js` — added `en-GB` as a locale alias for `en-US` (the Commerce Cloud sandbox does not support `en-GB` natively, so we alias `en-US` as `en-GB` in URLs with USD as preferred currency)

After fix: `GET /uk/en-GB/category/mens-clothing-jackets` → HTTP 200 with 5 product tiles.

### Defect 2: `quick-view-modal` testid on non-visible wrapper (caused modal not found)

The `data-testid="quick-view-modal"` was on a wrapper `<Box>` element outside the
Chakra `<Modal>` portal. Since `<Modal>` portals its content to the end of `<body>`,
the wrapper Box had zero dimensions — making it invisible to Playwright's
`toBeVisible()` check even when the modal was fully open.

**Fix applied:** Moved `data-testid="quick-view-modal"` onto the `<ModalContent>` element,
which renders inside the Chakra portal and is visible when the modal is open.

### Defect 3: `quick-view-swatch` testid not forwarded by Swatch component

The base `Swatch` component (`@salesforce/retail-react-app/app/components/swatch-group/swatch`)
destructures specific props and does not spread `...rest` onto the DOM element.
Passing `data-testid="quick-view-swatch"` as a prop to `<Swatch>` had no effect.

**Fix applied:** Wrapped each `<Swatch>` in a `<Box data-testid="quick-view-swatch">`.

## Remaining Test-Code Issue

The E2E tests still fail because the **Tracking Consent** dialog (a Chakra portal
`role="dialog"` with "Decline" / "Accept" CTAs) intercepts pointer events on
the Quick View triggers. The `dismissOverlays()` helper in the spec runs
immediately after `page.goto(..., { waitUntil: 'domcontentloaded' })` — before
React hydrates and mounts the consent dialog. By the time the test tries to click
the trigger, the dialog is blocking.

This is a **test-code** issue (the spec's `dismissOverlays` timing), not a code-defect.
The consent dialog is a pre-existing platform feature visible in the baseline.
The E2E author should add a wait-for-dialog strategy before dismissing.

## Verification

All testids verified present and visible via Playwright MCP evaluation after manual
click on Quick View trigger at `/uk/en-GB/category/mens-clothing-jackets`:

| testid | found | visible | tag |
|---|---|---|---|
| quick-view-modal | ✓ | ✓ | SECTION |
| product-view-modal | ✓ | ✓ | DIV |
| quick-view-swatch | ✓ | ✓ | DIV |
| quick-view-product-name | ✓ | ✓ | H2 |
| quick-view-price | ✓ | ✓ | DIV |
| quick-view-main-image | ✓ | ✓ | DIV |
| quick-view-quantity-stepper | ✓ | ✓ | DIV |
| quick-view-add-to-cart-btn | ✓ | ✓ | BUTTON |
| quick-view-add-to-wishlist-btn | ✓ | ✓ | BUTTON |
| quick-view-full-details-link | ✓ | ✓ | A |
| quick-view-close-btn | ✓ | ✓ | BUTTON |

## Unit Test Follow-ups

The unit tests in `overrides/app/components/quick-view-modal/index.test.jsx` may need
updates for the changed JSX structure (wrapper changed from `<Box>` to `<>`). The
`data-testid="quick-view-modal"` is now on `ModalContent` rather than a wrapper Box.
