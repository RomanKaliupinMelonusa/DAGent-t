// =============================================================================
// E2E — Kanban Task Board
// =============================================================================
// Tests task creation, drag-and-drop column moves, button fallback transitions,
// persistence after reload, and same-column drop no-op behaviour.
// Uses the demo-auth fixture for pre-authenticated pages.
// =============================================================================

import { test, expect } from "./fixtures/demo-auth.fixture";

test.describe("Kanban Task Board", () => {
  test("create task, drag to In Progress, reload and verify persistence", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;

    // --- Deep diagnostic interception ---
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
      // 1. Navigate to /tasks
      await page.goto("/tasks", { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: "Task Board" })).toBeVisible();

      // 2. Create a unique task
      const taskTitle = `E2E DnD Task ${Date.now()}`;
      await page.getByTestId("new-task-input").fill(taskTitle);

      // Wait for the POST response before asserting
      const createPromise = page.waitForResponse(
        (res) => res.url().includes("/tasks") && res.request().method() === "POST" && res.status() === 201,
      );
      await page.getByTestId("create-task-button").click();
      await createPromise;

      // 3. Verify the task appears in the "To Do" column
      const todoColumn = page.locator('[data-status="TODO"]');
      await expect(todoColumn.getByText(taskTitle)).toBeVisible({ timeout: 10_000 });

      // 4. Drag-and-drop test: drag task to "In Progress" column
      const taskCard = page.locator(`[data-task-id]`, { hasText: taskTitle });
      const inProgressColumn = page.locator('[data-status="IN_PROGRESS"]');
      await taskCard.dragTo(inProgressColumn);

      // Wait for the PATCH request to complete
      await page.waitForResponse(
        (res) => res.url().includes("/tasks/") && res.request().method() === "PATCH",
        { timeout: 10_000 },
      );

      // Verify task moved to In Progress column
      await expect(inProgressColumn.getByText(taskTitle)).toBeVisible({ timeout: 10_000 });

      // 5. Reload the page
      await page.reload({ waitUntil: "domcontentloaded" });

      // 6. Verify task persisted in In Progress after reload
      const inProgressAfterReload = page.locator('[data-status="IN_PROGRESS"]');
      await expect(inProgressAfterReload.getByText(taskTitle)).toBeVisible({
        timeout: 15_000,
      });
    } catch (error) {
      const diagnostics = [
        consoleLogs.length ? `Console errors:\n${consoleLogs.join("\n")}` : "",
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

  test("button fallback: move task through all statuses via buttons", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;

    // --- Deep diagnostic interception ---
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
      await page.goto("/tasks", { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: "Task Board" })).toBeVisible();

      // Create a second task for button fallback test
      const taskTitle = `E2E Button Task ${Date.now()}`;
      await page.getByTestId("new-task-input").fill(taskTitle);

      const createPromise = page.waitForResponse(
        (res) => res.url().includes("/tasks") && res.request().method() === "POST" && res.status() === 201,
      );
      await page.getByTestId("create-task-button").click();
      await createPromise;

      // Task is in To Do
      const todoColumn = page.locator('[data-status="TODO"]');
      await expect(todoColumn.getByText(taskTitle)).toBeVisible({ timeout: 10_000 });

      // Find the task card to get its ID for button test-ids
      const taskCard = page.locator("[data-task-id]", { hasText: taskTitle });
      const taskId = await taskCard.getAttribute("data-task-id");
      expect(taskId).toBeTruthy();

      // Click "Start" → move to IN_PROGRESS
      const startPromise = page.waitForResponse(
        (res) => res.url().includes(`/tasks/${taskId}/status`) && res.status() === 200,
      );
      await page.getByTestId(`start-task-${taskId}`).click();
      await startPromise;

      const inProgressColumn = page.locator('[data-status="IN_PROGRESS"]');
      await expect(inProgressColumn.getByText(taskTitle)).toBeVisible({ timeout: 10_000 });

      // Click "Done" → move to DONE
      const donePromise = page.waitForResponse(
        (res) => res.url().includes(`/tasks/${taskId}/status`) && res.status() === 200,
      );
      await page.getByTestId(`done-task-${taskId}`).click();
      await donePromise;

      const doneColumn = page.locator('[data-status="DONE"]');
      await expect(doneColumn.getByText(taskTitle)).toBeVisible({ timeout: 10_000 });

      // Click "Reopen" → move back to TODO
      const reopenPromise = page.waitForResponse(
        (res) => res.url().includes(`/tasks/${taskId}/status`) && res.status() === 200,
      );
      await page.getByTestId(`reopen-task-${taskId}`).click();
      await reopenPromise;

      await expect(todoColumn.getByText(taskTitle)).toBeVisible({ timeout: 10_000 });
    } catch (error) {
      const diagnostics = [
        consoleLogs.length ? `Console errors:\n${consoleLogs.join("\n")}` : "",
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

  test("same-column drop is a no-op — no PATCH API call", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;

    // --- Deep diagnostic interception ---
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
      await page.goto("/tasks", { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: "Task Board" })).toBeVisible();

      // Create a task for same-column test
      const taskTitle = `E2E NoOp Task ${Date.now()}`;
      await page.getByTestId("new-task-input").fill(taskTitle);

      const createPromise = page.waitForResponse(
        (res) => res.url().includes("/tasks") && res.request().method() === "POST" && res.status() === 201,
      );
      await page.getByTestId("create-task-button").click();
      await createPromise;

      const todoColumn = page.locator('[data-status="TODO"]');
      await expect(todoColumn.getByText(taskTitle)).toBeVisible({ timeout: 10_000 });

      // Set up route intercept to track PATCH calls
      let patchCalled = false;
      await page.route("**/tasks/*/status", (route) => {
        if (route.request().method() === "PATCH") {
          patchCalled = true;
        }
        return route.continue();
      });

      // Drag task within the same To Do column
      const taskCard = page.locator("[data-task-id]", { hasText: taskTitle });
      await taskCard.dragTo(todoColumn);

      // Assert no PATCH call was made
      expect(patchCalled).toBe(false);

      // Task should still be in To Do
      await expect(todoColumn.getByText(taskTitle)).toBeVisible();
    } catch (error) {
      const diagnostics = [
        consoleLogs.length ? `Console errors:\n${consoleLogs.join("\n")}` : "",
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
