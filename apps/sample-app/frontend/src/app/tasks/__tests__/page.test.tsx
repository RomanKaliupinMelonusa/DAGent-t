// =============================================================================
// Unit Tests — Kanban Task Board (TasksPage)
// =============================================================================
// Tests cover: initial loading, rendering 3 columns, creating tasks, moving
// tasks (optimistic + server reconciliation), error handling, and rollback
// on API failure.
// =============================================================================

import React from "react";
import { render, screen, waitFor, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";

// ---------------------------------------------------------------------------
// Mock apiClient — intercept apiFetch and ApiError
// ---------------------------------------------------------------------------

const mockApiFetch = jest.fn();

jest.mock("@/lib/apiClient", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  ApiError: class ApiError extends Error {
    code: string;
    status?: number;
    constructor(code: string, message: string, status?: number) {
      super(message);
      this.name = "ApiError";
      this.code = code;
      this.status = status;
    }
  },
}));

// Import ApiError from the mock for instanceof checks in tests
const { ApiError } = jest.requireMock("@/lib/apiClient") as {
  ApiError: new (code: string, message: string, status?: number) => Error & {
    code: string;
    status?: number;
  };
};

// Import the component under test AFTER mocks are set up
import TasksPage from "../page";

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

const NOW = "2026-04-01T12:00:00.000Z";

function makeTask(overrides: Partial<{
  id: string;
  workspaceId: string;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}> = {}) {
  return {
    id: overrides.id ?? "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    workspaceId: overrides.workspaceId ?? "default",
    title: overrides.title ?? "Test Task",
    status: overrides.status ?? "TODO",
    createdAt: overrides.createdAt ?? NOW,
    updatedAt: overrides.updatedAt ?? NOW,
  };
}

const SAMPLE_TASKS = [
  makeTask({ id: "11111111-1111-1111-1111-111111111111", title: "Design mockups", status: "TODO" }),
  makeTask({ id: "22222222-2222-2222-2222-222222222222", title: "Build API", status: "IN_PROGRESS" }),
  makeTask({ id: "33333333-3333-3333-3333-333333333333", title: "Write docs", status: "DONE" }),
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve the initial GET /tasks call with the given tasks array. */
function mockLoadTasks(tasks = SAMPLE_TASKS) {
  mockApiFetch.mockResolvedValueOnce(tasks);
}

/** Wait for the loading spinner to disappear and the page to render. */
async function waitForPageLoad() {
  await waitFor(() => {
    expect(screen.getByTestId("tasks-page")).toBeInTheDocument();
  });
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockApiFetch.mockReset();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TasksPage", () => {
  // =========================================================================
  // Loading State
  // =========================================================================

  describe("loading state", () => {
    it("shows loading indicator before tasks are fetched", () => {
      // Never resolve
      mockApiFetch.mockReturnValueOnce(new Promise(() => {}));
      render(<TasksPage />);

      expect(screen.getByText("Loading tasks…")).toBeInTheDocument();
    });

    it("hides loading indicator after tasks are fetched", async () => {
      mockLoadTasks();
      render(<TasksPage />);

      await waitForPageLoad();
      expect(screen.queryByText("Loading tasks…")).not.toBeInTheDocument();
    });
  });

  // =========================================================================
  // Column Rendering
  // =========================================================================

  describe("column rendering", () => {
    it("renders three columns: To Do, In Progress, Done", async () => {
      mockLoadTasks();
      render(<TasksPage />);
      await waitForPageLoad();

      expect(screen.getByTestId("column-TODO")).toBeInTheDocument();
      expect(screen.getByTestId("column-IN_PROGRESS")).toBeInTheDocument();
      expect(screen.getByTestId("column-DONE")).toBeInTheDocument();
    });

    it("displays column headers with task counts", async () => {
      mockLoadTasks();
      render(<TasksPage />);
      await waitForPageLoad();

      const todoCol = screen.getByTestId("column-TODO");
      const inProgressCol = screen.getByTestId("column-IN_PROGRESS");
      const doneCol = screen.getByTestId("column-DONE");

      expect(within(todoCol).getByText(/To Do/)).toBeInTheDocument();
      expect(within(todoCol).getByText("(1)")).toBeInTheDocument();
      expect(within(inProgressCol).getByText(/In Progress/)).toBeInTheDocument();
      expect(within(inProgressCol).getByText("(1)")).toBeInTheDocument();
      expect(within(doneCol).getByText(/Done/)).toBeInTheDocument();
      expect(within(doneCol).getByText("(1)")).toBeInTheDocument();
    });

    it("places tasks in the correct columns", async () => {
      mockLoadTasks();
      render(<TasksPage />);
      await waitForPageLoad();

      const todoCol = screen.getByTestId("column-TODO");
      const inProgressCol = screen.getByTestId("column-IN_PROGRESS");
      const doneCol = screen.getByTestId("column-DONE");

      expect(within(todoCol).getByText("Design mockups")).toBeInTheDocument();
      expect(within(inProgressCol).getByText("Build API")).toBeInTheDocument();
      expect(within(doneCol).getByText("Write docs")).toBeInTheDocument();
    });

    it("shows 'No tasks' in empty columns", async () => {
      mockLoadTasks([makeTask({ status: "TODO", title: "Only task" })]);
      render(<TasksPage />);
      await waitForPageLoad();

      const inProgressCol = screen.getByTestId("column-IN_PROGRESS");
      const doneCol = screen.getByTestId("column-DONE");

      expect(within(inProgressCol).getByText("No tasks")).toBeInTheDocument();
      expect(within(doneCol).getByText("No tasks")).toBeInTheDocument();
    });

    it("renders the page heading", async () => {
      mockLoadTasks();
      render(<TasksPage />);
      await waitForPageLoad();

      expect(screen.getByText("Task Board")).toBeInTheDocument();
    });
  });

  // =========================================================================
  // New Task Input
  // =========================================================================

  describe("new task input", () => {
    it("renders the new task form in the To Do column", async () => {
      mockLoadTasks();
      render(<TasksPage />);
      await waitForPageLoad();

      const todoCol = screen.getByTestId("column-TODO");
      expect(within(todoCol).getByTestId("new-task-form")).toBeInTheDocument();
      expect(within(todoCol).getByTestId("new-task-input")).toBeInTheDocument();
      expect(within(todoCol).getByTestId("create-task-button")).toBeInTheDocument();
    });

    it("disables the Add button when input is empty", async () => {
      mockLoadTasks();
      render(<TasksPage />);
      await waitForPageLoad();

      expect(screen.getByTestId("create-task-button")).toBeDisabled();
    });

    it("enables the Add button when input has text", async () => {
      const user = userEvent.setup();
      mockLoadTasks();
      render(<TasksPage />);
      await waitForPageLoad();

      await user.type(screen.getByTestId("new-task-input"), "New task");
      expect(screen.getByTestId("create-task-button")).toBeEnabled();
    });
  });

  // =========================================================================
  // Create Task
  // =========================================================================

  describe("creating a task", () => {
    it("calls apiFetch with POST /tasks and the title", async () => {
      const user = userEvent.setup();
      mockLoadTasks();
      render(<TasksPage />);
      await waitForPageLoad();

      const createdTask = makeTask({ id: "44444444-4444-4444-4444-444444444444", title: "New feature", status: "TODO" });
      mockApiFetch.mockResolvedValueOnce(createdTask);

      await user.type(screen.getByTestId("new-task-input"), "New feature");
      await user.click(screen.getByTestId("create-task-button"));

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith(
          "/tasks",
          expect.objectContaining({
            method: "POST",
            body: JSON.stringify({ title: "New feature" }),
          }),
          expect.anything(),
        );
      });
    });

    it("adds the created task to the To Do column", async () => {
      const user = userEvent.setup();
      mockLoadTasks([]);
      render(<TasksPage />);
      await waitForPageLoad();

      const createdTask = makeTask({ id: "44444444-4444-4444-4444-444444444444", title: "Brand new task", status: "TODO" });
      mockApiFetch.mockResolvedValueOnce(createdTask);

      await user.type(screen.getByTestId("new-task-input"), "Brand new task");
      await user.click(screen.getByTestId("create-task-button"));

      await waitFor(() => {
        const todoCol = screen.getByTestId("column-TODO");
        expect(within(todoCol).getByText("Brand new task")).toBeInTheDocument();
      });
    });

    it("clears the input after successful creation", async () => {
      const user = userEvent.setup();
      mockLoadTasks([]);
      render(<TasksPage />);
      await waitForPageLoad();

      const createdTask = makeTask({ title: "Temp task", status: "TODO" });
      mockApiFetch.mockResolvedValueOnce(createdTask);

      await user.type(screen.getByTestId("new-task-input"), "Temp task");
      await user.click(screen.getByTestId("create-task-button"));

      await waitFor(() => {
        expect(screen.getByTestId("new-task-input")).toHaveValue("");
      });
    });

    it("shows an error when task creation fails", async () => {
      const user = userEvent.setup();
      mockLoadTasks([]);
      render(<TasksPage />);
      await waitForPageLoad();

      mockApiFetch.mockRejectedValueOnce(
        new ApiError("SERVER_ERROR", "Internal Server Error", 500),
      );

      await user.type(screen.getByTestId("new-task-input"), "Fail task");
      await user.click(screen.getByTestId("create-task-button"));

      await waitFor(() => {
        expect(screen.getByTestId("tasks-error")).toBeInTheDocument();
        expect(screen.getByTestId("tasks-error")).toHaveTextContent("Internal Server Error");
      });
    });

    it("handles Enter key to create task", async () => {
      const user = userEvent.setup();
      mockLoadTasks([]);
      render(<TasksPage />);
      await waitForPageLoad();

      const createdTask = makeTask({ title: "Enter task", status: "TODO" });
      mockApiFetch.mockResolvedValueOnce(createdTask);

      const input = screen.getByTestId("new-task-input");
      await user.type(input, "Enter task");
      await user.keyboard("{Enter}");

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith(
          "/tasks",
          expect.objectContaining({
            method: "POST",
            body: JSON.stringify({ title: "Enter task" }),
          }),
          expect.anything(),
        );
      });
    });

    it("does not create task with empty or whitespace-only title", async () => {
      const user = userEvent.setup();
      mockLoadTasks([]);
      render(<TasksPage />);
      await waitForPageLoad();

      // The button should be disabled when only whitespace
      const input = screen.getByTestId("new-task-input");
      await user.type(input, "   ");

      // Button should still be disabled (newTitle.trim() is empty)
      expect(screen.getByTestId("create-task-button")).toBeDisabled();
    });
  });

  // =========================================================================
  // Move Task — Transition Buttons
  // =========================================================================

  describe("task movement buttons", () => {
    it("shows 'Start' button on TODO tasks", async () => {
      mockLoadTasks([makeTask({ id: "task-1", status: "TODO", title: "Task A" })]);
      render(<TasksPage />);
      await waitForPageLoad();

      expect(screen.getByTestId("move-task-1-IN_PROGRESS")).toHaveTextContent("Start");
    });

    it("shows 'Done' and 'Back to To Do' buttons on IN_PROGRESS tasks", async () => {
      mockLoadTasks([makeTask({ id: "task-2", status: "IN_PROGRESS", title: "Task B" })]);
      render(<TasksPage />);
      await waitForPageLoad();

      expect(screen.getByTestId("move-task-2-DONE")).toHaveTextContent("Done");
      expect(screen.getByTestId("move-task-2-TODO")).toHaveTextContent("Back to To Do");
    });

    it("shows 'Reopen' button on DONE tasks", async () => {
      mockLoadTasks([makeTask({ id: "task-3", status: "DONE", title: "Task C" })]);
      render(<TasksPage />);
      await waitForPageLoad();

      expect(screen.getByTestId("move-task-3-TODO")).toHaveTextContent("Reopen");
    });
  });

  // =========================================================================
  // Optimistic Move
  // =========================================================================

  describe("optimistic task movement", () => {
    it("moves a task from TODO to IN_PROGRESS optimistically", async () => {
      const user = userEvent.setup();
      const taskId = "11111111-1111-1111-1111-111111111111";
      const movedTask = makeTask({ id: taskId, title: "Design mockups", status: "IN_PROGRESS" });

      // Initial load: one task in TODO
      mockLoadTasks([makeTask({ id: taskId, title: "Design mockups", status: "TODO" })]);
      render(<TasksPage />);
      await waitForPageLoad();

      // Server responds with updated task
      mockApiFetch.mockResolvedValueOnce(movedTask);

      await user.click(screen.getByTestId(`move-${taskId}-IN_PROGRESS`));

      // After optimistic update, the task should appear in IN_PROGRESS column
      await waitFor(() => {
        const inProgressCol = screen.getByTestId("column-IN_PROGRESS");
        expect(within(inProgressCol).getByText("Design mockups")).toBeInTheDocument();
      });
    });

    it("calls apiFetch with PATCH and the new status", async () => {
      const user = userEvent.setup();
      const taskId = "11111111-1111-1111-1111-111111111111";

      mockLoadTasks([makeTask({ id: taskId, title: "Design mockups", status: "TODO" })]);
      render(<TasksPage />);
      await waitForPageLoad();

      const movedTask = makeTask({ id: taskId, title: "Design mockups", status: "IN_PROGRESS" });
      mockApiFetch.mockResolvedValueOnce(movedTask);

      await user.click(screen.getByTestId(`move-${taskId}-IN_PROGRESS`));

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith(
          `/tasks/${taskId}/status`,
          expect.objectContaining({
            method: "PATCH",
            body: JSON.stringify({ status: "IN_PROGRESS" }),
          }),
          expect.anything(),
        );
      });
    });

    it("moves task from IN_PROGRESS to DONE", async () => {
      const user = userEvent.setup();
      const taskId = "22222222-2222-2222-2222-222222222222";
      const movedTask = makeTask({ id: taskId, title: "Build API", status: "DONE" });

      mockLoadTasks([makeTask({ id: taskId, title: "Build API", status: "IN_PROGRESS" })]);
      render(<TasksPage />);
      await waitForPageLoad();

      mockApiFetch.mockResolvedValueOnce(movedTask);
      await user.click(screen.getByTestId(`move-${taskId}-DONE`));

      await waitFor(() => {
        const doneCol = screen.getByTestId("column-DONE");
        expect(within(doneCol).getByText("Build API")).toBeInTheDocument();
      });
    });

    it("moves task from IN_PROGRESS back to TODO", async () => {
      const user = userEvent.setup();
      const taskId = "22222222-2222-2222-2222-222222222222";
      const movedTask = makeTask({ id: taskId, title: "Build API", status: "TODO" });

      mockLoadTasks([makeTask({ id: taskId, title: "Build API", status: "IN_PROGRESS" })]);
      render(<TasksPage />);
      await waitForPageLoad();

      mockApiFetch.mockResolvedValueOnce(movedTask);
      await user.click(screen.getByTestId(`move-${taskId}-TODO`));

      await waitFor(() => {
        const todoCol = screen.getByTestId("column-TODO");
        expect(within(todoCol).getByText("Build API")).toBeInTheDocument();
      });
    });

    it("reopens a DONE task back to TODO", async () => {
      const user = userEvent.setup();
      const taskId = "33333333-3333-3333-3333-333333333333";
      const movedTask = makeTask({ id: taskId, title: "Write docs", status: "TODO" });

      mockLoadTasks([makeTask({ id: taskId, title: "Write docs", status: "DONE" })]);
      render(<TasksPage />);
      await waitForPageLoad();

      mockApiFetch.mockResolvedValueOnce(movedTask);
      await user.click(screen.getByTestId(`move-${taskId}-TODO`));

      await waitFor(() => {
        const todoCol = screen.getByTestId("column-TODO");
        expect(within(todoCol).getByText("Write docs")).toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // Optimistic Rollback
  // =========================================================================

  describe("optimistic rollback on API failure", () => {
    it("reverts the task to its original column on move failure", async () => {
      const user = userEvent.setup();
      const taskId = "11111111-1111-1111-1111-111111111111";

      mockLoadTasks([makeTask({ id: taskId, title: "Stuck task", status: "TODO" })]);
      render(<TasksPage />);
      await waitForPageLoad();

      // Fail the PATCH request
      mockApiFetch.mockRejectedValueOnce(
        new ApiError("SERVER_ERROR", "Server error", 500),
      );

      await user.click(screen.getByTestId(`move-${taskId}-IN_PROGRESS`));

      // After failure, task should revert to TODO
      await waitFor(() => {
        const todoCol = screen.getByTestId("column-TODO");
        expect(within(todoCol).getByText("Stuck task")).toBeInTheDocument();
      });
    });

    it("displays an error message on move failure", async () => {
      const user = userEvent.setup();
      const taskId = "11111111-1111-1111-1111-111111111111";

      mockLoadTasks([makeTask({ id: taskId, title: "Error task", status: "TODO" })]);
      render(<TasksPage />);
      await waitForPageLoad();

      mockApiFetch.mockRejectedValueOnce(
        new ApiError("SERVER_ERROR", "Move failed: server error", 500),
      );

      await user.click(screen.getByTestId(`move-${taskId}-IN_PROGRESS`));

      await waitFor(() => {
        expect(screen.getByTestId("tasks-error")).toHaveTextContent("Move failed: server error");
      });
    });
  });

  // =========================================================================
  // Error Handling — Load Tasks
  // =========================================================================

  describe("error handling on load", () => {
    it("displays error when initial task load fails", async () => {
      mockApiFetch.mockRejectedValueOnce(
        new ApiError("NETWORK_ERROR", "Network error", undefined),
      );
      render(<TasksPage />);

      await waitFor(() => {
        expect(screen.getByTestId("tasks-error")).toBeInTheDocument();
        expect(screen.getByTestId("tasks-error")).toHaveTextContent("Network error");
      });
    });

    it("displays error from non-ApiError exceptions", async () => {
      mockApiFetch.mockRejectedValueOnce(new Error("Something unexpected"));
      render(<TasksPage />);

      await waitFor(() => {
        expect(screen.getByTestId("tasks-error")).toBeInTheDocument();
        expect(screen.getByTestId("tasks-error")).toHaveTextContent("Something unexpected");
      });
    });
  });

  // =========================================================================
  // Task Card Details
  // =========================================================================

  describe("task card rendering", () => {
    it("displays task titles via data-testid", async () => {
      mockLoadTasks();
      render(<TasksPage />);
      await waitForPageLoad();

      expect(screen.getByTestId("task-card-11111111-1111-1111-1111-111111111111")).toBeInTheDocument();
      expect(screen.getByTestId("task-card-22222222-2222-2222-2222-222222222222")).toBeInTheDocument();
      expect(screen.getByTestId("task-card-33333333-3333-3333-3333-333333333333")).toBeInTheDocument();
    });

    it("shows formatted date on task cards", async () => {
      mockLoadTasks([makeTask({ id: "task-date", title: "Dated task", updatedAt: "2026-04-01T12:00:00.000Z" })]);
      render(<TasksPage />);
      await waitForPageLoad();

      // The date format depends on locale, just check it's present
      const card = screen.getByTestId("task-card-task-date");
      expect(within(card).getByText("Dated task")).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Multiple tasks in one column
  // =========================================================================

  describe("multiple tasks in a column", () => {
    it("correctly shows multiple tasks in the same column", async () => {
      const tasks = [
        makeTask({ id: "a1", title: "Task A1", status: "TODO" }),
        makeTask({ id: "a2", title: "Task A2", status: "TODO" }),
        makeTask({ id: "a3", title: "Task A3", status: "TODO" }),
      ];
      mockLoadTasks(tasks);
      render(<TasksPage />);
      await waitForPageLoad();

      const todoCol = screen.getByTestId("column-TODO");
      expect(within(todoCol).getByText("Task A1")).toBeInTheDocument();
      expect(within(todoCol).getByText("Task A2")).toBeInTheDocument();
      expect(within(todoCol).getByText("Task A3")).toBeInTheDocument();
      expect(within(todoCol).getByText("(3)")).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Empty State
  // =========================================================================

  describe("empty state", () => {
    it("shows 'No tasks' when there are no tasks at all", async () => {
      mockLoadTasks([]);
      render(<TasksPage />);
      await waitForPageLoad();

      // IN_PROGRESS and DONE should show "No tasks"
      // TODO column has the new-task form, so it might not show "No tasks"
      const inProgressCol = screen.getByTestId("column-IN_PROGRESS");
      const doneCol = screen.getByTestId("column-DONE");

      expect(within(inProgressCol).getByText("No tasks")).toBeInTheDocument();
      expect(within(doneCol).getByText("No tasks")).toBeInTheDocument();
    });
  });
});
