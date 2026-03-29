// =============================================================================
// E2E — User Profile Page
// =============================================================================
// Tests the profile page UI: loading, form display, save, and 400 error.
// Uses the demo-auth fixture for pre-authenticated pages.
// =============================================================================

import { test, expect } from "./fixtures/demo-auth.fixture";

test.describe("User Profile Page", () => {
  test("loads profile and saves successfully", async ({
    authenticatedPage,
  }) => {
    // --- Deep diagnostics ---
    const consoleLogs: string[] = [];
    authenticatedPage.on("console", (msg) => {
      if (msg.type() === "error") consoleLogs.push(msg.text());
    });

    const failedRequests: string[] = [];
    authenticatedPage.on("requestfailed", (request) =>
      failedRequests.push(
        `${request.method()} ${request.url()} - ${request.failure()?.errorText}`,
      ),
    );
    authenticatedPage.on("response", (response) => {
      if (!response.ok())
        failedRequests.push(
          `${response.request().method()} ${response.url()} - ${response.status()}`,
        );
    });

    try {
      // Navigate to profile
      await authenticatedPage.goto("/profile", {
        waitUntil: "domcontentloaded",
      });

      // Wait for loading to complete
      await expect(
        authenticatedPage.getByTestId("profile-loading"),
      ).toBeHidden({ timeout: 15_000 });

      // Verify display name input is visible with a value
      const displayNameInput =
        authenticatedPage.getByTestId("profile-displayname");
      await expect(displayNameInput).toBeVisible();

      // Fill in a new display name
      await displayNameInput.fill("Updated User");

      // Click save
      const saveBtn = authenticatedPage.getByTestId("save-profile-btn");
      await expect(saveBtn).toBeVisible();
      await saveBtn.click();

      // Verify no error is shown (success path)
      await expect(
        authenticatedPage.getByTestId("profile-error"),
      ).toBeHidden({ timeout: 10_000 });
    } catch (error) {
      const diagnostics = [
        consoleLogs.length
          ? `Console errors:\n${consoleLogs.join("\n")}`
          : "",
        failedRequests.length
          ? `Failed/non-OK requests:\n${failedRequests.join("\n")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n");

      if (diagnostics) {
        throw new Error(
          `${(error as Error).message}\n\n--- Browser Diagnostics ---\n${diagnostics}`,
        );
      }
      throw error;
    }
  });

  test("shows error banner on 400 bad request", async ({
    authenticatedPage,
  }) => {
    // --- Deep diagnostics ---
    const consoleLogs: string[] = [];
    authenticatedPage.on("console", (msg) => {
      if (msg.type() === "error") consoleLogs.push(msg.text());
    });

    const failedRequests: string[] = [];
    authenticatedPage.on("requestfailed", (request) =>
      failedRequests.push(
        `${request.method()} ${request.url()} - ${request.failure()?.errorText}`,
      ),
    );
    authenticatedPage.on("response", (response) => {
      if (!response.ok())
        failedRequests.push(
          `${response.request().method()} ${response.url()} - ${response.status()}`,
        );
    });

    try {
      // Intercept PATCH /profile to return 400
      await authenticatedPage.route("**/profile", (route) => {
        if (route.request().method() === "PATCH") {
          return route.fulfill({
            status: 400,
            contentType: "application/json",
            body: JSON.stringify({
              error: "INVALID_INPUT",
              message:
                "displayName: String must contain at least 2 character(s)",
            }),
          });
        }
        return route.continue();
      });

      // Navigate to profile
      await authenticatedPage.goto("/profile", {
        waitUntil: "domcontentloaded",
      });

      // Wait for loading to complete
      await expect(
        authenticatedPage.getByTestId("profile-loading"),
      ).toBeHidden({ timeout: 15_000 });

      // Click save (will trigger 400 from intercepted route)
      await authenticatedPage.getByTestId("save-profile-btn").click();

      // Verify error banner is visible
      const errorBanner = authenticatedPage.getByTestId("profile-error");
      await expect(errorBanner).toBeVisible({ timeout: 10_000 });

      // Verify error text mentions the validation issue
      await expect(errorBanner).toContainText("at least 2 character");
    } catch (error) {
      const diagnostics = [
        consoleLogs.length
          ? `Console errors:\n${consoleLogs.join("\n")}`
          : "",
        failedRequests.length
          ? `Failed/non-OK requests:\n${failedRequests.join("\n")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n");

      if (diagnostics) {
        throw new Error(
          `${(error as Error).message}\n\n--- Browser Diagnostics ---\n${diagnostics}`,
        );
      }
      throw error;
    }
  });
});
