// =============================================================================
// Task Board Schemas
// =============================================================================
// Kanban task board — tasks with status columns (TODO, IN_PROGRESS, DONE).
// Used by GET /tasks, POST /tasks, PATCH /tasks/{id}/status.
// =============================================================================

import { z } from "zod";

/**
 * Valid task statuses corresponding to Kanban columns.
 */
export const TaskStatusSchema = z.enum(["TODO", "IN_PROGRESS", "DONE"]);

export type TaskStatus = z.infer<typeof TaskStatusSchema>;

/**
 * Full task entity as persisted in Cosmos DB and returned by the API.
 *
 * @example
 * ```json
 * {
 *   "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
 *   "workspaceId": "default",
 *   "title": "Implement login flow",
 *   "status": "TODO",
 *   "createdAt": "2026-04-03T12:00:00.000Z",
 *   "updatedAt": "2026-04-03T12:00:00.000Z"
 * }
 * ```
 */
export const TaskSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().min(1),
  title: z.string().min(1).max(200),
  status: TaskStatusSchema,
  createdAt: z.string().datetime({ message: "createdAt must be an ISO-8601 datetime string" }),
  updatedAt: z.string().datetime({ message: "updatedAt must be an ISO-8601 datetime string" }),
});

export type Task = z.infer<typeof TaskSchema>;

/**
 * Request body for POST /tasks — create a new task.
 * `workspaceId` is injected server-side; only `title` comes from the client.
 *
 * @example
 * ```json
 * { "title": "Implement login flow" }
 * ```
 */
export const CreateTaskSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title must be 200 characters or fewer"),
});

export type CreateTask = z.infer<typeof CreateTaskSchema>;

/**
 * Request body for PATCH /tasks/{id}/status — update task status only.
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
