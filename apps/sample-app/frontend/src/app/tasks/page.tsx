// =============================================================================
// Task Board — Kanban page with drag-and-drop + fallback buttons
// =============================================================================
// Three-column Kanban board (To Do, In Progress, Done) with:
//   - HTML5 native drag-and-drop for column-to-column moves
//   - Fallback buttons for accessibility / mobile
//   - Optimistic UI with revert on API error
//   - Zod-validated API calls via apiFetch
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

const COLUMNS: { status: TaskStatus; label: string; ariaLabel: string }[] = [
  { status: "TODO", label: "To Do", ariaLabel: "To Do column" },
  { status: "IN_PROGRESS", label: "In Progress", ariaLabel: "In Progress column" },
  { status: "DONE", label: "Done", ariaLabel: "Done column" },
];

// ---------------------------------------------------------------------------
// Task Board Page
// ---------------------------------------------------------------------------

export default function TaskBoardPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);

  // Track which column has a drag-over highlight
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);
  // Track which task is being dragged
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);

  // Ref to track the source status of the dragged task (for no-op same-column check)
  const dragSourceStatus = useRef<TaskStatus | null>(null);

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
      const created = await apiFetch<Task>(
        "/tasks",
        { method: "POST", body: JSON.stringify({ title }) },
        TaskSchema,
      );
      setTasks((prev) => [...prev, created]);
      setNewTitle("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create task");
    } finally {
      setCreating(false);
    }
  }, [newTitle, creating]);

  // -------------------------------------------------------------------------
  // Update task status (shared by drag-and-drop and buttons)
  // -------------------------------------------------------------------------

  const updateTaskStatus = useCallback(
    async (taskId: string, newStatus: TaskStatus) => {
      // Find current task
      const currentTask = tasks.find((t) => t.id === taskId);
      if (!currentTask || currentTask.status === newStatus) return;

      // Optimistic update
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId ? { ...t, status: newStatus, updatedAt: new Date().toISOString() } : t,
        ),
      );

      try {
        const updated = await apiFetch<Task>(
          `/tasks/${taskId}/status`,
          { method: "PATCH", body: JSON.stringify({ status: newStatus }) },
          TaskSchema,
        );
        // Replace with server-confirmed data
        setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
      } catch (err) {
        // Revert on error
        setTasks((prev) =>
          prev.map((t) => (t.id === taskId ? currentTask : t)),
        );
        setError(err instanceof Error ? err.message : "Failed to update task");
      }
    },
    [tasks],
  );

  // -------------------------------------------------------------------------
  // Drag-and-drop handlers
  // -------------------------------------------------------------------------

  const handleDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>, taskId: string, sourceStatus: TaskStatus) => {
      e.dataTransfer.setData("text/plain", taskId);
      e.dataTransfer.effectAllowed = "move";
      dragSourceStatus.current = sourceStatus;
      setDraggingTaskId(taskId);
    },
    [],
  );

  const handleDragEnd = useCallback(() => {
    setDraggingTaskId(null);
    dragSourceStatus.current = null;
    setDragOverColumn(null);
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>, columnStatus: TaskStatus) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragOverColumn(columnStatus);
    },
    [],
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent<HTMLDivElement>, columnStatus: TaskStatus) => {
      // Only clear if leaving the column itself (not a child element)
      const relatedTarget = e.relatedTarget as HTMLElement | null;
      const currentTarget = e.currentTarget as HTMLElement;
      if (!relatedTarget || !currentTarget.contains(relatedTarget)) {
        setDragOverColumn((prev) => (prev === columnStatus ? null : prev));
      }
    },
    [],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>, targetStatus: TaskStatus) => {
      e.preventDefault();
      setDragOverColumn(null);

      const taskId = e.dataTransfer.getData("text/plain");
      if (!taskId) return;

      // No-op if dropped on the same column
      if (dragSourceStatus.current === targetStatus) return;

      updateTaskStatus(taskId, targetStatus);
    },
    [updateTaskStatus],
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-text-secondary">Loading tasks…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-text-primary">Task Board</h1>

      {error && (
        <div
          className="rounded-lg border border-danger-border bg-danger-bg px-4 py-3 text-sm text-danger-text"
          role="alert"
          data-testid="task-error"
        >
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {COLUMNS.map((col) => {
          const columnTasks = tasks.filter((t) => t.status === col.status);
          const isDragOver = dragOverColumn === col.status;

          return (
            <div
              key={col.status}
              data-status={col.status}
              role="list"
              aria-label={col.ariaLabel}
              className={`rounded-lg border p-4 transition-colors duration-150 ${
                isDragOver
                  ? "border-dashed border-primary bg-primary/10"
                  : "border-border bg-surface-card"
              }`}
              onDragOver={(e) => handleDragOver(e, col.status)}
              onDragLeave={(e) => handleDragLeave(e, col.status)}
              onDrop={(e) => handleDrop(e, col.status)}
            >
              <h2 className="mb-4 text-lg font-semibold text-text-primary">
                {col.label}{" "}
                <span className="text-sm font-normal text-text-secondary">
                  ({columnTasks.length})
                </span>
              </h2>

              {/* New task input — only in To Do column */}
              {col.status === "TODO" && (
                <div className="mb-4 flex gap-2" data-testid="new-task-form">
                  <Input
                    placeholder="New task title…"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") createTask();
                    }}
                    maxLength={200}
                    aria-label="New task title"
                    data-testid="new-task-input"
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
              <div className="space-y-3">
                {columnTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    isDragging={draggingTaskId === task.id}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onUpdateStatus={updateTaskStatus}
                  />
                ))}
                {columnTasks.length === 0 && (
                  <p className="py-4 text-center text-sm text-text-muted">
                    No tasks
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TaskCard — individual task with drag handle + fallback buttons
// ---------------------------------------------------------------------------

interface TaskCardProps {
  task: Task;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent<HTMLDivElement>, taskId: string, status: TaskStatus) => void;
  onDragEnd: () => void;
  onUpdateStatus: (taskId: string, newStatus: TaskStatus) => Promise<void>;
}

function TaskCard({ task, isDragging, onDragStart, onDragEnd, onUpdateStatus }: TaskCardProps) {
  return (
    <div
      role="listitem"
      draggable="true"
      data-task-id={task.id}
      data-testid={`task-card-${task.id}`}
      className={`rounded-lg border border-border bg-surface-alt p-3 transition-opacity duration-150 cursor-grab active:cursor-grabbing ${
        isDragging ? "opacity-50" : "opacity-100"
      }`}
      onDragStart={(e) => onDragStart(e, task.id, task.status)}
      onDragEnd={onDragEnd}
    >
      <p className="mb-2 text-sm font-medium text-text-primary">{task.title}</p>

      <div className="flex flex-wrap gap-1.5">
        {/* Fallback status transition buttons */}
        {task.status === "TODO" && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onUpdateStatus(task.id, "IN_PROGRESS")}
            data-testid={`start-task-${task.id}`}
          >
            Start
          </Button>
        )}
        {task.status === "IN_PROGRESS" && (
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onUpdateStatus(task.id, "DONE")}
              data-testid={`done-task-${task.id}`}
            >
              Done
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onUpdateStatus(task.id, "TODO")}
              data-testid={`back-todo-task-${task.id}`}
            >
              Back to To Do
            </Button>
          </>
        )}
        {task.status === "DONE" && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onUpdateStatus(task.id, "TODO")}
            data-testid={`reopen-task-${task.id}`}
          >
            Reopen
          </Button>
        )}
      </div>
    </div>
  );
}
