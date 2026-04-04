// =============================================================================
// E2E — Kanban Task Board
// =============================================================================
// Tests the full task lifecycle: create → move to In Progress → reload → persist.
// Uses the demo-auth fixture for pre-authenticated pages.
// =============================================================================

import { test, expect } from "./fixtures/demo-auth.fixture";

test.describe("Kanban Task Board", () => {
  test("create task, move to In Progress, reload and verify persistence", async ({
    authenticatedPage,
  }) => {
    // --- Deep diagnostic capture ---
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
      // 1. Navigate to /tasks
      await authenticatedPage.goto("/tasks", { waitUntil: "domcontentloaded" });
      await expect(authenticatedPage.getByTestId("tasks-page")).toBeVisible({
        timeout: 15_000,
      });

      // 2. Create a task with a unique title
      const uniqueTitle = `E2E Task ${Date.now()}`;
      const input = authenticatedPage.getByTestId("new-task-input");
      await expect(input).toBeVisible();
      await input.fill(uniqueTitle);

      const createButton = authenticatedPage.getByTestId("create-task-button");
      await expect(createButton).toBeEnabled();
      await createButton.click();

      // 3. Verify the task appears in the To Do column
      const todoColumn = authenticatedPage.getByTestId("column-TODO");
      await expect(todoColumn.getByText(uniqueTitle)).toBeVisible({
        timeout: 15_000,
      });

      // 4. Click the "Start" button → move to In Progress
      // Find the task card containing our title and click its Start button
      const taskCard = todoColumn
        .locator('[data-testid="task-title"]', { hasText: uniqueTitle })
        .locator("..");
      const startButton = taskCard.getByRole("button", { name: "Start" });
      await expect(startButton).toBeVisible();
      await startButton.click();

      // 5. Verify task moved to In Progress column
      const inProgressColumn = authenticatedPage.getByTestId(
        "column-IN_PROGRESS",
      );
      await expect(inProgressColumn.getByText(uniqueTitle)).toBeVisible({
        timeout: 15_000,
      });

      // 6. Reload the page
      await authenticatedPage.reload({ waitUntil: "domcontentloaded" });
      await expect(authenticatedPage.getByTestId("tasks-page")).toBeVisible({
        timeout: 15_000,
      });

      // 7. Verify the task persisted in the In Progress column after reload
      const reloadedInProgress = authenticatedPage.getByTestId(
        "column-IN_PROGRESS",
      );
      await expect(reloadedInProgress.getByText(uniqueTitle)).toBeVisible({
        timeout: 15_000,
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

  test("Task Board link is visible in navigation", async ({
    authenticatedPage,
  }) => {
    // --- Deep diagnostic capture ---
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
      // Verify the Task Board nav link exists and navigates correctly
      const navLink = authenticatedPage.getByRole("link", {
        name: "Task Board",
      });
      await expect(navLink).toBeVisible();
      await navLink.click();

      await expect(authenticatedPage).toHaveURL(/\/tasks/);
      await expect(authenticatedPage.getByTestId("tasks-page")).toBeVisible({
        timeout: 15_000,
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
});
