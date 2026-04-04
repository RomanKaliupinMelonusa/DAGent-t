// =============================================================================
// Task Schemas — Kanban Task Board
// =============================================================================
// Shared Zod schemas for the workspace-scoped Kanban task board.
// Used by both backend (API validation) and frontend (form validation).
// =============================================================================

import { z } from "zod";

/**
 * Valid task status values for the Kanban board columns.
 *
 * - `TODO` — task is in the "To Do" column
 * - `IN_PROGRESS` — task is in the "In Progress" column
 * - `DONE` — task is in the "Done" column
 */
export const TaskStatusSchema = z.enum(["TODO", "IN_PROGRESS", "DONE"]);

export type TaskStatus = z.infer<typeof TaskStatusSchema>;

/**
 * Full task entity as stored in Cosmos DB and returned by the API.
 *
 * @example
 * ```json
 * {
 *   "id": "550e8400-e29b-41d4-a716-446655440000",
 *   "workspaceId": "default",
 *   "title": "Implement login page",
 *   "status": "TODO",
 *   "createdAt": "2026-04-01T12:00:00.000Z",
 *   "updatedAt": "2026-04-01T12:00:00.000Z"
 * }
 * ```
 */
export const TaskSchema = z.object({
  id: z.string().uuid({ message: "id must be a valid UUID" }),
  workspaceId: z.string().min(1, "workspaceId is required"),
  title: z.string().min(1, "Title is required").max(200, "Title must be 200 characters or fewer"),
  status: TaskStatusSchema,
  createdAt: z.string().datetime({ message: "createdAt must be an ISO-8601 datetime string" }),
  updatedAt: z.string().datetime({ message: "updatedAt must be an ISO-8601 datetime string" }),
});

export type Task = z.infer<typeof TaskSchema>;

/**
 * Request schema for POST /tasks — create a new task.
 * Only `title` is required; `workspaceId` is injected server-side.
 *
 * @example
 * ```json
 * { "title": "Implement login page" }
 * ```
 */
export const CreateTaskSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title must be 200 characters or fewer"),
});

export type CreateTask = z.infer<typeof CreateTaskSchema>;

/**
 * Request schema for PATCH /tasks/{id}/status — update a task's status.
 * Only `status` is accepted; all other fields are immutable via this endpoint.
 *
 * @example
 * ```json
 * { "status": "IN_PROGRESS" }
 * ```
 */
export const UpdateTaskStatusSchema = z.object({
  status: TaskStatusSchema,
});

export type UpdateTaskStatus = z.infer<typeof UpdateTaskStatusSchema>;
