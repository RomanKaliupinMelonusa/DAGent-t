// =============================================================================
// fn-health — Health Check Endpoint
// =============================================================================
// HTTP trigger: GET /health
// Returns deployment health status. Anonymous auth — reachable by
// infrastructure probes and CI pipelines without function keys.
//
// The `mode` field reflects the STRICT_HEALTH_MODE environment variable
// injected by CI/CD (deploy-backend.yml). When absent, defaults to "disabled".
// =============================================================================

import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";

async function health(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  context.log("Health endpoint called");

  return {
    status: 200,
    jsonBody: {
      status: "ok",
      mode: process.env.STRICT_HEALTH_MODE || "disabled",
    },
  };
}

app.http("fn-health", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "health",
  handler: health,
});

export default health;
