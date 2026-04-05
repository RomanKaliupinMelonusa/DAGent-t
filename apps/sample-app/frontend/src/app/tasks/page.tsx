// =============================================================================
// Task Board — Interactive Kanban with Drag-and-Drop + Fallback Buttons
// =============================================================================
// Three-column Kanban board: To Do, In Progress, Done.
// Supports HTML5 native drag-and-drop for column-to-column moves.
// Fallback status-transition buttons for accessibility and mobile.
// Optimistic UI with revert on API error.
// =============================================================================

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { TaskSchema, type Task, type TaskStatus } from "@branded/schemas";
import { apiFetch } from "@/lib/apiClient";
import { Button } from "@/components/ui/primitives";
import { Input } from "@/components/ui/primitives";

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

interface ColumnDef {
  status: TaskStatus;
  label: string;
  ariaLabel: string;
}

const COLUMNS: ColumnDef[] = [
  { status: "TODO", label: "To Do", ariaLabel: "To Do column" },
  { status: "IN_PROGRESS", label: "In Progress", ariaLabel: "In Progress column" },
  { status: "DONE", label: "Done", ariaLabel: "Done column" },
];

// ---------------------------------------------------------------------------
// Status badge colors
// ---------------------------------------------------------------------------

function statusBadgeClass(status: TaskStatus): string {
  switch (status) {
    case "TODO":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
    case "IN_PROGRESS":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
    case "DONE":
      return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
  }
}

// ---------------------------------------------------------------------------
// Column header count badge
// ---------------------------------------------------------------------------

function columnHeaderColor(status: TaskStatus): string {
  switch (status) {
    case "TODO":
      return "text-blue-600 dark:text-blue-400";
    case "IN_PROGRESS":
      return "text-amber-600 dark:text-amber-400";
    case "DONE":
      return "text-green-600 dark:text-green-400";
  }
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function TaskBoardPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<TaskStatus | null>(null);
  const dragCounterRef = useRef<Record<string, number>>({});

  // -------------------------------------------------------------------------
  // Load tasks on mount
  // -------------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    async function loadTasks() {
      try {
        const data = await apiFetch<Task[]>("/tasks", {}, z.array(TaskSchema));
        if (!cancelled) {
          setTasks(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load tasks");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadTasks();
    return () => { cancelled = true; };
  }, []);

  // -------------------------------------------------------------------------
  // Create task
  // -------------------------------------------------------------------------

  const createTask = useCallback(async () => {
    const title = newTitle.trim();
    if (!title || creating) return;

    setCreating(true);
    setError(null);
    try {
      const task = await apiFetch<Task>(
        "/tasks",
        {
          method: "POST",
          body: JSON.stringify({ title }),
        },
        TaskSchema,
      );
      setTasks((prev) => [...prev, task]);
      setNewTitle("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create task");
    } finally {
      setCreating(false);
    }
  }, [newTitle, creating]);

  // -------------------------------------------------------------------------
  // Update task status (shared by drag-and-drop + buttons)
  // -------------------------------------------------------------------------

  const updateTaskStatus = useCallback(
    async (taskId: string, newStatus: TaskStatus) => {
      const taskIndex = tasks.findIndex((t) => t.id === taskId);
      if (taskIndex === -1) return;

      const oldTask = tasks[taskIndex];
      // No-op if same status
      if (oldTask.status === newStatus) return;

      // Optimistic update
      const optimisticTasks = tasks.map((t) =>
        t.id === taskId ? { ...t, status: newStatus, updatedAt: new Date().toISOString() } : t,
      );
      setTasks(optimisticTasks);

      try {
        const updated = await apiFetch<Task>(
          `/tasks/${taskId}/status`,
          {
            method: "PATCH",
            body: JSON.stringify({ status: newStatus }),
          },
          TaskSchema,
        );
        // Replace with server response
        setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
      } catch (err) {
        // Revert on error
        setTasks((prev) => prev.map((t) => (t.id === taskId ? oldTask : t)));
        setError(err instanceof Error ? err.message : "Failed to update task");
      }
    },
    [tasks],
  );

  // -------------------------------------------------------------------------
  // Drag-and-drop handlers
  // -------------------------------------------------------------------------

  const handleDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>, taskId: string) => {
      e.dataTransfer.setData("text/plain", taskId);
      e.dataTransfer.effectAllowed = "move";
      setDraggingId(taskId);
    },
    [],
  );

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
    setDragOverStatus(null);
    dragCounterRef.current = {};
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleDragEnter = useCallback(
    (e: React.DragEvent<HTMLDivElement>, status: TaskStatus) => {
      e.preventDefault();
      const key = status;
      dragCounterRef.current[key] = (dragCounterRef.current[key] ?? 0) + 1;
      setDragOverStatus(status);
    },
    [],
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent<HTMLDivElement>, status: TaskStatus) => {
      e.preventDefault();
      const key = status;
      dragCounterRef.current[key] = (dragCounterRef.current[key] ?? 0) - 1;
      if (dragCounterRef.current[key] <= 0) {
        dragCounterRef.current[key] = 0;
        setDragOverStatus((prev) => (prev === status ? null : prev));
      }
    },
    [],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>, targetStatus: TaskStatus) => {
      e.preventDefault();
      const taskId = e.dataTransfer.getData("text/plain");
      setDragOverStatus(null);
      setDraggingId(null);
      dragCounterRef.current = {};

      if (taskId) {
        updateTaskStatus(taskId, targetStatus);
      }
    },
    [updateTaskStatus],
  );

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  function getTransitionButtons(task: Task) {
    switch (task.status) {
      case "TODO":
        return (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => updateTaskStatus(task.id, "IN_PROGRESS")}
            data-testid={`start-task-${task.id}`}
          >
            Start
          </Button>
        );
      case "IN_PROGRESS":
        return (
          <div className="flex gap-1.5">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => updateTaskStatus(task.id, "DONE")}
              data-testid={`done-task-${task.id}`}
            >
              Done
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => updateTaskStatus(task.id, "TODO")}
              data-testid={`back-todo-task-${task.id}`}
            >
              Back to To Do
            </Button>
          </div>
        );
      case "DONE":
        return (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => updateTaskStatus(task.id, "TODO")}
            data-testid={`reopen-task-${task.id}`}
          >
            Reopen
          </Button>
        );
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-text-secondary" data-testid="task-board-loading">
          Loading tasks…
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">Task Board</h1>
        <span className="text-sm text-text-muted">{tasks.length} task{tasks.length !== 1 ? "s" : ""}</span>
      </div>

      {error && (
        <div
          className="rounded-lg border border-danger-border bg-danger-bg p-3 text-sm text-danger-text"
          role="alert"
          data-testid="task-board-error"
        >
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3" data-testid="task-board-columns">
        {COLUMNS.map((col) => {
          const columnTasks = tasks.filter((t) => t.status === col.status);
          const isDragOver = dragOverStatus === col.status;

          return (
            <div
              key={col.status}
              data-status={col.status}
              data-testid={`column-${col.status}`}
              role="list"
              aria-label={col.ariaLabel}
              onDragOver={handleDragOver}
              onDragEnter={(e) => handleDragEnter(e, col.status)}
              onDragLeave={(e) => handleDragLeave(e, col.status)}
              onDrop={(e) => handleDrop(e, col.status)}
              className={`flex min-h-[200px] flex-col rounded-lg border p-3 transition-colors ${
                isDragOver
                  ? "border-dashed border-primary bg-primary/10"
                  : "border-border bg-surface-card"
              }`}
            >
              {/* Column header */}
              <div className="mb-3 flex items-center justify-between">
                <h2 className={`text-sm font-semibold ${columnHeaderColor(col.status)}`}>
                  {col.label}
                </h2>
                <span className="rounded-full bg-surface-alt px-2 py-0.5 text-xs font-medium text-text-muted">
                  {columnTasks.length}
                </span>
              </div>

              {/* New task form — only in TODO column */}
              {col.status === "TODO" && (
                <div className="mb-3 flex gap-2" data-testid="new-task-form">
                  <Input
                    placeholder="New task title…"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") createTask();
                    }}
                    maxLength={200}
                    disabled={creating}
                    data-testid="new-task-input"
                    aria-label="New task title"
                  />
                  <Button
                    onClick={createTask}
                    disabled={!newTitle.trim() || creating}
                    size="sm"
                    data-testid="create-task-button"
                  >
                    {creating ? "…" : "Add"}
                  </Button>
                </div>
              )}

              {/* Task cards */}
              <div className="flex flex-1 flex-col gap-2">
                {columnTasks.map((task) => (
                  <div
                    key={task.id}
                    data-task-id={task.id}
                    data-testid={`task-card-${task.id}`}
                    role="listitem"
                    draggable="true"
                    onDragStart={(e) => handleDragStart(e, task.id)}
                    onDragEnd={handleDragEnd}
                    className={`rounded-lg border border-border bg-surface-card p-3 shadow-sm transition-all hover:shadow-md cursor-grab active:cursor-grabbing ${
                      draggingId === task.id ? "opacity-50" : ""
                    }`}
                  >
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-text-primary" data-testid={`task-title-${task.id}`}>
                        {task.title}
                      </p>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(task.status)}`}
                      >
                        {col.label}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-text-muted">
                        {new Date(task.createdAt).toLocaleDateString()}
                      </span>
                      {getTransitionButtons(task)}
                    </div>
                  </div>
                ))}
                {columnTasks.length === 0 && (
                  <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border p-4">
                    <p className="text-xs text-text-muted">
                      {col.status === "TODO" ? "No tasks yet" : "Drop tasks here"}
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
