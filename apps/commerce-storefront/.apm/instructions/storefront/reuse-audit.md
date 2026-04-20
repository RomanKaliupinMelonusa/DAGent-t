# Base Template Reuse Audit (MANDATORY before writing wrappers)

The PWA Kit base template (`@salesforce/retail-react-app@9.1.1`) ships production-grade components and hooks. Most features you are asked to build are **already implemented in the base template** — your job is usually to wire them together, not to re-implement them.

## The Rule

**Before writing any new component or hook whose name matches a common retail pattern, you MUST audit the base template for an existing export and either (a) reuse it, or (b) document in one sentence why reuse is not possible.**

Common retail patterns that almost always have a base-template export:

| If you are about to write... | First grep for... |
|---|---|
| `ProductQuickView`, `QuickViewModal`, any modal over a product | `ProductViewModal`, `ProductView`, `useProduct` |
| `AddToCart`, `CartAction`, any add-to-cart UX | `useAddToCart`, `useBasket` |
| `PriceDisplay`, `FormattedPrice` | existing `<Price>` component |
| `useProduct*` hook | `useProduct`, `useProductViewModal` |
| `MiniCart`, cart drawer | existing `CartDrawer`, `MiniCart` |
| Any `*Modal`, `*Drawer`, `*Overlay` over commerce data | grep `Modal`, `Drawer` under `@salesforce/retail-react-app/app/components` |

## The Audit Procedure

Run this before the first `write_file` on a new component:

```bash
# 1. Find every candidate export in the base template
grep -rn "export \(default \)\?\(function\|const\|class\) .*\(Modal\|View\|Drawer\|Overlay\|Quick\)" \
     node_modules/@salesforce/retail-react-app/app/components \
     node_modules/@salesforce/retail-react-app/app/hooks
```

If a match exists whose name semantically covers what you were about to build:

1. **Quote the import path** in your plan (e.g. `import {ProductViewModal} from '@salesforce/retail-react-app/app/components/product-view-modal'`).
2. **Reuse it directly** via the override pattern, passing the product / state it needs.
3. **Only** introduce a wrapper component if you can state — in one sentence, in the `_ARCHITECTURE.md` or commit message — what the base export cannot do that your wrapper provides (e.g. "base `ProductViewModal` assumes an already-fetched product; we need fetch-on-demand for the tile click").

## What "Reuse" Means in Practice (PWA Kit)

- **Override, don't shadow.** Put your wrapper at `overrides/app/components/<name>/index.jsx` that imports the base component and extends it — never copy its body.
- **Hooks first.** If a hook (`useProduct`, `useProductViewModal`) exists, your component should call it rather than re-implementing product fetching, cart mutations, or variation selection.
- **No parallel implementations.** If you find yourself reaching for `commerce-sdk-react` primitives (`useShopperProducts`) when a higher-level hook (`useProduct`) already wraps them, stop and use the higher-level hook.

## Self-Review Gate

Before your final commit on a feature that adds a component:

```bash
# The component path you created
NEW_COMPONENT="overrides/app/components/<your-name>/index.jsx"
# Grep the base template for the concept (noun) behind your component
CONCEPT="<e.g. Quick View, Mini Cart, Price, Product Detail>"
grep -rn "$CONCEPT" node_modules/@salesforce/retail-react-app/app/ | head -20
```

If this surfaces an export you didn't import or reference in your component, you have almost certainly duplicated functionality. Rewrite the override to delegate to the existing export.

## Why This Rule Exists

A feature that re-implements a base-template component typically introduces:

- Missing prop contracts (e.g. your `ProductView` wrapper forgets `masterId`, causing `TypeError: Cannot read properties of undefined`).
- Divergent loading/error states that Playwright "or" assertions accept as passing but users see as broken.
- Maintenance burden when the base template upgrades.

Reuse first. Wrap only with justification. Duplicate never.
