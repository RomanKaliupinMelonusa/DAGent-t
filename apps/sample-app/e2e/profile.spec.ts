// =============================================================================
// E2E — User Profile Page
// =============================================================================
// Tests the authenticated profile view, form submission, and error handling.
// Uses the demo-auth fixture for pre-authenticated pages.
// =============================================================================

import { test, expect } from "./fixtures/demo-auth.fixture";

test.describe("User Profile", () => {
  // Happy path — load profile and save changes
  test("loads profile and saves updated display name", async ({
    authenticatedPage,
  }) => {
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
      // Navigate to profile page and wait for GET /profile to succeed
      const [getResponse] = await Promise.all([
        authenticatedPage.waitForResponse(
          (resp) =>
            resp.url().includes("/profile") &&
            resp.request().method() === "GET" &&
            resp.status() === 200,
          { timeout: 15_000 },
        ),
        authenticatedPage.goto(
          `${authenticatedPage.url().split("/").slice(0, 3).join("/")}/profile`,
        ),
      ]);
      expect(getResponse.ok()).toBeTruthy();

      // Wait for loading to complete
      await expect(
        authenticatedPage.getByTestId("profile-loading"),
      ).toBeHidden({ timeout: 15_000 });

      // Verify display name input is visible and populated with initial data
      const nameInput =
        authenticatedPage.getByTestId("profile-displayname");
      await expect(nameInput).toBeVisible();
      await expect(nameInput).toHaveValue("Demo User");

      // Verify no error banner present on initial load
      await expect(
        authenticatedPage.getByTestId("profile-error"),
      ).toBeHidden();

      // Verify email is displayed (data loaded correctly)
      await expect(
        authenticatedPage.getByText("demo@example.com"),
      ).toBeVisible();

      // Clear and type new name
      await nameInput.fill("Updated User");

      // Click save and wait for PATCH /profile to succeed
      const saveBtn = authenticatedPage.getByTestId("save-profile-btn");
      await expect(saveBtn).toBeVisible();

      const [patchResponse] = await Promise.all([
        authenticatedPage.waitForResponse(
          (resp) =>
            resp.url().includes("/profile") &&
            resp.request().method() === "PATCH" &&
            resp.status() === 200,
          { timeout: 10_000 },
        ),
        saveBtn.click(),
      ]);
      expect(patchResponse.ok()).toBeTruthy();

      // Verify success banner appears
      await expect(
        authenticatedPage.getByTestId("profile-success"),
      ).toBeVisible({ timeout: 5_000 });
      await expect(
        authenticatedPage.getByTestId("profile-success"),
      ).toContainText("Profile updated!");

      // Verify no error banner appears
      await expect(
        authenticatedPage.getByTestId("profile-error"),
      ).toBeHidden();
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

  // Negative test — intercept PATCH to return 400 and verify error banner
  test("shows error banner on 400 validation error", async ({
    authenticatedPage,
  }) => {
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
      // Intercept PATCH requests to /profile and return 400
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

      // Navigate to profile page
      await authenticatedPage.goto(
        `${authenticatedPage.url().split("/").slice(0, 3).join("/")}/profile`,
      );

      // Wait for loading to complete
      await expect(
        authenticatedPage.getByTestId("profile-loading"),
      ).toBeHidden({ timeout: 15_000 });

      // Click save (with intercepted PATCH returning 400)
      const saveBtn = authenticatedPage.getByTestId("save-profile-btn");
      await expect(saveBtn).toBeVisible();
      await saveBtn.click();

      // Verify error banner is visible and contains expected text
      await expect(
        authenticatedPage.getByTestId("profile-error"),
      ).toBeVisible({ timeout: 10_000 });
      await expect(
        authenticatedPage.getByTestId("profile-error"),
      ).toContainText("at least 2 character");
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

  // Verify Profile nav link is present
  test("shows Profile link in navigation", async ({ authenticatedPage }) => {
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
      // Profile link should be visible in the nav
      const profileLink = authenticatedPage.getByRole("link", {
        name: "Profile",
      });
      await expect(profileLink).toBeVisible();

      // Click it and verify we navigate to profile page
      await profileLink.click();

      // Verify the profile page loads (loading state appears, then form appears)
      await expect(authenticatedPage).toHaveURL(/\/profile/);
      await expect(
        authenticatedPage.getByTestId("profile-displayname"),
      ).toBeVisible({ timeout: 15_000 });
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
