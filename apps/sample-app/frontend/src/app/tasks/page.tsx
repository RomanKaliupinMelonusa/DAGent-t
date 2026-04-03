// =============================================================================
// Task Board — Interactive Kanban with optimistic updates
// =============================================================================
// Three columns (To Do, In Progress, Done) with button-based task movement.
// Uses apiFetch() for authenticated API calls and Zod runtime validation.
// =============================================================================

"use client";

import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { apiFetch, ApiError } from "@/lib/apiClient";
import {
  TaskSchema,
  type Task,
  type TaskStatus,
} from "@branded/schemas";
import { Button, Input } from "@/components/ui/primitives";

// ---------------------------------------------------------------------------
// Column configuration
// ---------------------------------------------------------------------------

interface ColumnConfig {
  status: TaskStatus;
  title: string;
  headerColor: string;
}

const COLUMNS: ColumnConfig[] = [
  { status: "TODO", title: "To Do", headerColor: "bg-blue-500/10 text-blue-700 dark:text-blue-300" },
  { status: "IN_PROGRESS", title: "In Progress", headerColor: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  { status: "DONE", title: "Done", headerColor: "bg-green-500/10 text-green-700 dark:text-green-300" },
];

// Map of which transitions are available from each status
const STATUS_TRANSITIONS: Record<TaskStatus, { label: string; target: TaskStatus; variant: "primary" | "secondary" | "ghost" }[]> = {
  TODO: [
    { label: "Start", target: "IN_PROGRESS", variant: "primary" },
  ],
  IN_PROGRESS: [
    { label: "Done", target: "DONE", variant: "primary" },
    { label: "Back to To Do", target: "TODO", variant: "secondary" },
  ],
  DONE: [
    { label: "Reopen", target: "TODO", variant: "secondary" },
  ],
};

// ---------------------------------------------------------------------------
// Task Card
// ---------------------------------------------------------------------------

function TaskCard({
  task,
  onStatusChange,
  isUpdating,
}: {
  task: Task;
  onStatusChange: (taskId: string, newStatus: TaskStatus) => void;
  isUpdating: boolean;
}) {
  const transitions = STATUS_TRANSITIONS[task.status];

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
        <div className="mt-2 flex flex-wrap gap-1.5">
          {transitions.map((t) => (
            <Button
              key={t.target}
              variant={t.variant}
              size="sm"
              disabled={isUpdating}
              onClick={() => onStatusChange(task.id, t.target)}
              data-testid={`task-action-${t.label.toLowerCase().replace(/\s+/g, "-")}`}
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
  onStatusChange,
  updatingTaskIds,
  children,
}: {
  config: ColumnConfig;
  tasks: Task[];
  onStatusChange: (taskId: string, newStatus: TaskStatus) => void;
  updatingTaskIds: Set<string>;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-lg border border-border bg-surface-alt/50 transition-colors duration-200">
      <div className={`rounded-t-lg px-4 py-2.5 ${config.headerColor}`}>
        <h2 className="text-sm font-semibold">
          {config.title}{" "}
          <span className="text-xs font-normal opacity-70">({tasks.length})</span>
        </h2>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3" data-testid={`column-${config.status}`}>
        {children}
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            onStatusChange={onStatusChange}
            isUpdating={updatingTaskIds.has(task.id)}
          />
        ))}
        {tasks.length === 0 && !children && (
          <p className="py-4 text-center text-xs text-text-muted">No tasks</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export default function TaskBoardPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [updatingTaskIds, setUpdatingTaskIds] = useState<Set<string>>(new Set());

  // -------------------------------------------------------------------------
  // Load tasks on mount
  // -------------------------------------------------------------------------

  const loadTasks = useCallback(async () => {
    try {
      const data = await apiFetch<Task[]>("/tasks", {}, z.array(TaskSchema));
      setTasks(data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load tasks");
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

  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
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
      setError(err instanceof ApiError ? err.message : "Failed to create task");
    } finally {
      setIsCreating(false);
    }
  }

  // -------------------------------------------------------------------------
  // Update task status (optimistic)
  // -------------------------------------------------------------------------

  async function handleStatusChange(taskId: string, newStatus: TaskStatus) {
    // Optimistic update
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? { ...t, status: newStatus, updatedAt: new Date().toISOString() }
          : t,
      ),
    );
    setUpdatingTaskIds((prev) => new Set(prev).add(taskId));
    setError(null);

    try {
      const updated = await apiFetch<Task>(
        `/tasks/${taskId}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({ status: newStatus }),
        },
        TaskSchema,
      );
      // Replace with server response (authoritative)
      setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
    } catch (err) {
      // Revert optimistic update
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id !== taskId) return t;
          // Reload to get the true state
          return t;
        }),
      );
      // Reload tasks to get correct state
      loadTasks();
      setError(err instanceof ApiError ? err.message : "Failed to update task");
    } finally {
      setUpdatingTaskIds((prev) => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-text-muted">Loading tasks…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Task Board</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Create tasks and move them across columns.
        </p>
      </div>

      {error && (
        <div
          className="rounded-lg border border-danger-border bg-danger-bg px-4 py-3 text-sm text-danger-text"
          role="alert"
          data-testid="task-error"
        >
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {COLUMNS.map((col) => {
          const columnTasks = tasks.filter((t) => t.status === col.status);
          return (
            <KanbanColumn
              key={col.status}
              config={col}
              tasks={columnTasks}
              onStatusChange={handleStatusChange}
              updatingTaskIds={updatingTaskIds}
            >
              {/* New task form only in the TODO column */}
              {col.status === "TODO" && (
                <form
                  onSubmit={handleCreateTask}
                  className="flex gap-2"
                  data-testid="new-task-form"
                >
                  <Input
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="New task title…"
                    maxLength={200}
                    disabled={isCreating}
                    data-testid="new-task-input"
                    aria-label="New task title"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    disabled={isCreating || !newTitle.trim()}
                    data-testid="new-task-submit"
                  >
                    {isCreating ? "…" : "Add"}
                  </Button>
                </form>
              )}
            </KanbanColumn>
          );
        })}
      </div>
    </div>
  );
}
