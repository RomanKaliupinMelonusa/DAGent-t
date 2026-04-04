// =============================================================================
// Unit Tests — TaskBoardPage (Kanban board with drag-and-drop + buttons)
// =============================================================================
// Tests the three-column Kanban board: rendering, task creation, drag-and-drop
// event handlers, fallback status-transition buttons, optimistic UI, and error
// handling.
// =============================================================================

import React from "react";
import { render, screen, within, waitFor, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock next/navigation
jest.mock("next/navigation", () => ({
  usePathname: () => "/tasks",
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), prefetch: jest.fn() }),
}));

// Mock apiClient — we control all API responses
const mockApiFetch = jest.fn();
jest.mock("@/lib/apiClient", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  ApiError: class ApiError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
      this.name = "ApiError";
    }
  },
}));

// Import the page component AFTER mocks are set up
import TaskBoardPage from "../page";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

function makeTask(overrides: Partial<{
  id: string;
  title: string;
  status: string;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
}> = {}) {
  return {
    id: overrides.id ?? "task-1",
    workspaceId: overrides.workspaceId ?? "default",
    title: overrides.title ?? "Test Task",
    status: overrides.status ?? "TODO",
    createdAt: overrides.createdAt ?? "2026-04-04T12:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-04-04T12:00:00.000Z",
  };
}

const TASK_TODO = makeTask({ id: "task-todo-1", title: "Todo Task", status: "TODO" });
const TASK_IN_PROGRESS = makeTask({ id: "task-ip-1", title: "In Progress Task", status: "IN_PROGRESS" });
const TASK_DONE = makeTask({ id: "task-done-1", title: "Done Task", status: "DONE" });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPage() {
  return render(<TaskBoardPage />);
}

/** Create a minimal DragEvent-like data for fireEvent */
function createDragData(taskId: string) {
  const data: Record<string, string> = {};
  return {
    dataTransfer: {
      setData: (key: string, value: string) => { data[key] = value; },
      getData: (key: string) => data[key] ?? "",
      effectAllowed: "move",
      dropEffect: "move",
    },
  };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockApiFetch.mockReset();
});

// ---------------------------------------------------------------------------
// Tests: Rendering & loading
// ---------------------------------------------------------------------------

describe("TaskBoardPage", () => {
  describe("Loading state", () => {
    it("shows loading text while fetching tasks", () => {
      // Never resolve to keep loading state
      mockApiFetch.mockReturnValue(new Promise(() => {}));
      renderPage();
      expect(screen.getByText("Loading tasks…")).toBeInTheDocument();
    });
  });

  describe("Rendering columns", () => {
    it("renders three columns with correct labels", async () => {
      mockApiFetch.mockResolvedValueOnce([]);
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("To Do")).toBeInTheDocument();
      });
      expect(screen.getByText("In Progress")).toBeInTheDocument();
      expect(screen.getByText("Done")).toBeInTheDocument();
    });

    it("renders columns with correct ARIA attributes", async () => {
      mockApiFetch.mockResolvedValueOnce([]);
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole("list", { name: "To Do column" })).toBeInTheDocument();
      });
      expect(screen.getByRole("list", { name: "In Progress column" })).toBeInTheDocument();
      expect(screen.getByRole("list", { name: "Done column" })).toBeInTheDocument();
    });

    it("renders columns with data-status attributes", async () => {
      mockApiFetch.mockResolvedValueOnce([]);
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole("list", { name: "To Do column" })).toHaveAttribute("data-status", "TODO");
      });
      expect(screen.getByRole("list", { name: "In Progress column" })).toHaveAttribute("data-status", "IN_PROGRESS");
      expect(screen.getByRole("list", { name: "Done column" })).toHaveAttribute("data-status", "DONE");
    });

    it("shows task counts in column headers", async () => {
      mockApiFetch.mockResolvedValueOnce([TASK_TODO, TASK_IN_PROGRESS, TASK_DONE]);
      renderPage();

      await waitFor(() => {
        const todoCol = screen.getByRole("list", { name: "To Do column" });
        expect(within(todoCol).getByText("(1)")).toBeInTheDocument();
      });
    });
  });

  describe("Task rendering", () => {
    it("renders tasks in the correct columns", async () => {
      mockApiFetch.mockResolvedValueOnce([TASK_TODO, TASK_IN_PROGRESS, TASK_DONE]);
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Todo Task")).toBeInTheDocument();
      });

      const todoCol = screen.getByRole("list", { name: "To Do column" });
      const ipCol = screen.getByRole("list", { name: "In Progress column" });
      const doneCol = screen.getByRole("list", { name: "Done column" });

      expect(within(todoCol).getByText("Todo Task")).toBeInTheDocument();
      expect(within(ipCol).getByText("In Progress Task")).toBeInTheDocument();
      expect(within(doneCol).getByText("Done Task")).toBeInTheDocument();
    });

    it("renders task cards with draggable attribute and data-task-id", async () => {
      mockApiFetch.mockResolvedValueOnce([TASK_TODO]);
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Todo Task")).toBeInTheDocument();
      });

      const card = screen.getByTestId(`task-card-${TASK_TODO.id}`);
      expect(card).toHaveAttribute("draggable", "true");
      expect(card).toHaveAttribute("data-task-id", TASK_TODO.id);
    });

    it("renders task cards with role listitem", async () => {
      mockApiFetch.mockResolvedValueOnce([TASK_TODO]);
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Todo Task")).toBeInTheDocument();
      });

      const card = screen.getByTestId(`task-card-${TASK_TODO.id}`);
      expect(card).toHaveAttribute("role", "listitem");
    });

    it("shows 'No tasks' placeholder for empty columns", async () => {
      mockApiFetch.mockResolvedValueOnce([]);
      renderPage();

      await waitFor(() => {
        const placeholders = screen.getAllByText("No tasks");
        expect(placeholders).toHaveLength(3);
      });
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe("Error handling", () => {
    it("shows error message when loading tasks fails", async () => {
      mockApiFetch.mockRejectedValueOnce(new Error("Network error"));
      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId("task-error")).toBeInTheDocument();
        expect(screen.getByText("Network error")).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // New task creation
  // -------------------------------------------------------------------------

  describe("Task creation", () => {
    it("renders new task input in the To Do column", async () => {
      mockApiFetch.mockResolvedValueOnce([]);
      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId("new-task-input")).toBeInTheDocument();
      });
      expect(screen.getByTestId("create-task-button")).toBeInTheDocument();
    });

    it("disables create button when input is empty", async () => {
      mockApiFetch.mockResolvedValueOnce([]);
      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId("create-task-button")).toBeDisabled();
      });
    });

    it("creates a task on button click", async () => {
      const user = userEvent.setup();
      const newTask = makeTask({ id: "new-task-1", title: "New Task", status: "TODO" });

      // First call: load tasks (empty)
      mockApiFetch.mockResolvedValueOnce([]);

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId("new-task-input")).toBeInTheDocument();
      });

      // Second call: create task
      mockApiFetch.mockResolvedValueOnce(newTask);

      await user.type(screen.getByTestId("new-task-input"), "New Task");
      await user.click(screen.getByTestId("create-task-button"));

      await waitFor(() => {
        expect(screen.getByText("New Task")).toBeInTheDocument();
      });

      // Verify apiFetch was called with POST /tasks
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/tasks",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ title: "New Task" }),
        }),
        expect.anything(),
      );
    });

    it("creates a task on Enter key", async () => {
      const user = userEvent.setup();
      const newTask = makeTask({ id: "new-task-2", title: "Enter Task", status: "TODO" });

      mockApiFetch.mockResolvedValueOnce([]);
      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId("new-task-input")).toBeInTheDocument();
      });

      mockApiFetch.mockResolvedValueOnce(newTask);

      await user.type(screen.getByTestId("new-task-input"), "Enter Task{enter}");

      await waitFor(() => {
        expect(screen.getByText("Enter Task")).toBeInTheDocument();
      });
    });

    it("clears input after successful task creation", async () => {
      const user = userEvent.setup();
      const newTask = makeTask({ id: "new-task-3", title: "Clear Me", status: "TODO" });

      mockApiFetch.mockResolvedValueOnce([]);
      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId("new-task-input")).toBeInTheDocument();
      });

      mockApiFetch.mockResolvedValueOnce(newTask);

      await user.type(screen.getByTestId("new-task-input"), "Clear Me");
      await user.click(screen.getByTestId("create-task-button"));

      await waitFor(() => {
        expect(screen.getByTestId("new-task-input")).toHaveValue("");
      });
    });

    it("shows error on failed task creation", async () => {
      const user = userEvent.setup();

      mockApiFetch.mockResolvedValueOnce([]);
      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId("new-task-input")).toBeInTheDocument();
      });

      mockApiFetch.mockRejectedValueOnce(new Error("Failed to create task"));

      await user.type(screen.getByTestId("new-task-input"), "Fail Task");
      await user.click(screen.getByTestId("create-task-button"));

      await waitFor(() => {
        expect(screen.getByTestId("task-error")).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // Fallback status transition buttons
  // -------------------------------------------------------------------------

  describe("Fallback status buttons", () => {
    it("shows Start button for TODO tasks", async () => {
      mockApiFetch.mockResolvedValueOnce([TASK_TODO]);
      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId(`start-task-${TASK_TODO.id}`)).toBeInTheDocument();
      });
    });

    it("shows Done and Back to To Do buttons for IN_PROGRESS tasks", async () => {
      mockApiFetch.mockResolvedValueOnce([TASK_IN_PROGRESS]);
      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId(`done-task-${TASK_IN_PROGRESS.id}`)).toBeInTheDocument();
        expect(screen.getByTestId(`back-todo-task-${TASK_IN_PROGRESS.id}`)).toBeInTheDocument();
      });
    });

    it("shows Reopen button for DONE tasks", async () => {
      mockApiFetch.mockResolvedValueOnce([TASK_DONE]);
      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId(`reopen-task-${TASK_DONE.id}`)).toBeInTheDocument();
      });
    });

    it("moves TODO task to IN_PROGRESS via Start button (optimistic)", async () => {
      const user = userEvent.setup();
      const updatedTask = { ...TASK_TODO, status: "IN_PROGRESS", updatedAt: "2026-04-04T13:00:00.000Z" };

      mockApiFetch.mockResolvedValueOnce([TASK_TODO]);
      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId(`start-task-${TASK_TODO.id}`)).toBeInTheDocument();
      });

      // PATCH call to update status
      mockApiFetch.mockResolvedValueOnce(updatedTask);

      await user.click(screen.getByTestId(`start-task-${TASK_TODO.id}`));

      // Optimistic update: task should be in the In Progress column now
      await waitFor(() => {
        const ipCol = screen.getByRole("list", { name: "In Progress column" });
        expect(within(ipCol).getByText("Todo Task")).toBeInTheDocument();
      });

      // Verify PATCH call
      expect(mockApiFetch).toHaveBeenCalledWith(
        `/tasks/${TASK_TODO.id}/status`,
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ status: "IN_PROGRESS" }),
        }),
        expect.anything(),
      );
    });

    it("moves IN_PROGRESS task to DONE via Done button", async () => {
      const user = userEvent.setup();
      const updatedTask = { ...TASK_IN_PROGRESS, status: "DONE", updatedAt: "2026-04-04T13:00:00.000Z" };

      mockApiFetch.mockResolvedValueOnce([TASK_IN_PROGRESS]);
      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId(`done-task-${TASK_IN_PROGRESS.id}`)).toBeInTheDocument();
      });

      mockApiFetch.mockResolvedValueOnce(updatedTask);
      await user.click(screen.getByTestId(`done-task-${TASK_IN_PROGRESS.id}`));

      await waitFor(() => {
        const doneCol = screen.getByRole("list", { name: "Done column" });
        expect(within(doneCol).getByText("In Progress Task")).toBeInTheDocument();
      });
    });

    it("moves IN_PROGRESS task back to TODO via Back to To Do button", async () => {
      const user = userEvent.setup();
      const updatedTask = { ...TASK_IN_PROGRESS, status: "TODO", updatedAt: "2026-04-04T13:00:00.000Z" };

      mockApiFetch.mockResolvedValueOnce([TASK_IN_PROGRESS]);
      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId(`back-todo-task-${TASK_IN_PROGRESS.id}`)).toBeInTheDocument();
      });

      mockApiFetch.mockResolvedValueOnce(updatedTask);
      await user.click(screen.getByTestId(`back-todo-task-${TASK_IN_PROGRESS.id}`));

      await waitFor(() => {
        const todoCol = screen.getByRole("list", { name: "To Do column" });
        expect(within(todoCol).getByText("In Progress Task")).toBeInTheDocument();
      });
    });

    it("moves DONE task back to TODO via Reopen button", async () => {
      const user = userEvent.setup();
      const updatedTask = { ...TASK_DONE, status: "TODO", updatedAt: "2026-04-04T13:00:00.000Z" };

      mockApiFetch.mockResolvedValueOnce([TASK_DONE]);
      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId(`reopen-task-${TASK_DONE.id}`)).toBeInTheDocument();
      });

      mockApiFetch.mockResolvedValueOnce(updatedTask);
      await user.click(screen.getByTestId(`reopen-task-${TASK_DONE.id}`));

      await waitFor(() => {
        const todoCol = screen.getByRole("list", { name: "To Do column" });
        expect(within(todoCol).getByText("Done Task")).toBeInTheDocument();
      });
    });

    it("reverts optimistic update on API error", async () => {
      const user = userEvent.setup();

      mockApiFetch.mockResolvedValueOnce([TASK_TODO]);
      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId(`start-task-${TASK_TODO.id}`)).toBeInTheDocument();
      });

      // PATCH call fails
      mockApiFetch.mockRejectedValueOnce(new Error("Server error"));

      await user.click(screen.getByTestId(`start-task-${TASK_TODO.id}`));

      // Task should revert back to the To Do column after error
      await waitFor(() => {
        const todoCol = screen.getByRole("list", { name: "To Do column" });
        expect(within(todoCol).getByText("Todo Task")).toBeInTheDocument();
      });

      // Error message should be shown
      await waitFor(() => {
        expect(screen.getByTestId("task-error")).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // Drag-and-drop
  // -------------------------------------------------------------------------

  describe("Drag-and-drop", () => {
    it("sets dragging state on dragstart", async () => {
      mockApiFetch.mockResolvedValueOnce([TASK_TODO]);
      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId(`task-card-${TASK_TODO.id}`)).toBeInTheDocument();
      });

      const card = screen.getByTestId(`task-card-${TASK_TODO.id}`);
      const dragData = createDragData(TASK_TODO.id);

      fireEvent.dragStart(card, dragData);

      // The card should get opacity-50 class (isDragging = true)
      expect(card.className).toContain("opacity-50");
    });

    it("removes dragging state on dragend", async () => {
      mockApiFetch.mockResolvedValueOnce([TASK_TODO]);
      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId(`task-card-${TASK_TODO.id}`)).toBeInTheDocument();
      });

      const card = screen.getByTestId(`task-card-${TASK_TODO.id}`);
      const dragData = createDragData(TASK_TODO.id);

      fireEvent.dragStart(card, dragData);
      expect(card.className).toContain("opacity-50");

      fireEvent.dragEnd(card);
      expect(card.className).toContain("opacity-100");
    });

    it("adds drag-over highlight on dragover", async () => {
      mockApiFetch.mockResolvedValueOnce([TASK_TODO]);
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole("list", { name: "In Progress column" })).toBeInTheDocument();
      });

      const ipColumn = screen.getByRole("list", { name: "In Progress column" });

      fireEvent.dragOver(ipColumn, {
        dataTransfer: { effectAllowed: "move", dropEffect: "move" },
      });

      // Column should have drag-over styling
      expect(ipColumn.className).toContain("border-dashed");
      expect(ipColumn.className).toContain("border-primary");
    });

    it("moves task to new column on drop", async () => {
      const updatedTask = { ...TASK_TODO, status: "IN_PROGRESS", updatedAt: "2026-04-04T13:00:00.000Z" };

      mockApiFetch.mockResolvedValueOnce([TASK_TODO]);
      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId(`task-card-${TASK_TODO.id}`)).toBeInTheDocument();
      });

      // PATCH call will succeed
      mockApiFetch.mockResolvedValueOnce(updatedTask);

      const card = screen.getByTestId(`task-card-${TASK_TODO.id}`);
      const ipColumn = screen.getByRole("list", { name: "In Progress column" });

      // Simulate drag-and-drop sequence
      const dragDataMap: Record<string, string> = {};

      fireEvent.dragStart(card, {
        dataTransfer: {
          setData: (key: string, value: string) => { dragDataMap[key] = value; },
          getData: (key: string) => dragDataMap[key] ?? "",
          effectAllowed: "move",
          dropEffect: "move",
        },
      });

      fireEvent.dragOver(ipColumn, {
        dataTransfer: {
          setData: (key: string, value: string) => { dragDataMap[key] = value; },
          getData: (key: string) => dragDataMap[key] ?? "",
          effectAllowed: "move",
          dropEffect: "move",
        },
      });

      fireEvent.drop(ipColumn, {
        dataTransfer: {
          setData: (key: string, value: string) => { dragDataMap[key] = value; },
          getData: (key: string) => dragDataMap[key] ?? "",
          effectAllowed: "move",
          dropEffect: "move",
        },
      });

      // Optimistic update: task should be in In Progress column
      await waitFor(() => {
        const ipCol = screen.getByRole("list", { name: "In Progress column" });
        expect(within(ipCol).getByText("Todo Task")).toBeInTheDocument();
      });

      // Verify PATCH call
      expect(mockApiFetch).toHaveBeenCalledWith(
        `/tasks/${TASK_TODO.id}/status`,
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ status: "IN_PROGRESS" }),
        }),
        expect.anything(),
      );
    });

    it("does not fire API call when dropping on the same column (no-op)", async () => {
      mockApiFetch.mockResolvedValueOnce([TASK_TODO]);
      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId(`task-card-${TASK_TODO.id}`)).toBeInTheDocument();
      });

      const card = screen.getByTestId(`task-card-${TASK_TODO.id}`);
      const todoColumn = screen.getByRole("list", { name: "To Do column" });

      const dragDataMap: Record<string, string> = {};

      // Drag start from TODO column
      fireEvent.dragStart(card, {
        dataTransfer: {
          setData: (key: string, value: string) => { dragDataMap[key] = value; },
          getData: (key: string) => dragDataMap[key] ?? "",
          effectAllowed: "move",
          dropEffect: "move",
        },
      });

      // Drop on the same TODO column
      fireEvent.drop(todoColumn, {
        dataTransfer: {
          setData: (key: string, value: string) => { dragDataMap[key] = value; },
          getData: (key: string) => dragDataMap[key] ?? "",
          effectAllowed: "move",
          dropEffect: "move",
        },
      });

      // Only the initial load apiFetch call should have been made — no PATCH call
      expect(mockApiFetch).toHaveBeenCalledTimes(1);
    });

    it("reverts drag-and-drop on API error", async () => {
      mockApiFetch.mockResolvedValueOnce([TASK_TODO]);
      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId(`task-card-${TASK_TODO.id}`)).toBeInTheDocument();
      });

      // PATCH call will fail
      mockApiFetch.mockRejectedValueOnce(new Error("Server error"));

      const card = screen.getByTestId(`task-card-${TASK_TODO.id}`);
      const ipColumn = screen.getByRole("list", { name: "In Progress column" });

      const dragDataMap: Record<string, string> = {};

      fireEvent.dragStart(card, {
        dataTransfer: {
          setData: (key: string, value: string) => { dragDataMap[key] = value; },
          getData: (key: string) => dragDataMap[key] ?? "",
          effectAllowed: "move",
          dropEffect: "move",
        },
      });

      fireEvent.drop(ipColumn, {
        dataTransfer: {
          setData: (key: string, value: string) => { dragDataMap[key] = value; },
          getData: (key: string) => dragDataMap[key] ?? "",
          effectAllowed: "move",
          dropEffect: "move",
        },
      });

      // Task should revert back to the To Do column after error
      await waitFor(() => {
        const todoCol = screen.getByRole("list", { name: "To Do column" });
        expect(within(todoCol).getByText("Todo Task")).toBeInTheDocument();
      });

      // Error banner should show
      await waitFor(() => {
        expect(screen.getByTestId("task-error")).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // API integration via apiFetch
  // -------------------------------------------------------------------------

  describe("API integration", () => {
    it("calls apiFetch with /tasks on mount", async () => {
      mockApiFetch.mockResolvedValueOnce([]);
      renderPage();

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith(
          "/tasks",
          expect.anything(),
          expect.anything(),
        );
      });
    });

    it("renders multiple tasks across different columns", async () => {
      const tasks = [
        makeTask({ id: "t1", title: "Task 1", status: "TODO" }),
        makeTask({ id: "t2", title: "Task 2", status: "TODO" }),
        makeTask({ id: "t3", title: "Task 3", status: "IN_PROGRESS" }),
        makeTask({ id: "t4", title: "Task 4", status: "DONE" }),
        makeTask({ id: "t5", title: "Task 5", status: "DONE" }),
      ];

      mockApiFetch.mockResolvedValueOnce(tasks);
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Task 1")).toBeInTheDocument();
      });

      const todoCol = screen.getByRole("list", { name: "To Do column" });
      const ipCol = screen.getByRole("list", { name: "In Progress column" });
      const doneCol = screen.getByRole("list", { name: "Done column" });

      expect(within(todoCol).getByText("Task 1")).toBeInTheDocument();
      expect(within(todoCol).getByText("Task 2")).toBeInTheDocument();
      expect(within(ipCol).getByText("Task 3")).toBeInTheDocument();
      expect(within(doneCol).getByText("Task 4")).toBeInTheDocument();
      expect(within(doneCol).getByText("Task 5")).toBeInTheDocument();
    });
  });
});
