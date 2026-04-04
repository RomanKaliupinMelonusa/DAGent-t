// =============================================================================
// fn-tasks — Kanban Task Board API
// =============================================================================
// HTTP triggers:
//   GET    /api/tasks             — List all tasks for default workspace
//   POST   /api/tasks             — Create a new task
//   PATCH  /api/tasks/{id}/status — Update task status
//
// Auth: authLevel:"function" — APIM validates auth at the gateway.
// Data: Cosmos DB via DefaultAzureCredential (zero API keys).
// =============================================================================

import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { CosmosClient, Container } from "@azure/cosmos";
import {
  CreateTaskSchema,
  UpdateTaskStatusSchema,
  type Task,
} from "@branded/schemas";
import { randomUUID } from "crypto";

// ---------------------------------------------------------------------------
// Cosmos DB Singleton (lazy-init)
// ---------------------------------------------------------------------------

const WORKSPACE_ID = "default";

let _container: Container | null = null;

function getContainer(): Container {
  if (_container) return _container;

  const endpoint = process.env.COSMOSDB_ENDPOINT;
  const databaseName = process.env.COSMOSDB_DATABASE_NAME;

  if (!endpoint || !databaseName) {
    throw new Error(
      "Missing COSMOSDB_ENDPOINT or COSMOSDB_DATABASE_NAME environment variables.",
    );
  }

  const credential = new DefaultAzureCredential();
  const client = new CosmosClient({ endpoint, aadCredentials: credential });
  _container = client.database(databaseName).container("Tasks");
  return _container;
}

// ---------------------------------------------------------------------------
// GET /api/tasks — List all tasks for workspace
// ---------------------------------------------------------------------------

export async function listTasks(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  context.log("GET /api/tasks — listing tasks");

  try {
    const container = getContainer();
    const { resources } = await container.items
      .query<Task>({
        query: "SELECT * FROM c WHERE c.workspaceId = @wsId ORDER BY c.createdAt DESC",
        parameters: [{ name: "@wsId", value: WORKSPACE_ID }],
      })
      .fetchAll();

    return { status: 200, jsonBody: resources };
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

  // Parse request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return {
      status: 400,
      jsonBody: {
        error: "INVALID_INPUT",
        message: "Request body must be valid JSON.",
      },
    };
  }

  // Validate with Zod
  const parsed = CreateTaskSchema.safeParse(body);
  if (!parsed.success) {
    return {
      status: 400,
      jsonBody: {
        error: "INVALID_INPUT",
        message: parsed.error.issues.map((i) => i.message).join("; "),
      },
    };
  }

  try {
    const container = getContainer();

    // Enforce MAX_TASKS_PER_WORKSPACE
    const maxTasks = parseInt(
      process.env.MAX_TASKS_PER_WORKSPACE ?? "500",
      10,
    );
    const { resources: countResult } = await container.items
      .query<number>({
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
          error: "LIMIT_EXCEEDED",
          message: `Workspace task limit (${maxTasks}) reached. Delete existing tasks before creating new ones.`,
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

    return { status: 201, jsonBody: task };
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
  const taskId = request.params.id;
  context.log(`PATCH /api/tasks/${taskId}/status — updating status`);

  if (!taskId) {
    return {
      status: 400,
      jsonBody: { error: "INVALID_INPUT", message: "Task ID is required." },
    };
  }

  // Parse request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return {
      status: 400,
      jsonBody: {
        error: "INVALID_INPUT",
        message: "Request body must be valid JSON.",
      },
    };
  }

  // Validate with Zod
  const parsed = UpdateTaskStatusSchema.safeParse(body);
  if (!parsed.success) {
    return {
      status: 400,
      jsonBody: {
        error: "INVALID_INPUT",
        message: parsed.error.issues.map((i) => i.message).join("; "),
      },
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

    // Update status and updatedAt
    const updated: Task = {
      ...existing,
      status: parsed.data.status,
      updatedAt: new Date().toISOString(),
    };

    const { resource: replaced } = await itemRef.replace(updated);

    return { status: 200, jsonBody: replaced };
  } catch (err: unknown) {
    // Handle Cosmos 404 (item not found during read/replace race)
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
// Register HTTP Triggers
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
