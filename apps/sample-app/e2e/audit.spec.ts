// =============================================================================
// E2E — Audit Log Dashboard
// =============================================================================
// Tests the /audit page renders correctly with authenticated access.
// Uses the demo-auth fixture for pre-authenticated pages.
// The fixture login fires a USER_LOGIN audit event, so we expect at least
// one row in the audit table.
// =============================================================================

import { test, expect } from "./fixtures/demo-auth.fixture";

test.describe("Audit Log Dashboard", () => {
  test("navigates to /audit and displays audit table", async ({
    authenticatedPage,
  }) => {
    // --- Deep diagnostic interception ---
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
      // Navigate to audit page
      await authenticatedPage.getByRole("link", { name: "Audit" }).click();
      await authenticatedPage.waitForURL("**/audit");

      // Verify the audit table is visible
      const table = authenticatedPage.getByTestId("audit-table");
      await expect(table).toBeVisible({ timeout: 15_000 });

      // Verify at least one audit row exists (the login event)
      const rows = authenticatedPage.getByTestId("audit-row");
      await expect(rows.first()).toBeVisible({ timeout: 10_000 });

      // Verify table column headers (use role selectors to avoid matching data cells)
      await expect(authenticatedPage.getByRole("columnheader", { name: "User ID" })).toBeVisible();
      await expect(authenticatedPage.getByRole("columnheader", { name: "Action" })).toBeVisible();
      await expect(authenticatedPage.getByRole("columnheader", { name: "Timestamp" })).toBeVisible();
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

  test("shows authenticated user while on audit page", async ({
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
      // Navigate to audit page
      await authenticatedPage.getByRole("link", { name: "Audit" }).click();
      await authenticatedPage.waitForURL("**/audit");

      // Should still be authenticated
      await expect(
        authenticatedPage.getByTestId("user-display-name"),
      ).toBeVisible();
      await expect(
        authenticatedPage.getByTestId("user-display-name"),
      ).toHaveText("Demo User");
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

  test("no error banner present and table rows contain data", async ({
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
      // Navigate to audit page via the Audit nav link
      await authenticatedPage.getByRole("link", { name: "Audit" }).click();
      await authenticatedPage.waitForURL("**/audit");

      // Wait for the table to load
      const table = authenticatedPage.getByTestId("audit-table");
      await expect(table).toBeVisible({ timeout: 15_000 });

      // Verify no error banner is present
      await expect(authenticatedPage.getByTestId("error-banner")).not.toBeVisible();
      await expect(authenticatedPage.getByTestId("audit-error")).not.toBeVisible();

      // Verify first row contains meaningful data (not empty cells)
      const firstRow = authenticatedPage.getByTestId("audit-row").first();
      const cells = firstRow.locator("td");
      await expect(cells).toHaveCount(3);

      // Each cell should have non-empty text content
      for (let i = 0; i < 3; i++) {
        const text = await cells.nth(i).textContent();
        expect(text?.trim().length).toBeGreaterThan(0);
      }
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
