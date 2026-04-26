---
schemaVersion: 1
producedBy: storefront-debug
producedAt: 2026-04-26T03:20:00.000Z
---

# Debug Notes — product-quick-view-plp (Cycle 2)

## Triage Handoff Summary

- **Failing item:** e2e-runner
- **Error signature:** `7ebf497167c184d5`
- **Triage domain:** code-defect
- **Prior attempt count:** 1
- **Triage reason:** "The storefront app emits a React hook error preventing the quick-view modal from rendering"

## Root Cause Analysis

### Actual root cause: SSR hydration timing — Quick View triggers render before React hydration

The triage's initial hypothesis (React hook error preventing modal render) was **incorrect**. The `getServerSnapshot` warning is baseline platform noise, not a feature regression.

The actual defect:

1. The `ProductTile` override renders Quick View trigger buttons in the **initial render path** (no `useEffect` guard).
2. During SSR, these buttons are server-rendered into the HTML.
3. On the client, the buttons are **visible in the DOM immediately** after `domcontentloaded`.
4. React hydration takes 3-8 seconds on the dev server (full PLP with 5 tiles x lazy chunks).
5. The E2E test finds the trigger visible (server-rendered HTML) and clicks it **before hydration completes**.
6. The native DOM click event fires, but the React `onClick` handler is not yet attached.
7. The click is a no-op — the modal never opens.

### Reproduction

Clean browser context, Desktop Chrome 1280x720:
- Click immediately after domcontentloaded: modal = false (handlers not attached)
- Click after 8s wait: modal = true (hydration complete)

## Fix Applied

**File:** `overrides/app/components/product-tile/index.jsx`

Added a client-side mount guard (`isMounted` state + `useEffect`) to prevent Quick View triggers from rendering during SSR. The triggers now only appear after React hydration is complete, ensuring the `onClick` handlers are always attached when the user can interact with them.

This pattern ensures:
- **SSR:** Triggers are NOT in the server HTML (they are interactive-only).
- **Hydration:** Triggers are still absent (matching server HTML — no mismatch).
- **Post-hydration:** `useEffect` fires, `isMounted` becomes `true`, triggers appear with all React handlers attached.
- **E2E test:** `toBeVisible()` waits until triggers actually appear (post-hydration), so clicking always works.

## Remaining Test-Code Issue

After fixing the hydration bug, all E2E tests now correctly open the modal and verify product content. However, all 5 tests fail at the **console error assertion** at the end:

```ts
expect(filterBaselineNoise(consoleErrors)).toEqual([]);
```

The unfiltered errors are:
1. `"Warning: Encountered two children with the same key"` (key=`en-US`) — from the Footer language selector having duplicate `en-US` options. Appears at 1370ms during initial page load. Baseline platform noise.
2. `"Warning: React does not recognize the %s prop"` — from Chakra UI internals. Also baseline noise.

The E2E test's `BASELINE_NOISE_PATTERNS` array needs these two patterns added:
```ts
/Encountered two children with the same key/i,
/React does not recognize the .+ prop/i,
```

## Unit Test Follow-ups

The `isMounted` state guard is a straightforward SSR pattern. If existing product-tile unit tests render synchronously, they may need `act()` to flush the `useEffect` that sets `isMounted`.
