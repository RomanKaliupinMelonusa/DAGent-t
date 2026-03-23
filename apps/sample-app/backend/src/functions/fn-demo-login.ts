// =============================================================================
// fn-demo-login — Demo Auth Login
// =============================================================================
// HTTP trigger: POST /auth/login
// Validates shared demo credentials and returns a static demo token.
// Only active when AUTH_MODE=demo; returns 404 otherwise.
//
// The demo token is used as X-Demo-Token header on subsequent API calls.
// APIM validates this token via <check-header> policy in demo mode.
//
// Security: Uses crypto.timingSafeEqual for constant-time comparison to
// prevent timing attacks on credential validation.
//
// To switch to Entra ID auth, set AUTH_MODE=entra. This endpoint becomes
// inactive and the frontend uses MSAL redirect-based login instead.
// =============================================================================

import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { z } from "zod";
import { timingSafeEqual } from "crypto";

// ---------------------------------------------------------------------------
// Request Schema
// ---------------------------------------------------------------------------

const DemoLoginRequestSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

// ---------------------------------------------------------------------------
// Constant-time string comparison
// ---------------------------------------------------------------------------

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Compare against self to maintain constant time, then return false
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

async function demoLogin(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  // Guard: only active in demo mode
  if (process.env.AUTH_MODE !== "demo") {
    return {
      status: 404,
      jsonBody: { error: "NOT_FOUND", message: "Demo auth is disabled." },
    };
  }

  // Parse and validate request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return {
      status: 400,
      jsonBody: { error: "INVALID_INPUT", message: "Invalid JSON body." },
    };
  }

  const parsed = DemoLoginRequestSchema.safeParse(body);
  if (!parsed.success) {
    const paths = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    return {
      status: 400,
      jsonBody: { error: "INVALID_INPUT", message: paths },
    };
  }

  const { username, password } = parsed.data;

  // Validate credentials
  const expectedUser = process.env.DEMO_USER ?? "";
  const expectedPass = process.env.DEMO_PASS ?? "";

  if (!safeEqual(username, expectedUser) || !safeEqual(password, expectedPass)) {
    context.log("Demo login failed: invalid credentials");
    return {
      status: 401,
      jsonBody: {
        error: "UNAUTHORIZED",
        message: "Invalid username or password.",
      },
    };
  }

  const token = process.env.DEMO_TOKEN ?? "";

  context.log("Demo login successful");
  return {
    status: 200,
    jsonBody: {
      token,
      displayName: "Demo User",
    },
  };
}

// ---------------------------------------------------------------------------
// Function Registration
// ---------------------------------------------------------------------------

app.http("fn-demo-login", {
  methods: ["POST"],
  authLevel: "function",
  route: "auth/login",
  handler: demoLogin,
});

export default demoLogin;
