// =============================================================================
// Unit Tests — TaskBoardPage (Kanban Board)
// =============================================================================
// Covers: rendering, task creation, status transitions via buttons,
// drag-and-drop event handlers, optimistic UI with revert on error,
// loading state, error display, and no-op same-column drops.
// =============================================================================

import React from "react";
import { render, screen, waitFor, within, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";

// ---------------------------------------------------------------------------
// Mock modules BEFORE importing the component
// ---------------------------------------------------------------------------

// Mock next/link
jest.mock("next/link", () => {
  return {
    __esModule: true,
    default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
      <a href={href} {...props}>{children}</a>
    ),
  };
});

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

// ---------------------------------------------------------------------------
// Import component under test
// ---------------------------------------------------------------------------

import TaskBoardPage from "../page";

// ---------------------------------------------------------------------------
// Test data factories
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
    createdAt: overrides.createdAt ?? "2026-04-01T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-04-01T00:00:00.000Z",
    ...overrides,
  };
}

const TODO_TASK = makeTask({ id: "t-1", title: "Todo Task", status: "TODO" });
const INPROGRESS_TASK = makeTask({ id: "t-2", title: "Working Task", status: "IN_PROGRESS" });
const DONE_TASK = makeTask({ id: "t-3", title: "Completed Task", status: "DONE" });

// ---------------------------------------------------------------------------
// Setup & teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockApiFetch.mockReset();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Render with mock API returning the given tasks array on mount load */
function renderBoard(tasks = [TODO_TASK, INPROGRESS_TASK, DONE_TASK]) {
  mockApiFetch.mockResolvedValueOnce(tasks);
  return render(<TaskBoardPage />);
}

/** Wait for loading to finish */
async function waitForBoard() {
  await waitFor(() => {
    expect(screen.queryByTestId("task-board-loading")).not.toBeInTheDocument();
  });
}

// ---------------------------------------------------------------------------
// Tests — Loading State
// ---------------------------------------------------------------------------

describe("TaskBoardPage", () => {
  describe("Loading state", () => {
    it("displays loading indicator while fetching tasks", () => {
      mockApiFetch.mockReturnValueOnce(new Promise(() => {})); // never resolves
      render(<TaskBoardPage />);

      expect(screen.getByTestId("task-board-loading")).toBeInTheDocument();
      expect(screen.getByText("Loading tasks…")).toBeInTheDocument();
    });

    it("removes loading indicator after tasks load", async () => {
      renderBoard([]);
      await waitForBoard();

      expect(screen.queryByTestId("task-board-loading")).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Column Rendering
  // -------------------------------------------------------------------------

  describe("Column rendering", () => {
    it("renders three columns with correct labels", async () => {
      renderBoard([]);
      await waitForBoard();

      expect(screen.getByTestId("column-TODO")).toBeInTheDocument();
      expect(screen.getByTestId("column-IN_PROGRESS")).toBeInTheDocument();
      expect(screen.getByTestId("column-DONE")).toBeInTheDocument();
    });

    it("columns have correct aria-labels", async () => {
      renderBoard([]);
      await waitForBoard();

      expect(screen.getByLabelText("To Do column")).toBeInTheDocument();
      expect(screen.getByLabelText("In Progress column")).toBeInTheDocument();
      expect(screen.getByLabelText("Done column")).toBeInTheDocument();
    });

    it("columns have role=list", async () => {
      renderBoard([]);
      await waitForBoard();

      const columns = screen.getAllByRole("list");
      expect(columns.length).toBe(3);
    });

    it("renders tasks in correct columns", async () => {
      renderBoard();
      await waitForBoard();

      const todoCol = screen.getByTestId("column-TODO");
      const inProgressCol = screen.getByTestId("column-IN_PROGRESS");
      const doneCol = screen.getByTestId("column-DONE");

      expect(within(todoCol).getByText("Todo Task")).toBeInTheDocument();
      expect(within(inProgressCol).getByText("Working Task")).toBeInTheDocument();
      expect(within(doneCol).getByText("Completed Task")).toBeInTheDocument();
    });

    it("displays task count per column", async () => {
      renderBoard();
      await waitForBoard();

      const todoCol = screen.getByTestId("column-TODO");
      const inProgressCol = screen.getByTestId("column-IN_PROGRESS");
      const doneCol = screen.getByTestId("column-DONE");

      expect(within(todoCol).getByText("1")).toBeInTheDocument();
      expect(within(inProgressCol).getByText("1")).toBeInTheDocument();
      expect(within(doneCol).getByText("1")).toBeInTheDocument();
    });

    it("displays total task count in the header", async () => {
      renderBoard();
      await waitForBoard();

      expect(screen.getByText("3 tasks")).toBeInTheDocument();
    });

    it("shows singular 'task' for single task", async () => {
      renderBoard([TODO_TASK]);
      await waitForBoard();

      expect(screen.getByText("1 task")).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Error Display
  // -------------------------------------------------------------------------

  describe("Error handling", () => {
    it("displays error when task loading fails", async () => {
      mockApiFetch.mockRejectedValueOnce(new Error("Network failure"));
      render(<TaskBoardPage />);
      await waitForBoard();

      expect(screen.getByTestId("task-board-error")).toBeInTheDocument();
      expect(screen.getByText("Network failure")).toBeInTheDocument();
    });

    it("displays generic error for non-Error throws", async () => {
      mockApiFetch.mockRejectedValueOnce("string error");
      render(<TaskBoardPage />);
      await waitForBoard();

      expect(screen.getByTestId("task-board-error")).toBeInTheDocument();
      expect(screen.getByText("Failed to load tasks")).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Task Card Properties
  // -------------------------------------------------------------------------

  describe("Task cards", () => {
    it("task cards have role=listitem", async () => {
      renderBoard();
      await waitForBoard();

      const items = screen.getAllByRole("listitem");
      expect(items.length).toBe(3);
    });

    it("task cards are draggable", async () => {
      renderBoard();
      await waitForBoard();

      const card = screen.getByTestId("task-card-t-1");
      expect(card).toHaveAttribute("draggable", "true");
    });

    it("task cards have data-task-id attribute", async () => {
      renderBoard();
      await waitForBoard();

      const card = screen.getByTestId("task-card-t-1");
      expect(card).toHaveAttribute("data-task-id", "t-1");
    });

    it("displays task title", async () => {
      renderBoard();
      await waitForBoard();

      expect(screen.getByTestId("task-title-t-1")).toHaveTextContent("Todo Task");
    });
  });

  // -------------------------------------------------------------------------
  // New Task Creation
  // -------------------------------------------------------------------------

  describe("Task creation", () => {
    it("renders new task form in TODO column", async () => {
      renderBoard([]);
      await waitForBoard();

      expect(screen.getByTestId("new-task-form")).toBeInTheDocument();
      expect(screen.getByTestId("new-task-input")).toBeInTheDocument();
      expect(screen.getByTestId("create-task-button")).toBeInTheDocument();
    });

    it("create button is disabled when input is empty", async () => {
      renderBoard([]);
      await waitForBoard();

      expect(screen.getByTestId("create-task-button")).toBeDisabled();
    });

    it("creates a task on form submission", async () => {
      const user = userEvent.setup();
      const newTask = makeTask({ id: "new-1", title: "New Task", status: "TODO" });
      renderBoard([]);
      await waitForBoard();

      // Second call: create task
      mockApiFetch.mockResolvedValueOnce(newTask);

      await user.type(screen.getByTestId("new-task-input"), "New Task");
      await user.click(screen.getByTestId("create-task-button"));

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith(
          "/tasks",
          expect.objectContaining({
            method: "POST",
            body: JSON.stringify({ title: "New Task" }),
          }),
          expect.anything(),
        );
      });

      await waitFor(() => {
        expect(screen.getByText("New Task")).toBeInTheDocument();
      });
    });

    it("clears input after successful creation", async () => {
      const user = userEvent.setup();
      const newTask = makeTask({ id: "new-1", title: "My Task", status: "TODO" });
      renderBoard([]);
      await waitForBoard();

      mockApiFetch.mockResolvedValueOnce(newTask);

      await user.type(screen.getByTestId("new-task-input"), "My Task");
      await user.click(screen.getByTestId("create-task-button"));

      await waitFor(() => {
        expect(screen.getByTestId("new-task-input")).toHaveValue("");
      });
    });

    it("shows error on failed creation", async () => {
      const user = userEvent.setup();
      renderBoard([]);
      await waitForBoard();

      mockApiFetch.mockRejectedValueOnce(new Error("Create failed"));

      await user.type(screen.getByTestId("new-task-input"), "Failing Task");
      await user.click(screen.getByTestId("create-task-button"));

      await waitFor(() => {
        expect(screen.getByTestId("task-board-error")).toBeInTheDocument();
        expect(screen.getByText("Create failed")).toBeInTheDocument();
      });
    });

    it("creates a task on Enter key press", async () => {
      const user = userEvent.setup();
      const newTask = makeTask({ id: "new-2", title: "Enter Task", status: "TODO" });
      renderBoard([]);
      await waitForBoard();

      mockApiFetch.mockResolvedValueOnce(newTask);

      const input = screen.getByTestId("new-task-input");
      await user.type(input, "Enter Task{enter}");

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith(
          "/tasks",
          expect.objectContaining({
            method: "POST",
            body: JSON.stringify({ title: "Enter Task" }),
          }),
          expect.anything(),
        );
      });
    });
  });

  // -------------------------------------------------------------------------
  // Status Transition Buttons
  // -------------------------------------------------------------------------

  describe("Status transition buttons", () => {
    it("TODO task shows 'Start' button", async () => {
      renderBoard();
      await waitForBoard();

      expect(screen.getByTestId("start-task-t-1")).toBeInTheDocument();
      expect(screen.getByTestId("start-task-t-1")).toHaveTextContent("Start");
    });

    it("IN_PROGRESS task shows 'Done' and 'Back to To Do' buttons", async () => {
      renderBoard();
      await waitForBoard();

      expect(screen.getByTestId("done-task-t-2")).toBeInTheDocument();
      expect(screen.getByTestId("done-task-t-2")).toHaveTextContent("Done");
      expect(screen.getByTestId("back-todo-task-t-2")).toBeInTheDocument();
      expect(screen.getByTestId("back-todo-task-t-2")).toHaveTextContent("Back to To Do");
    });

    it("DONE task shows 'Reopen' button", async () => {
      renderBoard();
      await waitForBoard();

      expect(screen.getByTestId("reopen-task-t-3")).toBeInTheDocument();
      expect(screen.getByTestId("reopen-task-t-3")).toHaveTextContent("Reopen");
    });

    it("clicking Start moves task to IN_PROGRESS (optimistic)", async () => {
      const user = userEvent.setup();
      const updatedTask = makeTask({ id: "t-1", title: "Todo Task", status: "IN_PROGRESS" });
      renderBoard();
      await waitForBoard();

      mockApiFetch.mockResolvedValueOnce(updatedTask);

      await user.click(screen.getByTestId("start-task-t-1"));

      // Optimistic: task should move to IN_PROGRESS column immediately
      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith(
          "/tasks/t-1/status",
          expect.objectContaining({
            method: "PATCH",
            body: JSON.stringify({ status: "IN_PROGRESS" }),
          }),
          expect.anything(),
        );
      });
    });

    it("clicking Done moves task to DONE", async () => {
      const user = userEvent.setup();
      const updatedTask = makeTask({ id: "t-2", title: "Working Task", status: "DONE" });
      renderBoard();
      await waitForBoard();

      mockApiFetch.mockResolvedValueOnce(updatedTask);

      await user.click(screen.getByTestId("done-task-t-2"));

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith(
          "/tasks/t-2/status",
          expect.objectContaining({
            method: "PATCH",
            body: JSON.stringify({ status: "DONE" }),
          }),
          expect.anything(),
        );
      });
    });

    it("clicking Back to To Do moves task to TODO", async () => {
      const user = userEvent.setup();
      const updatedTask = makeTask({ id: "t-2", title: "Working Task", status: "TODO" });
      renderBoard();
      await waitForBoard();

      mockApiFetch.mockResolvedValueOnce(updatedTask);

      await user.click(screen.getByTestId("back-todo-task-t-2"));

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith(
          "/tasks/t-2/status",
          expect.objectContaining({
            method: "PATCH",
            body: JSON.stringify({ status: "TODO" }),
          }),
          expect.anything(),
        );
      });
    });

    it("clicking Reopen moves task to TODO", async () => {
      const user = userEvent.setup();
      const updatedTask = makeTask({ id: "t-3", title: "Completed Task", status: "TODO" });
      renderBoard();
      await waitForBoard();

      mockApiFetch.mockResolvedValueOnce(updatedTask);

      await user.click(screen.getByTestId("reopen-task-t-3"));

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith(
          "/tasks/t-3/status",
          expect.objectContaining({
            method: "PATCH",
            body: JSON.stringify({ status: "TODO" }),
          }),
          expect.anything(),
        );
      });
    });
  });

  // -------------------------------------------------------------------------
  // Optimistic UI & Revert
  // -------------------------------------------------------------------------

  describe("Optimistic UI", () => {
    it("reverts task status on API error", async () => {
      const user = userEvent.setup();
      renderBoard([TODO_TASK]);
      await waitForBoard();

      // API rejects
      mockApiFetch.mockRejectedValueOnce(new Error("Server error"));

      // Task starts in TODO column
      const todoCol = screen.getByTestId("column-TODO");
      expect(within(todoCol).getByText("Todo Task")).toBeInTheDocument();

      await user.click(screen.getByTestId("start-task-t-1"));

      // After revert, task should appear back in TODO
      await waitFor(() => {
        expect(screen.getByTestId("task-board-error")).toBeInTheDocument();
      });

      // Task should be back in TODO column after revert
      await waitFor(() => {
        const todoColAfter = screen.getByTestId("column-TODO");
        expect(within(todoColAfter).getByText("Todo Task")).toBeInTheDocument();
      });
    });

    it("shows error message on update failure", async () => {
      const user = userEvent.setup();
      renderBoard([TODO_TASK]);
      await waitForBoard();

      mockApiFetch.mockRejectedValueOnce(new Error("Update failed"));

      await user.click(screen.getByTestId("start-task-t-1"));

      await waitFor(() => {
        expect(screen.getByText("Update failed")).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // Drag-and-Drop Event Handlers
  // -------------------------------------------------------------------------

  describe("Drag-and-drop", () => {
    it("sets dragging state on dragstart (adds opacity class)", async () => {
      renderBoard([TODO_TASK]);
      await waitForBoard();

      const card = screen.getByTestId("task-card-t-1");

      // Create a mock DataTransfer
      const dataTransfer = {
        setData: jest.fn(),
        getData: jest.fn(),
        effectAllowed: "",
        dropEffect: "",
      };

      fireEvent.dragStart(card, { dataTransfer });

      expect(dataTransfer.setData).toHaveBeenCalledWith("text/plain", "t-1");
      expect(dataTransfer.effectAllowed).toBe("move");
      // Card should have opacity-50 class (dragging state)
      expect(card.className).toContain("opacity-50");
    });

    it("removes dragging state on dragend", async () => {
      renderBoard([TODO_TASK]);
      await waitForBoard();

      const card = screen.getByTestId("task-card-t-1");
      const dataTransfer = {
        setData: jest.fn(),
        getData: jest.fn(),
        effectAllowed: "",
        dropEffect: "",
      };

      fireEvent.dragStart(card, { dataTransfer });
      expect(card.className).toContain("opacity-50");

      fireEvent.dragEnd(card);
      expect(card.className).not.toContain("opacity-50");
    });

    it("shows drop zone highlight on dragenter", async () => {
      renderBoard([TODO_TASK]);
      await waitForBoard();

      const inProgressCol = screen.getByTestId("column-IN_PROGRESS");

      const dataTransfer = {
        setData: jest.fn(),
        getData: jest.fn(),
        effectAllowed: "",
        dropEffect: "",
      };

      fireEvent.dragEnter(inProgressCol, { dataTransfer });

      // Column should have drag-over highlight classes
      expect(inProgressCol.className).toContain("border-dashed");
      expect(inProgressCol.className).toContain("border-primary");
    });

    it("prevents default on dragover (allows drop)", async () => {
      renderBoard([TODO_TASK]);
      await waitForBoard();

      const inProgressCol = screen.getByTestId("column-IN_PROGRESS");

      const dataTransfer = {
        setData: jest.fn(),
        getData: jest.fn(),
        effectAllowed: "",
        dropEffect: "",
      };

      const event = new Event("dragover", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "dataTransfer", { value: dataTransfer });

      const wasPrevented = !inProgressCol.dispatchEvent(event);
      expect(wasPrevented).toBe(true);
    });

    it("calls updateTaskStatus on drop with correct data", async () => {
      renderBoard([TODO_TASK]);
      await waitForBoard();

      const updatedTask = makeTask({ id: "t-1", title: "Todo Task", status: "IN_PROGRESS" });
      mockApiFetch.mockResolvedValueOnce(updatedTask);

      const inProgressCol = screen.getByTestId("column-IN_PROGRESS");
      const dataTransfer = {
        setData: jest.fn(),
        getData: jest.fn().mockReturnValue("t-1"),
        effectAllowed: "",
        dropEffect: "",
      };

      fireEvent.drop(inProgressCol, { dataTransfer });

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith(
          "/tasks/t-1/status",
          expect.objectContaining({
            method: "PATCH",
            body: JSON.stringify({ status: "IN_PROGRESS" }),
          }),
          expect.anything(),
        );
      });
    });

    it("does not fire API call when dropping on same column (no-op)", async () => {
      renderBoard([TODO_TASK]);
      await waitForBoard();

      const todoCol = screen.getByTestId("column-TODO");
      const dataTransfer = {
        setData: jest.fn(),
        getData: jest.fn().mockReturnValue("t-1"),
        effectAllowed: "",
        dropEffect: "",
      };

      // Reset the mock call count (first call was loading tasks)
      const callCountBefore = mockApiFetch.mock.calls.length;

      fireEvent.drop(todoCol, { dataTransfer });

      // Wait a tick and verify no additional API call was made
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      expect(mockApiFetch.mock.calls.length).toBe(callCountBefore);
    });

    it("drop on IN_PROGRESS column triggers PATCH to IN_PROGRESS", async () => {
      const task = makeTask({ id: "t-10", title: "Drag Me", status: "TODO" });
      renderBoard([task]);
      await waitForBoard();

      const updatedTask = { ...task, status: "IN_PROGRESS" };
      mockApiFetch.mockResolvedValueOnce(updatedTask);

      const inProgressCol = screen.getByTestId("column-IN_PROGRESS");
      const dataTransfer = {
        setData: jest.fn(),
        getData: jest.fn().mockReturnValue("t-10"),
        effectAllowed: "",
        dropEffect: "",
      };

      fireEvent.drop(inProgressCol, { dataTransfer });

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith(
          "/tasks/t-10/status",
          expect.objectContaining({
            method: "PATCH",
            body: JSON.stringify({ status: "IN_PROGRESS" }),
          }),
          expect.anything(),
        );
      });
    });

    it("drop on DONE column triggers PATCH to DONE", async () => {
      const task = makeTask({ id: "t-11", title: "Almost Done", status: "IN_PROGRESS" });
      renderBoard([task]);
      await waitForBoard();

      const updatedTask = { ...task, status: "DONE" };
      mockApiFetch.mockResolvedValueOnce(updatedTask);

      const doneCol = screen.getByTestId("column-DONE");
      const dataTransfer = {
        setData: jest.fn(),
        getData: jest.fn().mockReturnValue("t-11"),
        effectAllowed: "",
        dropEffect: "",
      };

      fireEvent.drop(doneCol, { dataTransfer });

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith(
          "/tasks/t-11/status",
          expect.objectContaining({
            method: "PATCH",
            body: JSON.stringify({ status: "DONE" }),
          }),
          expect.anything(),
        );
      });
    });
  });

  // -------------------------------------------------------------------------
  // New Task Form UX
  // -------------------------------------------------------------------------

  describe("New task form UX", () => {
    it("input has maxLength=200", async () => {
      renderBoard([]);
      await waitForBoard();

      expect(screen.getByTestId("new-task-input")).toHaveAttribute("maxLength", "200");
    });

    it("input has correct placeholder", async () => {
      renderBoard([]);
      await waitForBoard();

      expect(screen.getByTestId("new-task-input")).toHaveAttribute("placeholder", "New task title…");
    });

    it("input has aria-label for accessibility", async () => {
      renderBoard([]);
      await waitForBoard();

      expect(screen.getByLabelText("New task title")).toBeInTheDocument();
    });

    it("does not create task with whitespace-only title", async () => {
      const user = userEvent.setup();
      renderBoard([]);
      await waitForBoard();

      const input = screen.getByTestId("new-task-input");
      await user.type(input, "   ");

      // Button should still be disabled
      expect(screen.getByTestId("create-task-button")).toBeDisabled();
    });
  });

  // -------------------------------------------------------------------------
  // Empty Columns
  // -------------------------------------------------------------------------

  describe("Empty columns", () => {
    it("shows 'No tasks yet' in empty TODO column", async () => {
      renderBoard([]);
      await waitForBoard();

      const todoCol = screen.getByTestId("column-TODO");
      expect(within(todoCol).getByText("No tasks yet")).toBeInTheDocument();
    });

    it("shows 'Drop tasks here' in empty non-TODO columns", async () => {
      renderBoard([]);
      await waitForBoard();

      const inProgressCol = screen.getByTestId("column-IN_PROGRESS");
      const doneCol = screen.getByTestId("column-DONE");

      expect(within(inProgressCol).getByText("Drop tasks here")).toBeInTheDocument();
      expect(within(doneCol).getByText("Drop tasks here")).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Page heading
  // -------------------------------------------------------------------------

  describe("Page structure", () => {
    it("renders the Task Board heading", async () => {
      renderBoard([]);
      await waitForBoard();

      expect(screen.getByText("Task Board")).toBeInTheDocument();
    });

    it("renders the columns grid container", async () => {
      renderBoard([]);
      await waitForBoard();

      expect(screen.getByTestId("task-board-columns")).toBeInTheDocument();
    });
  });
});
