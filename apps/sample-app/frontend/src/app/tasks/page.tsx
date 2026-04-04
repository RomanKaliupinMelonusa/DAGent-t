// =============================================================================
// Kanban Task Board — Interactive task management with optimistic UI
// =============================================================================
// Displays 3 columns (To Do, In Progress, Done). Tasks are created via a
// text input, moved between columns via status-transition buttons, and
// persisted via the API gateway. State updates are optimistic — the UI
// reflects changes immediately and reverts on API failure.
// =============================================================================

"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch, ApiError } from "@/lib/apiClient";
import {
  TaskSchema,
  type Task,
  type TaskStatus,
} from "@branded/schemas";
import { Button, Input } from "@/components/ui/primitives";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Column configuration
// ---------------------------------------------------------------------------

interface ColumnConfig {
  status: TaskStatus;
  label: string;
  headerColor: string;
}

const COLUMNS: ColumnConfig[] = [
  { status: "TODO", label: "To Do", headerColor: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  { status: "IN_PROGRESS", label: "In Progress", headerColor: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  { status: "DONE", label: "Done", headerColor: "bg-green-500/10 text-green-600 dark:text-green-400" },
];

// ---------------------------------------------------------------------------
// Status transition map — each status lists its available transitions
// ---------------------------------------------------------------------------

interface Transition {
  label: string;
  to: TaskStatus;
  variant: "primary" | "secondary" | "ghost";
}

const TRANSITIONS: Record<TaskStatus, Transition[]> = {
  TODO: [{ label: "Start", to: "IN_PROGRESS", variant: "primary" }],
  IN_PROGRESS: [
    { label: "Done", to: "DONE", variant: "primary" },
    { label: "Back to To Do", to: "TODO", variant: "secondary" },
  ],
  DONE: [{ label: "Reopen", to: "TODO", variant: "ghost" }],
};

// ---------------------------------------------------------------------------
// Task Card
// ---------------------------------------------------------------------------

function TaskCard({
  task,
  onMove,
  isMoving,
}: {
  task: Task;
  onMove: (taskId: string, newStatus: TaskStatus) => void;
  isMoving: boolean;
}) {
  const transitions = TRANSITIONS[task.status];

  return (
    <div
      className="rounded-lg border border-border bg-surface-card p-3 shadow-sm transition-colors duration-200"
      data-testid={`task-card-${task.id}`}
    >
      <p className="text-sm font-medium text-text-primary" data-testid="task-title">
        {task.title}
      </p>
      <p className="mt-1 text-xs text-text-muted">
        {new Date(task.updatedAt).toLocaleDateString()}
      </p>
      {transitions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {transitions.map((t) => (
            <Button
              key={t.to}
              variant={t.variant}
              size="sm"
              disabled={isMoving}
              onClick={() => onMove(task.id, t.to)}
              data-testid={`move-${task.id}-${t.to}`}
            >
              {t.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Kanban Column
// ---------------------------------------------------------------------------

function KanbanColumn({
  config,
  tasks,
  onMove,
  movingTaskId,
  children,
}: {
  config: ColumnConfig;
  tasks: Task[];
  onMove: (taskId: string, newStatus: TaskStatus) => void;
  movingTaskId: string | null;
  children?: React.ReactNode;
}) {
  return (
    <section
      className="flex flex-1 flex-col rounded-lg border border-border bg-surface-alt/50 transition-colors duration-200"
      data-testid={`column-${config.status}`}
    >
      <div className={`rounded-t-lg px-4 py-3 ${config.headerColor}`}>
        <h2 className="text-sm font-semibold">
          {config.label}{" "}
          <span className="ml-1 text-xs opacity-70">({tasks.length})</span>
        </h2>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-3">
        {children}
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            onMove={onMove}
            isMoving={movingTaskId === task.id}
          />
        ))}
        {tasks.length === 0 && !children && (
          <p className="py-4 text-center text-xs text-text-muted">No tasks</p>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [movingTaskId, setMovingTaskId] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Load tasks on mount
  // -------------------------------------------------------------------------

  const loadTasks = useCallback(async () => {
    try {
      const data = await apiFetch<Task[]>("/tasks", {}, z.array(TaskSchema));
      setTasks(data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // -------------------------------------------------------------------------
  // Create task
  // -------------------------------------------------------------------------

  async function handleCreate() {
    const title = newTitle.trim();
    if (!title || isCreating) return;

    setIsCreating(true);
    setError(null);

    try {
      const created = await apiFetch<Task>(
        "/tasks",
        {
          method: "POST",
          body: JSON.stringify({ title }),
        },
        TaskSchema,
      );
      setTasks((prev) => [...prev, created]);
      setNewTitle("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setIsCreating(false);
    }
  }

  // -------------------------------------------------------------------------
  // Move task (optimistic)
  // -------------------------------------------------------------------------

  async function handleMove(taskId: string, newStatus: TaskStatus) {
    setMovingTaskId(taskId);
    setError(null);

    // Snapshot for rollback
    const previousTasks = [...tasks];

    // Optimistic update
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? { ...t, status: newStatus, updatedAt: new Date().toISOString() }
          : t,
      ),
    );

    try {
      const updated = await apiFetch<Task>(
        `/tasks/${taskId}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({ status: newStatus }),
        },
        TaskSchema,
      );
      // Replace with server response to ensure consistency
      setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
    } catch (err) {
      // Revert on failure
      setTasks(previousTasks);
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setMovingTaskId(null);
    }
  }

  // -------------------------------------------------------------------------
  // Derived column data
  // -------------------------------------------------------------------------

  function tasksForStatus(status: TaskStatus): Task[] {
    return tasks.filter((t) => t.status === status);
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-text-muted">Loading tasks…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="tasks-page">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">Task Board</h1>
      </div>

      {/* Error banner */}
      {error && (
        <div
          className="rounded-lg border border-danger-border bg-danger-bg px-4 py-3 text-sm text-danger-text"
          role="alert"
          data-testid="tasks-error"
        >
          {error}
        </div>
      )}

      {/* Kanban columns */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {COLUMNS.map((col) => (
          <KanbanColumn
            key={col.status}
            config={col}
            tasks={tasksForStatus(col.status)}
            onMove={handleMove}
            movingTaskId={movingTaskId}
          >
            {/* New task input — only in the To Do column */}
            {col.status === "TODO" && (
              <div className="flex gap-2" data-testid="new-task-form">
                <Input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="New task title…"
                  maxLength={200}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                  }}
                  disabled={isCreating}
                  data-testid="new-task-input"
                />
                <Button
                  onClick={handleCreate}
                  disabled={!newTitle.trim() || isCreating}
                  size="sm"
                  data-testid="create-task-button"
                >
                  {isCreating ? "…" : "Add"}
                </Button>
              </div>
            )}
          </KanbanColumn>
        ))}
      </div>
    </div>
  );
}
