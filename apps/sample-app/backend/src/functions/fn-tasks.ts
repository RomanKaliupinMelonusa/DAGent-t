// =============================================================================
// fn-tasks — Kanban Task Board API
// =============================================================================
// HTTP triggers: GET /tasks, POST /tasks, PATCH /tasks/{id}/status
//
// Manages tasks in Azure Cosmos DB with workspace-scoped partitioning.
// Uses DefaultAzureCredential for Cosmos auth (zero API keys).
//
// Task count per workspace is enforced via MAX_TASKS_PER_WORKSPACE env var
// (default 500). POST returns 429 when the limit is exceeded.
// =============================================================================

import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { CosmosClient, Container } from "@azure/cosmos";
import { DefaultAzureCredential } from "@azure/identity";
import {
  CreateTaskSchema,
  UpdateTaskStatusSchema,
  TaskSchema,
  type Task,
  type ApiErrorResponse,
} from "@branded/schemas";
import { randomUUID } from "crypto";

// ---------------------------------------------------------------------------
// Cosmos DB — Lazy-Init Singleton
// ---------------------------------------------------------------------------

const WORKSPACE_ID = "default";

let _container: Container | null = null;

function getContainer(): Container {
  if (_container) return _container;

  const endpoint = process.env.COSMOSDB_ENDPOINT;
  const databaseName = process.env.COSMOSDB_DATABASE_NAME;

  if (!endpoint || !databaseName) {
    throw new Error(
      "Missing COSMOSDB_ENDPOINT or COSMOSDB_DATABASE_NAME environment variable",
    );
  }

  const credential = new DefaultAzureCredential();
  const client = new CosmosClient({ endpoint, aadCredentials: credential });
  _container = client.database(databaseName).container("Tasks");
  return _container;
}

function getMaxTasks(): number {
  const raw = process.env.MAX_TASKS_PER_WORKSPACE;
  if (!raw) return 500;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 500;
}

// ---------------------------------------------------------------------------
// GET /api/tasks — List all tasks for the default workspace
// ---------------------------------------------------------------------------

export async function listTasks(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  context.log("GET /api/tasks — listing tasks for workspace:", WORKSPACE_ID);

  try {
    const container = getContainer();
    const { resources } = await container.items
      .query({
        query: "SELECT * FROM c WHERE c.workspaceId = @wsId ORDER BY c.createdAt DESC",
        parameters: [{ name: "@wsId", value: WORKSPACE_ID }],
      })
      .fetchAll();

    return {
      status: 200,
      jsonBody: resources,
    };
  } catch (err) {
    context.error("Failed to list tasks:", err);
    const body: ApiErrorResponse = {
      error: "SERVER_ERROR",
      message: "Failed to retrieve tasks.",
    };
    return { status: 500, jsonBody: body };
  }
}

// ---------------------------------------------------------------------------
// POST /api/tasks — Create a new task
// ---------------------------------------------------------------------------

export async function createTask(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  context.log("POST /api/tasks — creating task in workspace:", WORKSPACE_ID);

  // Parse request body
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    const body: ApiErrorResponse = {
      error: "INVALID_INPUT",
      message: "Invalid JSON body.",
    };
    return { status: 400, jsonBody: body };
  }

  // Validate with Zod
  const parsed = CreateTaskSchema.safeParse(rawBody);
  if (!parsed.success) {
    const paths = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    const body: ApiErrorResponse = {
      error: "INVALID_INPUT",
      message: paths,
    };
    return { status: 400, jsonBody: body };
  }

  try {
    const container = getContainer();

    // Enforce MAX_TASKS_PER_WORKSPACE
    const maxTasks = getMaxTasks();
    const { resources: countResult } = await container.items
      .query({
        query:
          "SELECT VALUE COUNT(1) FROM c WHERE c.workspaceId = @wsId",
        parameters: [{ name: "@wsId", value: WORKSPACE_ID }],
      })
      .fetchAll();

    const currentCount = countResult[0] ?? 0;
    if (currentCount >= maxTasks) {
      return {
        status: 429,
        jsonBody: {
          error: "RATE_LIMITED",
          message: `Workspace task limit exceeded (max ${maxTasks}).`,
        },
      };
    }

    // Build the task
    const now = new Date().toISOString();
    const task: Task = {
      id: randomUUID(),
      workspaceId: WORKSPACE_ID,
      title: parsed.data.title,
      status: "TODO",
      createdAt: now,
      updatedAt: now,
    };

    // Write to Cosmos DB
    await container.items.create(task);

    context.log("Task created:", task.id);
    return { status: 201, jsonBody: task };
  } catch (err) {
    context.error("Failed to create task:", err);
    const body: ApiErrorResponse = {
      error: "SERVER_ERROR",
      message: "Failed to create task.",
    };
    return { status: 500, jsonBody: body };
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/tasks/{id}/status — Update task status
// ---------------------------------------------------------------------------

export async function updateTaskStatus(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const taskId = request.params.id;
  context.log(
    `PATCH /api/tasks/${taskId}/status — updating status in workspace:`,
    WORKSPACE_ID,
  );

  if (!taskId) {
    const body: ApiErrorResponse = {
      error: "INVALID_INPUT",
      message: "Task ID is required.",
    };
    return { status: 400, jsonBody: body };
  }

  // Parse request body
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    const body: ApiErrorResponse = {
      error: "INVALID_INPUT",
      message: "Invalid JSON body.",
    };
    return { status: 400, jsonBody: body };
  }

  // Validate with Zod
  const parsed = UpdateTaskStatusSchema.safeParse(rawBody);
  if (!parsed.success) {
    const paths = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    const body: ApiErrorResponse = {
      error: "INVALID_INPUT",
      message: paths,
    };
    return { status: 400, jsonBody: body };
  }

  try {
    const container = getContainer();
    const itemRef = container.item(taskId, WORKSPACE_ID);

    // Read the existing task
    const { resource: existing } = await itemRef.read<Task>();
    if (!existing) {
      const body: ApiErrorResponse = {
        error: "NOT_FOUND",
        message: `Task ${taskId} not found.`,
      };
      return { status: 404, jsonBody: body };
    }

    // Update status + updatedAt
    const updated: Task = {
      ...existing,
      status: parsed.data.status,
      updatedAt: new Date().toISOString(),
    };

    await itemRef.replace(updated);

    context.log("Task updated:", taskId, "→", parsed.data.status);
    return { status: 200, jsonBody: updated };
  } catch (err: unknown) {
    // Handle 404 from Cosmos (item not found during read)
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: number }).code === 404
    ) {
      const body: ApiErrorResponse = {
        error: "NOT_FOUND",
        message: `Task ${taskId} not found.`,
      };
      return { status: 404, jsonBody: body };
    }
    context.error("Failed to update task status:", err);
    const body: ApiErrorResponse = {
      error: "SERVER_ERROR",
      message: "Failed to update task status.",
    };
    return { status: 500, jsonBody: body };
  }
}

// ---------------------------------------------------------------------------
// Function Registrations
// ---------------------------------------------------------------------------

app.http("fn-list-tasks", {
  methods: ["GET"],
  authLevel: "function",
  route: "tasks",
  handler: listTasks,
});

app.http("fn-create-task", {
  methods: ["POST"],
  authLevel: "function",
  route: "tasks",
  handler: createTask,
});

app.http("fn-update-task-status", {
  methods: ["PATCH"],
  authLevel: "function",
  route: "tasks/{id}/status",
  handler: updateTaskStatus,
});
