// =============================================================================
// fn-tasks — Kanban Task Board API
// =============================================================================
// HTTP triggers: GET /tasks, POST /tasks, PATCH /tasks/{id}/status
// Manages workspace-scoped tasks stored in Cosmos DB (serverless).
//
// Auth: authLevel:"function" — APIM gateway handles dual-mode auth.
// Cosmos: DefaultAzureCredential — zero API keys (hard rule #4).
//
// Environment:
//   COSMOSDB_ENDPOINT       — Cosmos DB account endpoint
//   COSMOSDB_DATABASE_NAME  — Database name (sample-app-db)
//   MAX_TASKS_PER_WORKSPACE — Task limit per workspace (default 500)
// =============================================================================

import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { CosmosClient, Container } from "@azure/cosmos";
import { DefaultAzureCredential } from "@azure/identity";
import { randomUUID } from "crypto";
import {
  CreateTaskSchema,
  UpdateTaskStatusSchema,
  type Task,
} from "@branded/schemas";

// ---------------------------------------------------------------------------
// Cosmos DB — Lazy-init singleton
// ---------------------------------------------------------------------------

const WORKSPACE_ID = "default";
const CONTAINER_NAME = "Tasks";

let _container: Container | null = null;

function getContainer(): Container {
  if (_container) return _container;

  const endpoint = process.env.COSMOSDB_ENDPOINT;
  const databaseName = process.env.COSMOSDB_DATABASE_NAME;

  if (!endpoint || !databaseName) {
    throw new Error(
      "Missing COSMOSDB_ENDPOINT or COSMOSDB_DATABASE_NAME environment variable.",
    );
  }

  const credential = new DefaultAzureCredential();
  const client = new CosmosClient({ endpoint, aadCredentials: credential });
  _container = client
    .database(databaseName)
    .container(CONTAINER_NAME);

  return _container;
}

function getMaxTasks(): number {
  const raw = process.env.MAX_TASKS_PER_WORKSPACE;
  if (!raw) return 500;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 500;
}

// ---------------------------------------------------------------------------
// GET /api/tasks — List tasks for workspace
// ---------------------------------------------------------------------------

async function listTasks(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  context.log("GET /tasks — listing tasks for workspace:", WORKSPACE_ID);

  try {
    const container = getContainer();
    const { resources } = await container.items
      .query({
        query: "SELECT * FROM c WHERE c.workspaceId = @ws ORDER BY c.createdAt DESC",
        parameters: [{ name: "@ws", value: WORKSPACE_ID }],
      })
      .fetchAll();

    return {
      status: 200,
      jsonBody: resources as Task[],
    };
  } catch (err) {
    context.error("Failed to list tasks:", err);
    return {
      status: 500,
      jsonBody: { error: "INTERNAL_ERROR", message: "Failed to list tasks." },
    };
  }
}

// ---------------------------------------------------------------------------
// POST /api/tasks — Create a new task
// ---------------------------------------------------------------------------

async function createTask(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  context.log("POST /tasks — creating task in workspace:", WORKSPACE_ID);

  // Parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return {
      status: 400,
      jsonBody: { error: "INVALID_INPUT", message: "Invalid JSON body." },
    };
  }

  // Validate input
  const parsed = CreateTaskSchema.safeParse(body);
  if (!parsed.success) {
    const paths = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    return {
      status: 400,
      jsonBody: { error: "INVALID_INPUT", message: paths },
    };
  }

  try {
    const container = getContainer();

    // Enforce MAX_TASKS_PER_WORKSPACE
    const maxTasks = getMaxTasks();
    const { resources: countResult } = await container.items
      .query({
        query: "SELECT VALUE COUNT(1) FROM c WHERE c.workspaceId = @ws",
        parameters: [{ name: "@ws", value: WORKSPACE_ID }],
      })
      .fetchAll();

    const currentCount = countResult[0] ?? 0;
    if (currentCount >= maxTasks) {
      context.warn(
        `Workspace ${WORKSPACE_ID} has ${currentCount} tasks (limit: ${maxTasks})`,
      );
      return {
        status: 429,
        jsonBody: {
          error: "LIMIT_EXCEEDED",
          message: `Workspace task limit of ${maxTasks} reached.`,
        },
      };
    }

    // Create the task
    const now = new Date().toISOString();
    const task: Task = {
      id: randomUUID(),
      workspaceId: WORKSPACE_ID,
      title: parsed.data.title,
      status: "TODO",
      createdAt: now,
      updatedAt: now,
    };

    const { resource } = await container.items.create(task);

    context.log("Task created:", task.id);
    return {
      status: 201,
      jsonBody: resource as Task,
    };
  } catch (err) {
    context.error("Failed to create task:", err);
    return {
      status: 500,
      jsonBody: { error: "INTERNAL_ERROR", message: "Failed to create task." },
    };
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/tasks/{id}/status — Update task status
// ---------------------------------------------------------------------------

async function updateTaskStatus(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const taskId = request.params.id;
  context.log(`PATCH /tasks/${taskId}/status — updating status`);

  if (!taskId) {
    return {
      status: 400,
      jsonBody: { error: "INVALID_INPUT", message: "Task ID is required." },
    };
  }

  // Parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return {
      status: 400,
      jsonBody: { error: "INVALID_INPUT", message: "Invalid JSON body." },
    };
  }

  // Validate input
  const parsed = UpdateTaskStatusSchema.safeParse(body);
  if (!parsed.success) {
    const paths = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    return {
      status: 400,
      jsonBody: { error: "INVALID_INPUT", message: paths },
    };
  }

  try {
    const container = getContainer();
    const itemRef = container.item(taskId, WORKSPACE_ID);

    // Read existing task
    const { resource: existing } = await itemRef.read<Task>();
    if (!existing) {
      return {
        status: 404,
        jsonBody: { error: "NOT_FOUND", message: `Task ${taskId} not found.` },
      };
    }

    // Update status + updatedAt
    const updated: Task = {
      ...existing,
      status: parsed.data.status,
      updatedAt: new Date().toISOString(),
    };

    const { resource } = await itemRef.replace(updated);

    context.log(`Task ${taskId} status updated to ${parsed.data.status}`);
    return {
      status: 200,
      jsonBody: resource as Task,
    };
  } catch (err: unknown) {
    // Handle 404 from Cosmos (item not found throws with code 404)
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: number }).code === 404
    ) {
      return {
        status: 404,
        jsonBody: { error: "NOT_FOUND", message: `Task ${taskId} not found.` },
      };
    }
    context.error("Failed to update task status:", err);
    return {
      status: 500,
      jsonBody: {
        error: "INTERNAL_ERROR",
        message: "Failed to update task status.",
      },
    };
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

// Export handlers for unit testing
export { listTasks, createTask, updateTaskStatus };
