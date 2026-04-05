// =============================================================================
// E2E — Kanban Task Board (Drag-and-Drop + Button Fallback)
// =============================================================================
// Tests the full task board workflow: create tasks, drag-and-drop between
// columns, button-based status transitions, persistence across reload,
// and same-column drop no-op validation.
// =============================================================================

import { test, expect } from "./fixtures/demo-auth.fixture";

test.describe("Task Board", () => {
  test("create task, drag to In Progress, verify persistence after reload", async ({
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
      // Navigate to /tasks
      await page.goto("/tasks");
      await expect(page.getByRole("heading", { name: "Task Board" })).toBeVisible({ timeout: 15_000 });

      // Wait for loading to complete
      await expect(page.getByTestId("task-board-columns")).toBeVisible({ timeout: 15_000 });

      // Create a unique task
      const taskTitle = `DnD Test ${Date.now()}`;
      const input = page.getByTestId("new-task-input");
      await expect(input).toBeVisible();
      await input.fill(taskTitle);

      // Setup wait for POST response before clicking create
      const createPromise = page.waitForResponse(
        (res) => res.url().includes("/tasks") && res.request().method() === "POST" && res.status() === 201,
      );
      await page.getByTestId("create-task-button").click();
      await createPromise;

      // Verify task appears in To Do column
      const todoColumn = page.getByTestId("column-TODO");
      await expect(todoColumn.getByText(taskTitle)).toBeVisible({ timeout: 10_000 });

      // --- Drag-and-drop to In Progress ---
      const taskCard = page.locator(`[data-task-id]`, { hasText: taskTitle });
      const inProgressColumn = page.getByTestId("column-IN_PROGRESS");

      // Setup wait for PATCH response
      const patchPromise = page.waitForResponse(
        (res) => res.url().includes("/tasks/") && res.request().method() === "PATCH" && res.status() === 200,
      );
      await taskCard.dragTo(inProgressColumn);
      await patchPromise;

      // Verify task moved to In Progress
      await expect(inProgressColumn.getByText(taskTitle)).toBeVisible({ timeout: 10_000 });

      // --- Reload and verify persistence ---
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("task-board-columns")).toBeVisible({ timeout: 15_000 });

      const inProgressAfterReload = page.getByTestId("column-IN_PROGRESS");
      await expect(inProgressAfterReload.getByText(taskTitle)).toBeVisible({ timeout: 10_000 });
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

  test("button fallback: move task through all statuses via buttons", async ({
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
      await page.goto("/tasks");
      await expect(page.getByTestId("task-board-columns")).toBeVisible({ timeout: 15_000 });

      // Create a task for button testing
      const taskTitle = `Button Test ${Date.now()}`;
      await page.getByTestId("new-task-input").fill(taskTitle);

      const createPromise = page.waitForResponse(
        (res) => res.url().includes("/tasks") && res.request().method() === "POST" && res.status() === 201,
      );
      await page.getByTestId("create-task-button").click();
      const createResponse = await createPromise;
      const createdTask = await createResponse.json();
      const taskId = createdTask.id;

      // Verify in To Do
      await expect(page.getByTestId("column-TODO").getByText(taskTitle)).toBeVisible({ timeout: 10_000 });

      // Click "Start" → move to IN_PROGRESS
      const startPromise = page.waitForResponse(
        (res) => res.url().includes(`/tasks/${taskId}/status`) && res.status() === 200,
      );
      await page.getByTestId(`start-task-${taskId}`).click();
      await startPromise;
      await expect(page.getByTestId("column-IN_PROGRESS").getByText(taskTitle)).toBeVisible({ timeout: 10_000 });

      // Click "Done" → move to DONE
      const donePromise = page.waitForResponse(
        (res) => res.url().includes(`/tasks/${taskId}/status`) && res.status() === 200,
      );
      await page.getByTestId(`done-task-${taskId}`).click();
      await donePromise;
      await expect(page.getByTestId("column-DONE").getByText(taskTitle)).toBeVisible({ timeout: 10_000 });

      // Click "Reopen" → move back to TODO
      const reopenPromise = page.waitForResponse(
        (res) => res.url().includes(`/tasks/${taskId}/status`) && res.status() === 200,
      );
      await page.getByTestId(`reopen-task-${taskId}`).click();
      await reopenPromise;
      await expect(page.getByTestId("column-TODO").getByText(taskTitle)).toBeVisible({ timeout: 10_000 });
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

  test("same-column drop is a no-op (no PATCH fired)", async ({
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
      await page.goto("/tasks");
      await expect(page.getByTestId("task-board-columns")).toBeVisible({ timeout: 15_000 });

      // Create a task
      const taskTitle = `NoOp Test ${Date.now()}`;
      await page.getByTestId("new-task-input").fill(taskTitle);

      const createPromise = page.waitForResponse(
        (res) => res.url().includes("/tasks") && res.request().method() === "POST" && res.status() === 201,
      );
      await page.getByTestId("create-task-button").click();
      await createPromise;

      // Verify task is in To Do
      const todoColumn = page.getByTestId("column-TODO");
      await expect(todoColumn.getByText(taskTitle)).toBeVisible({ timeout: 10_000 });

      // Track PATCH requests
      let patchFired = false;
      await page.route("**/tasks/*/status", (route) => {
        if (route.request().method() === "PATCH") {
          patchFired = true;
        }
        route.continue();
      });

      // Drag task card and drop onto the same TODO column
      const taskCard = page.locator(`[data-task-id]`, { hasText: taskTitle });
      await taskCard.dragTo(todoColumn);

      // Verify no PATCH was fired
      // Small settle time for any async handlers
      await page.waitForFunction(() => true, null, { timeout: 1000 }).catch(() => {});
      expect(patchFired).toBe(false);

      // Task should still be in To Do
      await expect(todoColumn.getByText(taskTitle)).toBeVisible();
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
