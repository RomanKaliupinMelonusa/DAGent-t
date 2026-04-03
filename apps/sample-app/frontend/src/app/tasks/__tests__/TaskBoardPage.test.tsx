// =============================================================================
// Unit Tests — TaskBoardPage (Kanban Board)
// =============================================================================
// Tests cover: initial load, task creation, status transitions (optimistic UI),
// error handling, revert on API failure, column filtering, and edge cases.
// =============================================================================

import React from "react";
import { render, screen, waitFor, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";

// ---------------------------------------------------------------------------
// Mock apiClient — intercept apiFetch and ApiError
// ---------------------------------------------------------------------------

const mockApiFetch = jest.fn();

jest.mock("@/lib/apiClient", () => {
  class MockApiError extends Error {
    code: string;
    status?: number;
    constructor(code: string, message: string, status?: number) {
      super(message);
      this.name = "ApiError";
      this.code = code;
      this.status = status;
    }
  }
  return {
    apiFetch: (...args: unknown[]) => mockApiFetch(...args),
    ApiError: MockApiError,
  };
});

// Grab the mocked ApiError class for use in tests
const { ApiError } = jest.requireMock("@/lib/apiClient") as {
  ApiError: new (code: string, message: string, status?: number) => Error & { code: string };
};

// ---------------------------------------------------------------------------
// Mock next/navigation (usePathname not relevant here but page imports may need it)
// ---------------------------------------------------------------------------

jest.mock("next/navigation", () => ({
  usePathname: () => "/tasks",
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), prefetch: jest.fn() }),
}));

// ---------------------------------------------------------------------------
// Test data factory
// ---------------------------------------------------------------------------

function makeTask(overrides: Partial<{
  id: string;
  workspaceId: string;
  title: string;
  status: "TODO" | "IN_PROGRESS" | "DONE";
  createdAt: string;
  updatedAt: string;
}> = {}) {
  return {
    id: overrides.id ?? "task-1",
    workspaceId: overrides.workspaceId ?? "default",
    title: overrides.title ?? "Test Task",
    status: overrides.status ?? "TODO",
    createdAt: overrides.createdAt ?? "2026-04-01T12:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-04-01T12:00:00.000Z",
  };
}

// ---------------------------------------------------------------------------
// Import the component under test (after mocks are set up)
// ---------------------------------------------------------------------------

import TaskBoardPage from "../page";

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockApiFetch.mockReset();
});

// ---------------------------------------------------------------------------
// Tests: Initial Load
// ---------------------------------------------------------------------------

describe("TaskBoardPage", () => {
  describe("Initial Load", () => {
    it("shows loading state while fetching tasks", () => {
      // Never resolve the fetch
      mockApiFetch.mockReturnValue(new Promise(() => {}));

      render(<TaskBoardPage />);

      expect(screen.getByText("Loading tasks…")).toBeInTheDocument();
    });

    it("renders three columns after loading tasks", async () => {
      mockApiFetch.mockResolvedValueOnce([]);

      render(<TaskBoardPage />);

      await waitFor(() => {
        expect(screen.getByText("Task Board")).toBeInTheDocument();
      });

      expect(screen.getByText(/To Do/)).toBeInTheDocument();
      expect(screen.getByText(/In Progress/)).toBeInTheDocument();
      expect(screen.getByText(/Done/)).toBeInTheDocument();
    });

    it("renders tasks in correct columns", async () => {
      const tasks = [
        makeTask({ id: "1", title: "Todo Task", status: "TODO" }),
        makeTask({ id: "2", title: "Progress Task", status: "IN_PROGRESS" }),
        makeTask({ id: "3", title: "Done Task", status: "DONE" }),
      ];
      mockApiFetch.mockResolvedValueOnce(tasks);

      render(<TaskBoardPage />);

      await waitFor(() => {
        expect(screen.getByText("Todo Task")).toBeInTheDocument();
      });

      const todoColumn = screen.getByTestId("column-TODO");
      const progressColumn = screen.getByTestId("column-IN_PROGRESS");
      const doneColumn = screen.getByTestId("column-DONE");

      expect(within(todoColumn).getByText("Todo Task")).toBeInTheDocument();
      expect(within(progressColumn).getByText("Progress Task")).toBeInTheDocument();
      expect(within(doneColumn).getByText("Done Task")).toBeInTheDocument();
    });

    it("calls apiFetch with correct arguments on mount", async () => {
      mockApiFetch.mockResolvedValueOnce([]);

      render(<TaskBoardPage />);

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledTimes(1);
      });

      expect(mockApiFetch).toHaveBeenCalledWith(
        "/tasks",
        {},
        expect.anything(), // z.array(TaskSchema)
      );
    });

    it("shows error message when load fails", async () => {
      mockApiFetch.mockRejectedValueOnce(
        new ApiError("SERVER_ERROR", "Internal server error"),
      );

      render(<TaskBoardPage />);

      await waitFor(() => {
        expect(screen.getByTestId("task-error")).toBeInTheDocument();
      });

      expect(screen.getByText("Internal server error")).toBeInTheDocument();
    });

    it("shows generic error for non-ApiError failures", async () => {
      mockApiFetch.mockRejectedValueOnce(new Error("Network kaboom"));

      render(<TaskBoardPage />);

      await waitFor(() => {
        expect(screen.getByTestId("task-error")).toBeInTheDocument();
      });

      expect(screen.getByText("Failed to load tasks")).toBeInTheDocument();
    });

    it("shows 'No tasks' when columns are empty", async () => {
      mockApiFetch.mockResolvedValueOnce([]);

      render(<TaskBoardPage />);

      await waitFor(() => {
        expect(screen.getByText("Task Board")).toBeInTheDocument();
      });

      // IN_PROGRESS and DONE columns show "No tasks" (TODO has the form)
      const progressColumn = screen.getByTestId("column-IN_PROGRESS");
      const doneColumn = screen.getByTestId("column-DONE");

      expect(within(progressColumn).getByText("No tasks")).toBeInTheDocument();
      expect(within(doneColumn).getByText("No tasks")).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Tests: Task Creation
  // -------------------------------------------------------------------------

  describe("Task Creation", () => {
    it("renders the new task form in the TODO column", async () => {
      mockApiFetch.mockResolvedValueOnce([]);

      render(<TaskBoardPage />);

      await waitFor(() => {
        expect(screen.getByTestId("new-task-form")).toBeInTheDocument();
      });

      expect(screen.getByTestId("new-task-input")).toBeInTheDocument();
      expect(screen.getByTestId("new-task-submit")).toBeInTheDocument();
    });

    it("creates a task and adds it to the TODO column", async () => {
      const user = userEvent.setup();
      mockApiFetch.mockResolvedValueOnce([]); // initial load

      render(<TaskBoardPage />);

      await waitFor(() => {
        expect(screen.getByTestId("new-task-input")).toBeInTheDocument();
      });

      const createdTask = makeTask({ id: "new-1", title: "New Task", status: "TODO" });
      mockApiFetch.mockResolvedValueOnce(createdTask); // create

      await user.type(screen.getByTestId("new-task-input"), "New Task");
      await user.click(screen.getByTestId("new-task-submit"));

      await waitFor(() => {
        expect(screen.getByText("New Task")).toBeInTheDocument();
      });

      // Verify it's in the TODO column
      const todoColumn = screen.getByTestId("column-TODO");
      expect(within(todoColumn).getByText("New Task")).toBeInTheDocument();
    });

    it("clears the input after creating a task", async () => {
      const user = userEvent.setup();
      mockApiFetch.mockResolvedValueOnce([]);

      render(<TaskBoardPage />);

      await waitFor(() => {
        expect(screen.getByTestId("new-task-input")).toBeInTheDocument();
      });

      mockApiFetch.mockResolvedValueOnce(makeTask({ title: "My Task" }));

      await user.type(screen.getByTestId("new-task-input"), "My Task");
      await user.click(screen.getByTestId("new-task-submit"));

      await waitFor(() => {
        expect(screen.getByTestId("new-task-input")).toHaveValue("");
      });
    });

    it("disables submit button when input is empty", async () => {
      mockApiFetch.mockResolvedValueOnce([]);

      render(<TaskBoardPage />);

      await waitFor(() => {
        expect(screen.getByTestId("new-task-submit")).toBeInTheDocument();
      });

      expect(screen.getByTestId("new-task-submit")).toBeDisabled();
    });

    it("disables submit button when input is only whitespace", async () => {
      const user = userEvent.setup();
      mockApiFetch.mockResolvedValueOnce([]);

      render(<TaskBoardPage />);

      await waitFor(() => {
        expect(screen.getByTestId("new-task-input")).toBeInTheDocument();
      });

      await user.type(screen.getByTestId("new-task-input"), "   ");

      expect(screen.getByTestId("new-task-submit")).toBeDisabled();
    });

    it("shows error when task creation fails", async () => {
      const user = userEvent.setup();
      mockApiFetch.mockResolvedValueOnce([]); // initial load

      render(<TaskBoardPage />);

      await waitFor(() => {
        expect(screen.getByTestId("new-task-input")).toBeInTheDocument();
      });

      mockApiFetch.mockRejectedValueOnce(
        new ApiError("SERVER_ERROR", "Rate limit exceeded", 429),
      );

      await user.type(screen.getByTestId("new-task-input"), "Failing Task");
      await user.click(screen.getByTestId("new-task-submit"));

      await waitFor(() => {
        expect(screen.getByTestId("task-error")).toBeInTheDocument();
      });

      expect(screen.getByText("Rate limit exceeded")).toBeInTheDocument();
    });

    it("shows generic error for non-ApiError creation failure", async () => {
      const user = userEvent.setup();
      mockApiFetch.mockResolvedValueOnce([]); // initial load

      render(<TaskBoardPage />);

      await waitFor(() => {
        expect(screen.getByTestId("new-task-input")).toBeInTheDocument();
      });

      mockApiFetch.mockRejectedValueOnce(new Error("Network fail"));

      await user.type(screen.getByTestId("new-task-input"), "Task");
      await user.click(screen.getByTestId("new-task-submit"));

      await waitFor(() => {
        expect(screen.getByText("Failed to create task")).toBeInTheDocument();
      });
    });

    it("sends POST request with correct body", async () => {
      const user = userEvent.setup();
      mockApiFetch.mockResolvedValueOnce([]); // initial load

      render(<TaskBoardPage />);

      await waitFor(() => {
        expect(screen.getByTestId("new-task-input")).toBeInTheDocument();
      });

      mockApiFetch.mockResolvedValueOnce(makeTask({ title: "API Task" }));

      await user.type(screen.getByTestId("new-task-input"), "API Task");
      await user.click(screen.getByTestId("new-task-submit"));

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith(
          "/tasks",
          expect.objectContaining({
            method: "POST",
            body: JSON.stringify({ title: "API Task" }),
          }),
          expect.anything(),
        );
      });
    });
  });

  // -------------------------------------------------------------------------
  // Tests: Status Transitions
  // -------------------------------------------------------------------------

  describe("Status Transitions", () => {
    it("renders 'Start' button for TODO tasks", async () => {
      mockApiFetch.mockResolvedValueOnce([
        makeTask({ id: "1", title: "Todo Task", status: "TODO" }),
      ]);

      render(<TaskBoardPage />);

      await waitFor(() => {
        expect(screen.getByText("Todo Task")).toBeInTheDocument();
      });

      expect(screen.getByTestId("task-action-start")).toBeInTheDocument();
    });

    it("renders 'Done' and 'Back to To Do' buttons for IN_PROGRESS tasks", async () => {
      mockApiFetch.mockResolvedValueOnce([
        makeTask({ id: "1", title: "WIP Task", status: "IN_PROGRESS" }),
      ]);

      render(<TaskBoardPage />);

      await waitFor(() => {
        expect(screen.getByText("WIP Task")).toBeInTheDocument();
      });

      expect(screen.getByTestId("task-action-done")).toBeInTheDocument();
      expect(screen.getByTestId("task-action-back-to-to-do")).toBeInTheDocument();
    });

    it("renders 'Reopen' button for DONE tasks", async () => {
      mockApiFetch.mockResolvedValueOnce([
        makeTask({ id: "1", title: "Finished Task", status: "DONE" }),
      ]);

      render(<TaskBoardPage />);

      await waitFor(() => {
        expect(screen.getByText("Finished Task")).toBeInTheDocument();
      });

      expect(screen.getByTestId("task-action-reopen")).toBeInTheDocument();
    });

    it("optimistically moves task from TODO to IN_PROGRESS on 'Start'", async () => {
      const user = userEvent.setup();
      const todoTask = makeTask({ id: "1", title: "My Task", status: "TODO" });

      mockApiFetch.mockResolvedValueOnce([todoTask]); // load

      render(<TaskBoardPage />);

      await waitFor(() => {
        expect(screen.getByText("My Task")).toBeInTheDocument();
      });

      // Set up the PATCH response - resolve after we check for optimistic update
      const updatedTask = { ...todoTask, status: "IN_PROGRESS", updatedAt: "2026-04-01T13:00:00.000Z" };
      mockApiFetch.mockResolvedValueOnce(updatedTask);

      await user.click(screen.getByTestId("task-action-start"));

      // After click, task should be in IN_PROGRESS column (optimistic)
      await waitFor(() => {
        const progressColumn = screen.getByTestId("column-IN_PROGRESS");
        expect(within(progressColumn).getByText("My Task")).toBeInTheDocument();
      });
    });

    it("moves task from IN_PROGRESS to DONE on 'Done' click", async () => {
      const user = userEvent.setup();
      const task = makeTask({ id: "1", title: "WIP Task", status: "IN_PROGRESS" });

      mockApiFetch.mockResolvedValueOnce([task]); // load

      render(<TaskBoardPage />);

      await waitFor(() => {
        expect(screen.getByText("WIP Task")).toBeInTheDocument();
      });

      const updatedTask = { ...task, status: "DONE", updatedAt: "2026-04-01T14:00:00.000Z" };
      mockApiFetch.mockResolvedValueOnce(updatedTask);

      await user.click(screen.getByTestId("task-action-done"));

      await waitFor(() => {
        const doneColumn = screen.getByTestId("column-DONE");
        expect(within(doneColumn).getByText("WIP Task")).toBeInTheDocument();
      });
    });

    it("moves task from IN_PROGRESS back to TODO on 'Back to To Do' click", async () => {
      const user = userEvent.setup();
      const task = makeTask({ id: "1", title: "Backtrack Task", status: "IN_PROGRESS" });

      mockApiFetch.mockResolvedValueOnce([task]); // load

      render(<TaskBoardPage />);

      await waitFor(() => {
        expect(screen.getByText("Backtrack Task")).toBeInTheDocument();
      });

      const updatedTask = { ...task, status: "TODO", updatedAt: "2026-04-01T14:00:00.000Z" };
      mockApiFetch.mockResolvedValueOnce(updatedTask);

      await user.click(screen.getByTestId("task-action-back-to-to-do"));

      await waitFor(() => {
        const todoColumn = screen.getByTestId("column-TODO");
        expect(within(todoColumn).getByText("Backtrack Task")).toBeInTheDocument();
      });
    });

    it("moves task from DONE back to TODO on 'Reopen' click", async () => {
      const user = userEvent.setup();
      const task = makeTask({ id: "1", title: "Reopen Task", status: "DONE" });

      mockApiFetch.mockResolvedValueOnce([task]); // load

      render(<TaskBoardPage />);

      await waitFor(() => {
        expect(screen.getByText("Reopen Task")).toBeInTheDocument();
      });

      const updatedTask = { ...task, status: "TODO", updatedAt: "2026-04-01T14:00:00.000Z" };
      mockApiFetch.mockResolvedValueOnce(updatedTask);

      await user.click(screen.getByTestId("task-action-reopen"));

      await waitFor(() => {
        const todoColumn = screen.getByTestId("column-TODO");
        expect(within(todoColumn).getByText("Reopen Task")).toBeInTheDocument();
      });
    });

    it("sends PATCH request with correct arguments on status change", async () => {
      const user = userEvent.setup();
      const task = makeTask({ id: "task-42", title: "Patch Task", status: "TODO" });

      mockApiFetch.mockResolvedValueOnce([task]); // load

      render(<TaskBoardPage />);

      await waitFor(() => {
        expect(screen.getByText("Patch Task")).toBeInTheDocument();
      });

      mockApiFetch.mockResolvedValueOnce({ ...task, status: "IN_PROGRESS" });

      await user.click(screen.getByTestId("task-action-start"));

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith(
          "/tasks/task-42/status",
          expect.objectContaining({
            method: "PATCH",
            body: JSON.stringify({ status: "IN_PROGRESS" }),
          }),
          expect.anything(),
        );
      });
    });
  });

  // -------------------------------------------------------------------------
  // Tests: Optimistic Revert on Error
  // -------------------------------------------------------------------------

  describe("Optimistic Revert on Error", () => {
    it("reverts task to original column after status update API fails and reload completes", async () => {
      const user = userEvent.setup();
      const task = makeTask({ id: "1", title: "Revert Task", status: "TODO" });

      mockApiFetch.mockResolvedValueOnce([task]); // initial load

      render(<TaskBoardPage />);

      await waitFor(() => {
        expect(screen.getByText("Revert Task")).toBeInTheDocument();
      });

      // PATCH fails → triggers loadTasks() which reloads original state
      mockApiFetch.mockRejectedValueOnce(
        new ApiError("SERVER_ERROR", "Update failed"),
      );

      // The component calls loadTasks() on error which reloads tasks
      mockApiFetch.mockResolvedValueOnce([task]);

      await user.click(screen.getByTestId("task-action-start"));

      // After reload, task should be back in TODO (reverted)
      await waitFor(() => {
        const todoColumn = screen.getByTestId("column-TODO");
        expect(within(todoColumn).getByText("Revert Task")).toBeInTheDocument();
      });

      // Verify the PATCH call was made
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/tasks/1/status",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ status: "IN_PROGRESS" }),
        }),
        expect.anything(),
      );

      // Verify a reload was triggered (3 calls total: load + patch + reload)
      expect(mockApiFetch).toHaveBeenCalledTimes(3);
    });

    it("reloads tasks on failed status update for non-ApiError failures", async () => {
      const user = userEvent.setup();
      const task = makeTask({ id: "1", title: "Error Task", status: "TODO" });

      mockApiFetch.mockResolvedValueOnce([task]); // initial load

      render(<TaskBoardPage />);

      await waitFor(() => {
        expect(screen.getByText("Error Task")).toBeInTheDocument();
      });

      // PATCH fails with non-ApiError
      mockApiFetch.mockRejectedValueOnce(new Error("Connection lost"));
      // Reload returns original state
      mockApiFetch.mockResolvedValueOnce([task]);

      await user.click(screen.getByTestId("task-action-start"));

      // After reload completes, task is back in TODO
      await waitFor(() => {
        const todoColumn = screen.getByTestId("column-TODO");
        expect(within(todoColumn).getByText("Error Task")).toBeInTheDocument();
      });

      // Verify reload was triggered
      expect(mockApiFetch).toHaveBeenCalledTimes(3);
    });

    it("shows error when status update fails and reload also fails", async () => {
      const user = userEvent.setup();
      const task = makeTask({ id: "1", title: "Double Fail Task", status: "TODO" });

      mockApiFetch.mockResolvedValueOnce([task]); // initial load

      render(<TaskBoardPage />);

      await waitFor(() => {
        expect(screen.getByText("Double Fail Task")).toBeInTheDocument();
      });

      // PATCH fails
      mockApiFetch.mockRejectedValueOnce(
        new ApiError("SERVER_ERROR", "Update failed"),
      );

      // Reload also fails — so loadTasks sets its own error
      mockApiFetch.mockRejectedValueOnce(
        new ApiError("SERVER_ERROR", "Reload failed too"),
      );

      await user.click(screen.getByTestId("task-action-start"));

      // Error from loadTasks should be visible since it ran after the status error
      await waitFor(() => {
        expect(screen.getByTestId("task-error")).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // Tests: Column counts
  // -------------------------------------------------------------------------

  describe("Column counts", () => {
    it("displays correct task counts in column headers", async () => {
      const tasks = [
        makeTask({ id: "1", status: "TODO" }),
        makeTask({ id: "2", status: "TODO" }),
        makeTask({ id: "3", status: "IN_PROGRESS" }),
        makeTask({ id: "4", status: "DONE" }),
        makeTask({ id: "5", status: "DONE" }),
        makeTask({ id: "6", status: "DONE" }),
      ];
      mockApiFetch.mockResolvedValueOnce(tasks);

      render(<TaskBoardPage />);

      await waitFor(() => {
        expect(screen.getByText("(2)")).toBeInTheDocument();
      });

      expect(screen.getByText("(1)")).toBeInTheDocument();
      expect(screen.getByText("(3)")).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Tests: Multiple tasks
  // -------------------------------------------------------------------------

  describe("Multiple tasks in columns", () => {
    it("renders multiple tasks in the same column", async () => {
      const tasks = [
        makeTask({ id: "1", title: "First", status: "TODO" }),
        makeTask({ id: "2", title: "Second", status: "TODO" }),
        makeTask({ id: "3", title: "Third", status: "TODO" }),
      ];
      mockApiFetch.mockResolvedValueOnce(tasks);

      render(<TaskBoardPage />);

      await waitFor(() => {
        expect(screen.getByText("First")).toBeInTheDocument();
      });

      const todoColumn = screen.getByTestId("column-TODO");
      expect(within(todoColumn).getByText("First")).toBeInTheDocument();
      expect(within(todoColumn).getByText("Second")).toBeInTheDocument();
      expect(within(todoColumn).getByText("Third")).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Tests: Page header and description
  // -------------------------------------------------------------------------

  describe("Page header", () => {
    it("renders the page title and description", async () => {
      mockApiFetch.mockResolvedValueOnce([]);

      render(<TaskBoardPage />);

      await waitFor(() => {
        expect(screen.getByText("Task Board")).toBeInTheDocument();
      });

      expect(
        screen.getByText("Create tasks and move them across columns."),
      ).toBeInTheDocument();
    });
  });
});
