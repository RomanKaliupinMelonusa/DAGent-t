// =============================================================================
// fn-profile — User Profile API
// =============================================================================
// HTTP trigger: GET + PATCH /profile
// GET  — returns the authenticated user's hardcoded mock profile.
// PATCH — validates update payload and returns merged profile.
//
// Auth: In-function demo token validation via X-Demo-Token header.
// Uses constant-time comparison (crypto.timingSafeEqual) to prevent
// timing attacks on token validation.
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
    const errorBody: ApiErrorResponse = {
      error: "UNAUTHORIZED",
      message: "Missing or invalid demo token.",
    };
    return { status: 401, jsonBody: errorBody };
  }

  // Route by HTTP method
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

    // Validate with Zod
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

    context.log("Profile PATCH — updated profile");
    return { status: 200, jsonBody: updatedProfile };
  }

  // Unsupported method (shouldn't reach here due to route config)
  return {
    status: 405,
    jsonBody: { error: "NOT_FOUND", message: "Method not allowed." },
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
