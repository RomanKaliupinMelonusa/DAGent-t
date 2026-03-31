// =============================================================================
// fn-health — System Health Check Endpoint
// =============================================================================
// HTTP trigger: GET /health
// Returns system status. Anonymous — no authentication required.
//
// This endpoint serves as a public probe for monitoring and UI health badges.
// authLevel:"anonymous" allows direct access without a function key or APIM auth.
// APIM is configured with a passthrough policy (no <base />) for this route.
// =============================================================================

import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import type { HealthResponse } from "@branded/schemas";

async function health(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  context.log("Health check endpoint called");

  const body: HealthResponse = {
    status: "ok",
    timestamp: new Date().toISOString(),
  };

  return {
    status: 200,
    jsonBody: body,
  };
}

app.http("fn-health", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "health",
  handler: health,
});

export default health;
