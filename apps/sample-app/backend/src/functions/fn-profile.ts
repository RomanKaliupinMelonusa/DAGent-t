// =============================================================================
// fn-profile — User Profile Endpoint
// =============================================================================
// HTTP trigger: GET + PATCH /profile
// Returns or updates the authenticated user's profile.
//
// Auth: In-function validation of X-Demo-Token header (demo mode).
// Uses crypto.timingSafeEqual for constant-time comparison to prevent
// timing attacks on token validation.
//
// GET  /profile → 200 UserProfile | 401
// PATCH /profile → 200 UserProfile | 400 | 401
// =============================================================================

import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { timingSafeEqual } from "crypto";
import {
  ProfileUpdateSchema,
  type UserProfile,
  type ApiErrorResponse,
} from "@branded/schemas";

// ---------------------------------------------------------------------------
// Constant-time string comparison (duplicated from fn-demo-login.ts)
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
// Mock Profile Data
// ---------------------------------------------------------------------------

const MOCK_PROFILE: UserProfile = {
  id: "00000000-0000-0000-0000-000000000001",
  displayName: "Demo User",
  email: "demo@example.com",
  theme: "system",
};

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

async function profileHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  // Auth guard: validate X-Demo-Token header
  const token = request.headers.get("x-demo-token");
  const expectedToken = process.env.DEMO_TOKEN ?? "";

  if (!token || !safeEqual(token, expectedToken)) {
    const errorBody: ApiErrorResponse = {
      error: "UNAUTHORIZED",
      message: "Missing or invalid demo token.",
    };
    return { status: 401, jsonBody: errorBody };
  }

  // Route by method
  if (request.method === "GET") {
    context.log("Profile GET — returning mock profile");
    return { status: 200, jsonBody: MOCK_PROFILE };
  }

  if (request.method === "PATCH") {
    // Parse JSON body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      const errorBody: ApiErrorResponse = {
        error: "INVALID_INPUT",
        message: "Invalid JSON body.",
      };
      return { status: 400, jsonBody: errorBody };
    }

    // Validate with ProfileUpdateSchema
    const parsed = ProfileUpdateSchema.safeParse(body);
    if (!parsed.success) {
      const paths = parsed.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ");
      const errorBody: ApiErrorResponse = {
        error: "INVALID_INPUT",
        message: paths,
      };
      return { status: 400, jsonBody: errorBody };
    }

    // Merge update into mock profile
    const updatedProfile: UserProfile = {
      ...MOCK_PROFILE,
      ...parsed.data,
    };

    context.log("Profile PATCH — returning updated profile");
    return { status: 200, jsonBody: updatedProfile };
  }

  // Unsupported method (shouldn't reach here due to route config)
  return {
    status: 405,
    jsonBody: { error: "METHOD_NOT_ALLOWED", message: "Method not allowed." },
  };
}

// ---------------------------------------------------------------------------
// Function Registration
// ---------------------------------------------------------------------------

app.http("fn-profile", {
  methods: ["GET", "PATCH"],
  authLevel: "function",
  route: "profile",
  handler: profileHandler,
});

export default profileHandler;
