// =============================================================================
// E2E — Authenticated Hello API Call
// =============================================================================
// Tests the authenticated /hello API call flow after successful demo login.
// Uses the demo-auth fixture for pre-authenticated pages.
// =============================================================================

import { test, expect } from "./fixtures/demo-auth.fixture";

test.describe("Authenticated API Call", () => {
  test("calls /hello endpoint and displays response", async ({
    authenticatedPage,
  }) => {
    // Verify we are authenticated (display name visible)
    await expect(
      authenticatedPage.getByTestId("user-display-name"),
    ).toBeVisible();

    // Click the "Call /hello" button
    const callButton = authenticatedPage.getByTestId("call-hello-button");
    await expect(callButton).toBeVisible();
    await callButton.click();

    // Wait for the response to appear
    const responseBlock = authenticatedPage.getByTestId("hello-response");
    await expect(responseBlock).toBeVisible({ timeout: 15_000 });

    // Validate response content contains expected fields
    const text = await responseBlock.textContent();
    expect(text).toBeTruthy();

    const parsed = JSON.parse(text!);
    expect(parsed).toHaveProperty("message");
    expect(parsed).toHaveProperty("timestamp");
    expect(typeof parsed.message).toBe("string");
    expect(typeof parsed.timestamp).toBe("string");
  });

  test("shows authenticated user display name in nav", async ({
    authenticatedPage,
  }) => {
    const displayName = authenticatedPage.getByTestId("user-display-name");
    await expect(displayName).toBeVisible();
    await expect(displayName).toHaveText("Demo User");
  });

  test("can navigate to about page while authenticated", async ({
    authenticatedPage,
  }) => {
    // Click About link
    await authenticatedPage.getByRole("link", { name: "About" }).click();

    // Should see the About page content
    await expect(
      authenticatedPage.getByText("Auth Modes"),
    ).toBeVisible();

    // Should still be authenticated
    await expect(
      authenticatedPage.getByTestId("user-display-name"),
    ).toBeVisible();
  });

  test("sign out returns to login form", async ({ authenticatedPage }) => {
    // Click sign out
    const signOutButton = authenticatedPage.getByTestId("sign-out-button");
    await expect(signOutButton).toBeVisible();
    await signOutButton.click();

    // Should return to login form
    await expect(
      authenticatedPage.getByTestId("demo-username"),
    ).toBeVisible();
  });
});
