// =============================================================================
// fn-audit — Audit Log Endpoints
// =============================================================================
// HTTP triggers:
//   POST /audit — Record a new audit event into Cosmos DB AuditLogs container.
//   GET  /audit — Retrieve the latest 50 audit events ordered by timestamp DESC.
//
// Auth: Protected by APIM auth policy (demo or Entra ID).
// authLevel:"function" ensures only APIM (with the function key) can call it.
//
// Data plane auth uses DefaultAzureCredential (Managed Identity RBAC) — no
// connection strings or API keys. The COSMOS_ENDPOINT env var provides the
// Cosmos DB account endpoint.
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
  AuditLogCreateSchema,
  AuditLogSchema,
  type AuditLog,
} from "@branded/schemas";

// ---------------------------------------------------------------------------
// Lazy Cosmos client singleton
// ---------------------------------------------------------------------------

let _container: Container | null = null;

function getContainer(): Container {
  if (_container) return _container;

  const endpoint = process.env.COSMOS_ENDPOINT;
  if (!endpoint) {
    throw new Error("COSMOS_ENDPOINT environment variable is not set");
  }

  const credential = new DefaultAzureCredential();
  const client = new CosmosClient({ endpoint, aadCredentials: credential });
  _container = client.database("AuditDB").container("AuditLogs");
  return _container;
}

// ---------------------------------------------------------------------------
// Input validation constants
// ---------------------------------------------------------------------------

const MAX_USER_ID_LENGTH = 256;
const MAX_ACTION_LENGTH = 256;

// ---------------------------------------------------------------------------
// POST /audit — Record a new audit event
// ---------------------------------------------------------------------------

async function postAudit(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  // Parse JSON body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return {
      status: 400,
      jsonBody: { error: "INVALID_INPUT", message: "Invalid JSON body." },
    };
  }

  // Validate against schema
  const parsed = AuditLogCreateSchema.safeParse(body);
  if (!parsed.success) {
    const paths = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    return {
      status: 400,
      jsonBody: { error: "INVALID_INPUT", message: paths },
    };
  }

  const { userId, action } = parsed.data;

  // Application-level input validation: length limits
  if (userId.length > MAX_USER_ID_LENGTH) {
    return {
      status: 400,
      jsonBody: {
        error: "INVALID_INPUT",
        message: `userId must be ${MAX_USER_ID_LENGTH} characters or fewer.`,
      },
    };
  }
  if (action.length > MAX_ACTION_LENGTH) {
    return {
      status: 400,
      jsonBody: {
        error: "INVALID_INPUT",
        message: `action must be ${MAX_ACTION_LENGTH} characters or fewer.`,
      },
    };
  }

  // Build full audit log entry with server-generated id + timestamp
  const auditLog: AuditLog = {
    id: randomUUID(),
    userId,
    action,
    timestamp: new Date().toISOString(),
  };

  // Write to Cosmos DB
  try {
    const container = getContainer();
    await container.items.create(auditLog);
  } catch (err) {
    context.error("Failed to write audit log to Cosmos DB:", err);
    return {
      status: 500,
      jsonBody: {
        error: "SERVER_ERROR",
        message: "Failed to record audit event.",
      },
    };
  }

  context.log(`Audit event recorded: ${auditLog.id} — ${action} by ${userId}`);

  return {
    status: 201,
    jsonBody: auditLog,
  };
}

// ---------------------------------------------------------------------------
// GET /audit — Retrieve the latest 50 audit events
// ---------------------------------------------------------------------------

async function getAudit(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const container = getContainer();
    const { resources } = await container.items
      .query("SELECT TOP 50 * FROM c ORDER BY c.timestamp DESC")
      .fetchAll();

    // Validate each record against the schema (defence-in-depth)
    const logs: AuditLog[] = resources.map((r) => AuditLogSchema.parse(r));

    return {
      status: 200,
      jsonBody: logs,
    };
  } catch (err) {
    context.error("Failed to read audit logs from Cosmos DB:", err);
    return {
      status: 500,
      jsonBody: {
        error: "SERVER_ERROR",
        message: "Failed to retrieve audit events.",
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Router — dispatch POST vs GET
// ---------------------------------------------------------------------------

async function auditHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  if (request.method === "POST") {
    return postAudit(request, context);
  }
  return getAudit(request, context);
}

// ---------------------------------------------------------------------------
// Function Registration
// ---------------------------------------------------------------------------

app.http("fn-audit", {
  methods: ["GET", "POST"],
  authLevel: "function",
  route: "audit",
  handler: auditHandler,
});

export default auditHandler;

// Exported for unit testing
export { postAudit, getAudit, getContainer };
