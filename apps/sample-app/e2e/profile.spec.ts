// =============================================================================
// E2E — User Profile Page
// =============================================================================
// Tests the user profile page: loading, form display, save, and 400 error.
// Uses the demo-auth fixture for pre-authenticated pages.
// =============================================================================

import { test, expect } from "./fixtures/demo-auth.fixture";

test.describe("User Profile", () => {
  test("loads profile and displays form", async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // --- Deep diagnostics ---
    const consoleLogs: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleLogs.push(msg.text());
    });

    const failedRequests: string[] = [];
    page.on("requestfailed", (request) =>
      failedRequests.push(
        `${request.method()} ${request.url()} - ${request.failure()?.errorText}`,
      ),
    );
    page.on("response", (response) => {
      if (!response.ok())
        failedRequests.push(
          `${response.request().method()} ${response.url()} - ${response.status()}`,
        );
    });

    try {
      // Navigate to profile page
      await page.goto("/profile", { waitUntil: "domcontentloaded" });

      // Wait for loading to disappear
      await expect(page.getByTestId("profile-loading")).toBeHidden({
        timeout: 15_000,
      });

      // Verify form elements are visible
      await expect(page.getByTestId("profile-displayname")).toBeVisible();
      await expect(page.getByTestId("profile-theme")).toBeVisible();
      await expect(page.getByTestId("save-profile-btn")).toBeVisible();

      // Fill display name and save
      await page.getByTestId("profile-displayname").clear();
      await page.getByTestId("profile-displayname").fill("Updated User");
      await page.getByTestId("save-profile-btn").click();

      // Verify no error appeared
      await expect(page.getByTestId("profile-error")).toBeHidden({
        timeout: 10_000,
      });
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

  test("shows error banner on 400 response", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;

    // --- Deep diagnostics ---
    const consoleLogs: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleLogs.push(msg.text());
    });

    const failedRequests: string[] = [];
    page.on("requestfailed", (request) =>
      failedRequests.push(
        `${request.method()} ${request.url()} - ${request.failure()?.errorText}`,
      ),
    );
    page.on("response", (response) => {
      if (!response.ok())
        failedRequests.push(
          `${response.request().method()} ${response.url()} - ${response.status()}`,
        );
    });

    try {
      // Intercept PATCH to /api/profile and return 400
      await page.route("**/api/profile", (route) => {
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
      await page.goto("/profile", { waitUntil: "domcontentloaded" });

      // Wait for loading to finish
      await expect(page.getByTestId("profile-loading")).toBeHidden({
        timeout: 15_000,
      });

      // Click save (triggers intercepted PATCH)
      await page.getByTestId("save-profile-btn").click();

      // Verify error banner is visible with expected message
      await expect(page.getByTestId("profile-error")).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.getByTestId("profile-error")).toContainText(
        "at least 2 character",
      );
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

  test("NavBar shows Profile link", async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    const consoleLogs: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleLogs.push(msg.text());
    });

    const failedRequests: string[] = [];
    page.on("requestfailed", (request) =>
      failedRequests.push(
        `${request.method()} ${request.url()} - ${request.failure()?.errorText}`,
      ),
    );

    try {
      await expect(
        page.getByRole("link", { name: "Profile" }),
      ).toBeVisible();
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
