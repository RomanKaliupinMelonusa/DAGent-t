// =============================================================================
// fn-webhooks — Webhook Dispatcher Endpoints
// =============================================================================
// HTTP triggers: POST /webhooks, GET /webhooks
// Manages webhook URL registrations in Cosmos DB.
//
// Auth: APIM handles auth at the gateway (demo or Entra ID).
// authLevel:"function" ensures only APIM (with the function key) can call it.
// Data-plane: DefaultAzureCredential → Cosmos DB (zero API keys).
// =============================================================================

import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { CosmosClient } from "@azure/cosmos";
import { DefaultAzureCredential } from "@azure/identity";
import {
  CreateWebhookRequestSchema,
  type Webhook,
  type WebhookListResponse,
} from "@branded/schemas";
import { randomUUID } from "crypto";

// ---------------------------------------------------------------------------
// Lazy-initialized Cosmos DB singleton
// ---------------------------------------------------------------------------

let cosmosClient: CosmosClient | null = null;

function getCosmosClient(): CosmosClient {
  if (!cosmosClient) {
    const endpoint = process.env.COSMOSDB_ENDPOINT;
    if (!endpoint) {
      throw new Error(
        "COSMOSDB_ENDPOINT environment variable is not set. " +
          "Ensure Terraform has provisioned the Cosmos DB account and the app setting is configured.",
      );
    }
    cosmosClient = new CosmosClient({
      endpoint,
      aadCredentials: new DefaultAzureCredential(),
    });
  }
  return cosmosClient;
}

function getWebhooksContainer() {
  return getCosmosClient()
    .database("sample-app-db")
    .container("Webhooks");
}

// ---------------------------------------------------------------------------
// POST /api/webhooks — Register a new webhook URL
// ---------------------------------------------------------------------------

export async function createWebhook(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  context.log("POST /api/webhooks called");

  // Parse request body
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return {
      status: 400,
      jsonBody: {
        error: "INVALID_INPUT",
        message: "Request body must be valid JSON.",
      },
    };
  }

  // Validate with Zod schema
  const parsed = CreateWebhookRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    return {
      status: 400,
      jsonBody: {
        error: "INVALID_INPUT",
        message: `Validation failed: ${issues}`,
      },
    };
  }

  const { url, workspaceId } = parsed.data;

  // Input validation: limit URL length to prevent abuse
  if (url.length > 2048) {
    return {
      status: 400,
      jsonBody: {
        error: "INVALID_INPUT",
        message: "URL must be 2048 characters or fewer.",
      },
    };
  }

  // Input validation: limit workspaceId length
  if (workspaceId.length > 128) {
    return {
      status: 400,
      jsonBody: {
        error: "INVALID_INPUT",
        message: "workspaceId must be 128 characters or fewer.",
      },
    };
  }

  const webhook: Webhook = {
    id: randomUUID(),
    workspaceId,
    url,
    createdAt: new Date().toISOString(),
  };

  try {
    const container = getWebhooksContainer();
    await container.items.upsert(webhook);
  } catch (err) {
    context.error("Failed to upsert webhook to Cosmos DB:", err);
    return {
      status: 500,
      jsonBody: {
        error: "INTERNAL_ERROR",
        message: "Failed to persist webhook. Please try again later.",
      },
    };
  }

  context.log(`Webhook created: id=${webhook.id}, url=${webhook.url}`);

  return {
    status: 201,
    jsonBody: webhook,
  };
}

// ---------------------------------------------------------------------------
// GET /api/webhooks — List registered webhooks
// ---------------------------------------------------------------------------

export async function listWebhooks(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  context.log("GET /api/webhooks called");

  const workspaceId = request.query.get("workspaceId");

  try {
    const container = getWebhooksContainer();

    let querySpec;
    if (workspaceId) {
      // Input validation: limit workspaceId length
      if (workspaceId.length > 128) {
        return {
          status: 400,
          jsonBody: {
            error: "INVALID_INPUT",
            message: "workspaceId must be 128 characters or fewer.",
          },
        };
      }
      querySpec = {
        query: "SELECT * FROM c WHERE c.workspaceId = @workspaceId",
        parameters: [{ name: "@workspaceId", value: workspaceId }],
      };
    } else {
      querySpec = { query: "SELECT * FROM c" };
    }

    const { resources } = await container.items
      .query(querySpec)
      .fetchAll();

    const body: WebhookListResponse = { webhooks: resources };

    return {
      status: 200,
      jsonBody: body,
    };
  } catch (err) {
    context.error("Failed to query webhooks from Cosmos DB:", err);
    return {
      status: 500,
      jsonBody: {
        error: "INTERNAL_ERROR",
        message: "Failed to retrieve webhooks. Please try again later.",
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

app.http("fn-webhooks-post", {
  methods: ["POST"],
  authLevel: "function",
  route: "webhooks",
  handler: createWebhook,
});

app.http("fn-webhooks-get", {
  methods: ["GET"],
  authLevel: "function",
  route: "webhooks",
  handler: listWebhooks,
});
