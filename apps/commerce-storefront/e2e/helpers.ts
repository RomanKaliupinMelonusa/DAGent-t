/**
 * e2e/helpers.ts — Shared test helpers for PWA Kit E2E specs.
 *
 * These helpers were previously inlined in agent prompt instructions.
 * Import them in your spec files instead of copy-pasting.
 */

import type { Page } from '@playwright/test';

/**
 * Dismiss any Chakra-portal-mounted dialog (consent, locale, onboarding)
 * that intercepts pointer events on PLP/PDP/cart roots. PWA-Kit-generic;
 * idempotent; never throws; bounded total wall time (~1.5s worst case,
 * <50 ms when no overlay is present). Uses only `@playwright/test`
 * primitives — no `waitForTimeout`, no `networkidle`.
 */
export async function dismissOverlays(page: Page): Promise<void> {
  const ctaPattern = /accept|decline|close|continue|got it|dismiss|confirm|select/i;
  // Up to 3 passes — stacked portals (consent + locale) need sequential dismiss.
  for (let pass = 0; pass < 3; pass++) {
    const dialogs = await page.getByRole('dialog').all();
    let dismissed = false;
    for (const dialog of dialogs) {
      if (!(await dialog.isVisible().catch(() => false))) continue;
      const cta = dialog.getByRole('button', { name: ctaPattern }).first();
      const clicked = await cta
        .click({ timeout: 400 })
        .then(() => true)
        .catch(() => false);
      if (!clicked) {
        await page.keyboard.press('Escape').catch(() => {});
      }
      await dialog.waitFor({ state: 'hidden', timeout: 400 }).catch(() => {});
      dismissed = true;
    }
    if (!dismissed) return;
  }
}

/**
 * Detect the PWA Kit crash page and throw a structured error instead
 * of letting Playwright time out silently. Call after any action that
 * triggers component rendering (click, navigation, modal open).
 */
export async function assertNoCrashPage(
  page: Page,
  actionDescription = 'action',
): Promise<void> {
  const crashHeading = page.getByRole('heading', {
    name: /this page isn't working/i,
  });
  const hasCrash = await crashHeading
    .waitFor({ state: 'visible', timeout: 2000 })
    .then(() => true)
    .catch(() => false);
  if (hasCrash) {
    const stack = await page.locator('pre').textContent().catch(() => 'no stack');
    throw new Error(
      `PWA Kit crash page detected after "${actionDescription}". Stack: ${stack}`,
    );
  }
}
