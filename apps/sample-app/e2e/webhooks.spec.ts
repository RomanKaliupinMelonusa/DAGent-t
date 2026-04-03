// =============================================================================
// E2E — Webhook Dispatcher
// =============================================================================
// Tests the /webhooks page: form rendering, webhook registration, list
// display, persistence across reload, and NavBar navigation.
// Uses demo-auth fixture for pre-authenticated pages.
// =============================================================================

import { test, expect } from "./fixtures/demo-auth.fixture";

test.describe("Webhook Dispatcher", () => {
  test("shows webhook registration form", async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // --- Deep Diagnostic Interception ---
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
      await page.goto("/webhooks");

      await expect(page.getByTestId("webhook-url-input")).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByTestId("webhook-submit")).toBeVisible();
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

  test("registers a new webhook URL and displays it in the list", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;

    // --- Deep Diagnostic Interception ---
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
      await page.goto("/webhooks");

      // Fill the URL input
      const urlInput = page.getByTestId("webhook-url-input");
      await expect(urlInput).toBeVisible({ timeout: 15_000 });
      await urlInput.fill("https://example.com/hook");

      // Submit the form
      await page.getByTestId("webhook-submit").click();

      // Wait for the webhook to appear in the list
      const webhookList = page.getByTestId("webhook-list");
      await expect(webhookList).toBeVisible({ timeout: 15_000 });

      // At least one row should be visible
      const rows = page.getByTestId("webhook-row");
      await expect(rows.first()).toBeVisible();

      // The row should contain our URL
      await expect(rows.first()).toContainText("https://example.com/hook");
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

  test("webhook list persists after page reload", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;

    // Use a unique URL per test run to avoid collisions with prior data
    const uniqueUrl = `https://example.com/persist-${Date.now()}`;

    // --- Deep Diagnostic Interception ---
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
      await page.goto("/webhooks");

      // Register a webhook
      const urlInput = page.getByTestId("webhook-url-input");
      await expect(urlInput).toBeVisible({ timeout: 15_000 });
      await urlInput.fill(uniqueUrl);
      await page.getByTestId("webhook-submit").click();

      // Wait for the list to load and the new entry to appear
      const webhookList = page.getByTestId("webhook-list");
      await expect(webhookList).toBeVisible({ timeout: 15_000 });
      await expect(
        page.getByText(uniqueUrl).first(),
      ).toBeVisible({ timeout: 15_000 });

      // Reload the page
      await page.reload({ waitUntil: "domcontentloaded" });

      // The webhook should still be visible after reload
      await expect(page.getByTestId("webhook-list")).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByText(uniqueUrl).first()).toBeVisible();
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

  test("can navigate to webhooks page from NavBar", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;

    // --- Deep Diagnostic Interception ---
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
      // Start from the authenticated home page
      await expect(page.getByTestId("user-display-name")).toBeVisible();

      // Click the Webhooks nav link
      await page.getByRole("link", { name: "Webhooks" }).click();

      // URL should be /webhooks
      await expect(page).toHaveURL(/\/webhooks/);

      // Registration form should be visible
      await expect(page.getByTestId("webhook-url-input")).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByTestId("webhook-submit")).toBeVisible();
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
