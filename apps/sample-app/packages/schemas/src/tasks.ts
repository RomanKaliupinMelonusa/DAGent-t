// =============================================================================
// Task Schemas
// =============================================================================
// Kanban task board data models — shared between backend & frontend.
// Supports task CRUD and status transitions across columns.
// =============================================================================

import { z } from "zod";

/**
 * Valid task statuses corresponding to Kanban board columns.
 *
 * @example
 * ```ts
 * TaskStatusSchema.parse("TODO");       // ✓
 * TaskStatusSchema.parse("IN_PROGRESS"); // ✓
 * TaskStatusSchema.parse("DONE");       // ✓
 * TaskStatusSchema.parse("INVALID");    // ✗ throws
 * ```
 */
export const TaskStatusSchema = z.enum(["TODO", "IN_PROGRESS", "DONE"]);

export type TaskStatus = z.infer<typeof TaskStatusSchema>;

/**
 * Full task entity as stored in Cosmos DB and returned by the API.
 *
 * @example
 * ```json
 * {
 *   "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
 *   "workspaceId": "default",
 *   "title": "Implement drag-and-drop",
 *   "status": "TODO",
 *   "createdAt": "2026-04-05T00:00:00.000Z",
 *   "updatedAt": "2026-04-05T00:00:00.000Z"
 * }
 * ```
 */
export const TaskSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  title: z.string(),
  status: TaskStatusSchema,
  createdAt: z.string().datetime({ message: "createdAt must be an ISO-8601 datetime string" }),
  updatedAt: z.string().datetime({ message: "updatedAt must be an ISO-8601 datetime string" }),
});

export type Task = z.infer<typeof TaskSchema>;

/**
 * Request schema for POST /tasks — create a new task.
 * `workspaceId` is injected server-side, not provided by the client.
 *
 * @example
 * ```json
 * { "title": "Fix login bug" }
 * ```
 */
export const CreateTaskSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title must be 200 characters or fewer"),
});

export type CreateTask = z.infer<typeof CreateTaskSchema>;

/**
 * Request schema for PATCH /tasks/:id/status — transition a task to a new status.
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
