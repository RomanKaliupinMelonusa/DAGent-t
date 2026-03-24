// =============================================================================
// fn-hello — Sample Protected Endpoint
// =============================================================================
// HTTP trigger: GET /hello
// Returns a greeting. Protected by APIM auth policy (demo or Entra ID).
//
// This endpoint demonstrates the dual-mode auth pattern:
//   - Demo mode:  APIM validates X-Demo-Token header via check-header policy
//   - Entra mode: APIM validates Bearer JWT via validate-jwt policy
//
// The function itself does not check auth — APIM handles it at the gateway.
// authLevel:"function" ensures only APIM (with the function key) can call it.
// =============================================================================

import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import type { HelloResponse } from "@branded/schemas";

async function hello(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const name = request.query.get("name") ?? "World";

  // Input validation: limit name length to prevent abuse
  if (name.length > 100) {
    return {
      status: 400,
      jsonBody: {
        error: "INVALID_INPUT",
        message: "Name parameter must be 100 characters or fewer.",
      },
    };
  }

  context.log(`Hello endpoint called with name=${name}`);

  const body: HelloResponse = {
    message: `Hello, ${name}!`,
    timestamp: new Date().toISOString(),
  };

  return {
    status: 200,
    jsonBody: body,
  };
}

app.http("fn-hello", {
  methods: ["GET"],
  authLevel: "function",
  route: "hello",
  handler: hello,
});

export default hello;
