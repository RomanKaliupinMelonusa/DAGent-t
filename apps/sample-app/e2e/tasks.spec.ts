// =============================================================================
// E2E — Kanban Task Board
// =============================================================================
// Tests the full task lifecycle: create → move → reload → verify persistence.
// Uses the demo-auth fixture for pre-authenticated pages.
// =============================================================================

import { test, expect } from "./fixtures/demo-auth.fixture";

test.describe("Kanban Task Board", () => {
  test("create task, move to In Progress, reload, verify persistence", async ({
    authenticatedPage,
  }) => {
    // --- Deep Diagnostic Interception ---
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

      // Verify the page loaded
      await expect(
        authenticatedPage.getByRole("heading", { name: "Task Board" }),
      ).toBeVisible({ timeout: 15_000 });

      // 2. Type a unique task title in the new task input
      const uniqueTitle = `E2E Task ${Date.now()}`;
      const input = authenticatedPage.getByTestId("new-task-input");
      await expect(input).toBeVisible();
      await input.fill(uniqueTitle);

      // 3. Click the create button → verify the task appears in the "To Do" column
      const submitBtn = authenticatedPage.getByTestId("new-task-submit");
      await submitBtn.click();

      const todoColumn = authenticatedPage.getByTestId("column-TODO");
      await expect(todoColumn.getByText(uniqueTitle)).toBeVisible({
        timeout: 15_000,
      });

      // 4. Click the "Start" button on the task → verify it moves to "In Progress"
      const taskCard = todoColumn
        .locator('[data-testid^="task-card-"]')
        .filter({ hasText: uniqueTitle });
      const startButton = taskCard.getByTestId("task-action-start");
      await startButton.click();

      const inProgressColumn =
        authenticatedPage.getByTestId("column-IN_PROGRESS");
      await expect(inProgressColumn.getByText(uniqueTitle)).toBeVisible({
        timeout: 15_000,
      });

      // 5. Reload the page
      await authenticatedPage.reload({ waitUntil: "domcontentloaded" });

      // 6. Verify the task persisted in the "In Progress" column after reload
      await expect(
        authenticatedPage.getByTestId("column-IN_PROGRESS"),
      ).toBeVisible({ timeout: 15_000 });
      await expect(
        authenticatedPage
          .getByTestId("column-IN_PROGRESS")
          .getByText(uniqueTitle),
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

  test("Task Board link is visible in navigation", async ({
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
      const taskBoardLink = authenticatedPage.getByRole("link", {
        name: "Task Board",
      });
      await expect(taskBoardLink).toBeVisible();

      // Click it and verify navigation
      await taskBoardLink.click();
      await expect(
        authenticatedPage.getByRole("heading", { name: "Task Board" }),
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
