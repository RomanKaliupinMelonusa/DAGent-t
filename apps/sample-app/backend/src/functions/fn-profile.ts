// =============================================================================
// fn-profile — User Profile GET + PATCH
// =============================================================================
// HTTP trigger: GET /profile  — returns the authenticated user's mock profile.
// HTTP trigger: PATCH /profile — validates and merges profile update fields.
//
// Auth: validates X-Demo-Token header against DEMO_TOKEN env var using
// constant-time comparison (crypto.timingSafeEqual).
//
// The profile is hardcoded (mock). PATCH merges update fields into the mock
// profile but does not persist — spec says "mocked."
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
      const errBody: ApiErrorResponse = {
        error: "INVALID_INPUT",
        message: "Invalid JSON body.",
      };
      return { status: 400, jsonBody: errBody };
    }

    // Validate with ProfileUpdateSchema
    const parsed = ProfileUpdateSchema.safeParse(body);
    if (!parsed.success) {
      const paths = parsed.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ");
      const errBody: ApiErrorResponse = {
        error: "INVALID_INPUT",
        message: paths,
      };
      return { status: 400, jsonBody: errBody };
    }

    // Merge update into mock profile
    const updated: UserProfile = {
      ...MOCK_PROFILE,
      ...parsed.data,
    };

    context.log("Profile PATCH — updated mock profile");
    return { status: 200, jsonBody: updated };
  }

  // Fallback for unexpected methods (shouldn't reach here with route config)
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
