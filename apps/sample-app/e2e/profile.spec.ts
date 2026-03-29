// =============================================================================
// E2E — User Profile Page
// =============================================================================
// Tests the profile page UI: loading, editing, saving, error states.
// Uses demo-auth fixture for pre-authenticated pages.
// =============================================================================

import { test, expect } from "./fixtures/demo-auth.fixture";

const defaultProfile = {
  id: "00000000-0000-0000-0000-000000000001",
  displayName: "Demo User",
  email: "demo@example.com",
  theme: "system",
};

test.describe("User Profile Page", () => {
  // -------------------------------------------------------------------------
  // Happy path — load + save
  // -------------------------------------------------------------------------

  test("loads profile and saves changes", async ({ authenticatedPage }) => {
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
      await authenticatedPage.goto("/profile");

      // Wait for loading to finish
      await expect(
        authenticatedPage.getByTestId("profile-loading"),
      ).not.toBeAttached({ timeout: 15_000 });

      // Verify form is visible
      const nameInput =
        authenticatedPage.getByTestId("profile-displayname");
      await expect(nameInput).toBeVisible();

      // Fill new name and save
      await nameInput.fill("Updated User");
      await authenticatedPage.getByTestId("save-profile-btn").click();

      // Verify no error banner
      await expect(
        authenticatedPage.getByTestId("profile-error"),
      ).not.toBeAttached({ timeout: 5_000 });
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

  // -------------------------------------------------------------------------
  // Update stores result in UI
  // -------------------------------------------------------------------------

  test("save updates are reflected in the form", async ({
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
      // Intercept PATCH to return updated profile
      await authenticatedPage.route("**/profile", async (route) => {
        if (route.request().method() === "PATCH") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              ...defaultProfile,
              displayName: "Updated User",
              theme: "dark",
            }),
          });
        } else {
          await route.continue();
        }
      });

      await authenticatedPage.goto("/profile");
      await expect(
        authenticatedPage.getByTestId("profile-loading"),
      ).not.toBeAttached({ timeout: 15_000 });

      // Edit
      const nameInput =
        authenticatedPage.getByTestId("profile-displayname");
      await nameInput.fill("Updated User");
      await authenticatedPage
        .getByTestId("profile-theme")
        .selectOption("dark");
      await authenticatedPage.getByTestId("save-profile-btn").click();

      // Verify success
      await expect(
        authenticatedPage.getByTestId("profile-success"),
      ).toBeVisible({ timeout: 10_000 });

      // Verify form reflects PATCH response
      await expect(nameInput).toHaveValue("Updated User");
      await expect(
        authenticatedPage.getByTestId("profile-theme"),
      ).toHaveValue("dark");
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

  // -------------------------------------------------------------------------
  // Updated profile persists across navigation (simulated)
  // -------------------------------------------------------------------------

  test("updated profile persists across navigation", async ({
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
      let getCallCount = 0;
      const updatedProfile = {
        ...defaultProfile,
        displayName: "Updated User",
        theme: "dark" as const,
      };

      await authenticatedPage.route("**/profile", async (route) => {
        if (route.request().method() === "PATCH") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(updatedProfile),
          });
        } else if (route.request().method() === "GET") {
          getCallCount++;
          const profile =
            getCallCount === 1 ? defaultProfile : updatedProfile;
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(profile),
          });
        } else {
          await route.continue();
        }
      });

      await authenticatedPage.goto("/profile");
      await expect(
        authenticatedPage.getByTestId("profile-loading"),
      ).not.toBeAttached({ timeout: 15_000 });

      // Edit and save
      await authenticatedPage
        .getByTestId("profile-displayname")
        .fill("Updated User");
      await authenticatedPage
        .getByTestId("profile-theme")
        .selectOption("dark");
      await authenticatedPage.getByTestId("save-profile-btn").click();

      await expect(
        authenticatedPage.getByTestId("profile-success"),
      ).toBeVisible({ timeout: 10_000 });

      // Navigate away
      await authenticatedPage.getByRole("link", { name: "Home" }).click();

      // Navigate back
      await authenticatedPage
        .getByRole("link", { name: "Profile" })
        .click();

      // Verify updated values persist
      await expect(
        authenticatedPage.getByTestId("profile-displayname"),
      ).toHaveValue("Updated User", { timeout: 15_000 });
      await expect(
        authenticatedPage.getByTestId("profile-theme"),
      ).toHaveValue("dark");
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

  // -------------------------------------------------------------------------
  // 400 Bad Request — negative test
  // -------------------------------------------------------------------------

  test("shows error on 400 Bad Request", async ({ authenticatedPage }) => {
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
      await authenticatedPage.route("**/profile", async (route) => {
        if (route.request().method() === "PATCH") {
          await route.fulfill({
            status: 400,
            contentType: "application/json",
            body: JSON.stringify({
              error: "INVALID_INPUT",
              message:
                "displayName: String must contain at least 2 character(s)",
            }),
          });
        } else {
          await route.continue();
        }
      });

      await authenticatedPage.goto("/profile");
      await expect(
        authenticatedPage.getByTestId("profile-loading"),
      ).not.toBeAttached({ timeout: 15_000 });

      await authenticatedPage.getByTestId("save-profile-btn").click();

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

  // -------------------------------------------------------------------------
  // 401 Unauthorized — expired token
  // -------------------------------------------------------------------------

  test("shows error on 401 Unauthorized", async ({ authenticatedPage }) => {
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
      await authenticatedPage.route("**/profile", async (route) => {
        if (route.request().method() === "GET") {
          await route.fulfill({
            status: 401,
            contentType: "application/json",
            body: JSON.stringify({
              error: "UNAUTHORIZED",
              message: "Missing or invalid demo token.",
            }),
          });
        } else {
          await route.continue();
        }
      });

      await authenticatedPage.goto("/profile");
      await expect(
        authenticatedPage.getByTestId("profile-loading"),
      ).not.toBeAttached({ timeout: 15_000 });

      await expect(
        authenticatedPage.getByTestId("profile-error"),
      ).toBeVisible({ timeout: 10_000 });

      await expect(
        authenticatedPage.getByTestId("profile-error"),
      ).toContainText(/invalid demo token/i);
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

  // -------------------------------------------------------------------------
  // NavBar navigation to profile
  // -------------------------------------------------------------------------

  test("NavBar Profile link navigates to profile page", async ({
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
      await authenticatedPage.goto("/");

      // Click Profile link in NavBar
      await authenticatedPage
        .getByRole("link", { name: "Profile" })
        .click();

      // Verify URL
      await expect(authenticatedPage).toHaveURL(/\/profile/);

      // Verify profile page content loads
      await expect(
        authenticatedPage
          .getByTestId("profile-loading")
          .or(authenticatedPage.getByTestId("profile-displayname")),
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

  // -------------------------------------------------------------------------
  // Network failure on save
  // -------------------------------------------------------------------------

  test("shows error on network failure during save", async ({
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
      await authenticatedPage.goto("/profile");
      await expect(
        authenticatedPage.getByTestId("profile-loading"),
      ).not.toBeAttached({ timeout: 15_000 });

      // Intercept PATCH with network abort
      await authenticatedPage.route("**/profile", async (route) => {
        if (route.request().method() === "PATCH") {
          await route.abort("connectionrefused");
        } else {
          await route.continue();
        }
      });

      await authenticatedPage.getByTestId("save-profile-btn").click();

      await expect(
        authenticatedPage.getByTestId("profile-error"),
      ).toBeVisible({ timeout: 10_000 });
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

  // -------------------------------------------------------------------------
  // Success banner clears on edit
  // -------------------------------------------------------------------------

  test("success banner clears when user edits", async ({
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
      // Intercept PATCH to return success
      await authenticatedPage.route("**/profile", async (route) => {
        if (route.request().method() === "PATCH") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(defaultProfile),
          });
        } else {
          await route.continue();
        }
      });

      await authenticatedPage.goto("/profile");
      await expect(
        authenticatedPage.getByTestId("profile-loading"),
      ).not.toBeAttached({ timeout: 15_000 });

      await authenticatedPage.getByTestId("save-profile-btn").click();

      await expect(
        authenticatedPage.getByTestId("profile-success"),
      ).toBeVisible({ timeout: 10_000 });

      // Edit clears the banner
      await authenticatedPage
        .getByTestId("profile-displayname")
        .fill("New Name");

      await expect(
        authenticatedPage.getByTestId("profile-success"),
      ).not.toBeAttached();
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
