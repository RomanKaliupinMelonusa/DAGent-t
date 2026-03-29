// =============================================================================
// fn-profile — User Profile Endpoint
// =============================================================================
// HTTP trigger: GET + PATCH /profile
// GET  — Returns the current user profile (hardcoded mock).
// PATCH — Validates input via ProfileUpdateSchema, returns merged profile.
//
// Auth: In-function demo token validation via X-Demo-Token header.
// Uses constant-time comparison (crypto.timingSafeEqual) to prevent timing attacks.
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
// Mock profile data
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
    const body: ApiErrorResponse = {
      error: "UNAUTHORIZED",
      message: "Missing or invalid demo token.",
    };
    return { status: 401, jsonBody: body };
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

    // Validate with Zod schema
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

    // Merge with mock profile and return
    const updatedProfile: UserProfile = {
      ...MOCK_PROFILE,
      ...parsed.data,
    };

    context.log("Profile PATCH — returning updated profile");
    return { status: 200, jsonBody: updatedProfile };
  }

  // Should not reach here due to method filter, but just in case
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
