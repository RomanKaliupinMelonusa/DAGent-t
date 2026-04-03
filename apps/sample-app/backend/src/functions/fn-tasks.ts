// =============================================================================
// fn-tasks — Kanban Task Board API
// =============================================================================
// HTTP triggers: GET /tasks, POST /tasks, PATCH /tasks/{id}/status
// CRUD operations for workspace-scoped tasks stored in Cosmos DB.
//
// Authentication: authLevel "function" — APIM handles dual-mode auth
// (demo X-Demo-Token or Entra ID JWT) at the gateway layer.
//
// Data: Cosmos DB serverless (session consistency), partition key /workspaceId.
// Auth: DefaultAzureCredential — zero API keys in code.
// =============================================================================

import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { CosmosClient, Container } from "@azure/cosmos";
import { randomUUID } from "crypto";
import {
  CreateTaskSchema,
  UpdateTaskStatusSchema,
  type Task,
} from "@branded/schemas";

// ---------------------------------------------------------------------------
// Cosmos DB Singleton (lazy-init)
// ---------------------------------------------------------------------------

let _container: Container | null = null;

function getContainer(): Container {
  if (_container) return _container;

  const endpoint = process.env.COSMOSDB_ENDPOINT;
  const databaseName = process.env.COSMOSDB_DATABASE_NAME;

  if (!endpoint || !databaseName) {
    throw new Error(
      "Missing COSMOSDB_ENDPOINT or COSMOSDB_DATABASE_NAME env vars.",
    );
  }

  const credential = new DefaultAzureCredential();
  const client = new CosmosClient({ endpoint, aadCredentials: credential });
  _container = client
    .database(databaseName)
    .container("Tasks");

  return _container;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WORKSPACE_ID = "default";
const DEFAULT_MAX_TASKS = 500;

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
        query: "SELECT * FROM c WHERE c.workspaceId = @workspaceId",
        parameters: [{ name: "@workspaceId", value: WORKSPACE_ID }],
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

export async function createTask(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  context.log("POST /api/tasks — creating task");

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

  // Validate with Zod
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
    const maxTasks = parseInt(
      process.env.MAX_TASKS_PER_WORKSPACE ?? String(DEFAULT_MAX_TASKS),
      10,
    );
    const { resources: countResult } = await container.items
      .query({
        query:
          "SELECT VALUE COUNT(1) FROM c WHERE c.workspaceId = @workspaceId",
        parameters: [{ name: "@workspaceId", value: WORKSPACE_ID }],
      })
      .fetchAll();

    const currentCount = countResult[0] ?? 0;
    if (currentCount >= maxTasks) {
      return {
        status: 429,
        jsonBody: {
          error: "LIMIT_EXCEEDED",
          message: `Task limit of ${maxTasks} per workspace exceeded.`,
        },
      };
    }

    const now = new Date().toISOString();
    const task: Task = {
      id: randomUUID(),
      workspaceId: WORKSPACE_ID,
      title: parsed.data.title,
      status: "TODO",
      createdAt: now,
      updatedAt: now,
    };

    await container.items.create(task);

    context.log("Task created:", task.id);
    return {
      status: 201,
      jsonBody: task,
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

export async function updateTaskStatus(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const id = request.params.id;
  context.log("PATCH /api/tasks/%s/status", id);

  if (!id) {
    return {
      status: 400,
      jsonBody: { error: "INVALID_INPUT", message: "Missing task ID." },
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

  // Validate with Zod
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
    const itemRef = container.item(id, WORKSPACE_ID);

    // Read existing item
    const { resource: existing } = await itemRef.read<Task>();
    if (!existing) {
      return {
        status: 404,
        jsonBody: { error: "NOT_FOUND", message: "Task not found." },
      };
    }

    // Update status + updatedAt
    const updated: Task = {
      ...existing,
      status: parsed.data.status,
      updatedAt: new Date().toISOString(),
    };

    await itemRef.replace(updated);

    context.log("Task %s status updated to %s", id, parsed.data.status);
    return {
      status: 200,
      jsonBody: updated,
    };
  } catch (err: unknown) {
    // Handle Cosmos 404 (item not found during read/replace)
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code: number }).code === 404
    ) {
      return {
        status: 404,
        jsonBody: { error: "NOT_FOUND", message: "Task not found." },
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
// Function Registration
// ---------------------------------------------------------------------------

app.http("fn-tasks-list", {
  methods: ["GET"],
  authLevel: "function",
  route: "tasks",
  handler: listTasks,
});

app.http("fn-tasks-create", {
  methods: ["POST"],
  authLevel: "function",
  route: "tasks",
  handler: createTask,
});

app.http("fn-tasks-update-status", {
  methods: ["PATCH"],
  authLevel: "function",
  route: "tasks/{id}/status",
  handler: updateTaskStatus,
});
