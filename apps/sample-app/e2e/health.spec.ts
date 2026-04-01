// =============================================================================
// E2E — Health Badge
// =============================================================================
// Verifies the HealthBadge component renders "System Online" in the NavBar when
// the backend /api/health endpoint is reachable. Requires authentication because
// the DemoGate in providers.tsx replaces the entire layout (including NavBar)
// with the login form when unauthenticated. The health endpoint itself is
// anonymous, but the NavBar that hosts the badge is only visible post-login.
// =============================================================================

import { test, expect } from "./fixtures/demo-auth.fixture";

test.describe("Health Badge", () => {
  test('displays "System Online" when backend is reachable', async ({
    authenticatedPage: page,
  }) => {
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
      // authenticatedPage already loaded "/" and injected the session token.
      // NavBar (with HealthBadge) is now visible post-auth.
      const badge = page.getByTestId("health-badge");
      await expect(badge).toBeVisible({ timeout: 15_000 });
      await expect(badge).toHaveText("System Online", { timeout: 15_000 });
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

  test("health badge element exists on about page too", async ({
    authenticatedPage: page,
  }) => {
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
      await page.goto("/about", { waitUntil: "domcontentloaded" });

      const badge = page.getByTestId("health-badge");
      await expect(badge).toBeVisible({ timeout: 15_000 });
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
