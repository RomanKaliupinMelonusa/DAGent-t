// =============================================================================
// API Client — Dual-mode auth headers + generic fetch wrapper
// =============================================================================
// Dual-mode authentication (NEXT_PUBLIC_AUTH_MODE):
//   - "demo": sessionStorage token → X-Demo-Token: <token>
//   - "entra" (default): MSAL acquireTokenSilent() → Authorization: Bearer <token>
//
// Demo chain:
//   X-Demo-Token → APIM check-header → Function Key → Function authLevel:"function"
// Entra chain:
//   MSAL token → APIM validate-jwt → Function Key → Function authLevel:"function"
//
// Responses are validated at runtime using shared Zod schemas from @branded/schemas.
// =============================================================================

import { type ZodType } from "zod";
import {
  ApiErrorResponseSchema,
  type ApiErrorResponse,
} from "@branded/schemas";
import { getDemoToken } from "./demoAuthContext";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:7071/api";
const authMode = process.env.NEXT_PUBLIC_AUTH_MODE ?? "entra";

// ---------------------------------------------------------------------------
// ApiError
// ---------------------------------------------------------------------------

export type ApiErrorCode =
  | "NETWORK_ERROR"
  | "AUTH_ERROR"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "SERVER_ERROR"
  | "UNKNOWN";

export class ApiError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ---------------------------------------------------------------------------
// Auth Headers — dual-mode
// ---------------------------------------------------------------------------

function getDemoAuthHeaders(): Record<string, string> {
  const token = getDemoToken();
  if (!token) {
    throw new ApiError("AUTH_ERROR", "Not authenticated — no demo token found.");
  }
  return { "X-Demo-Token": token };
}

async function getEntraAuthHeaders(): Promise<Record<string, string>> {
  const { msalInstance, loginRequest } = await import("./authConfig");
  const account = msalInstance.getActiveAccount();
  if (!account) {
    throw new ApiError("AUTH_ERROR", "Not authenticated — no active Entra account.");
  }

  try {
    const response = await msalInstance.acquireTokenSilent({
      ...loginRequest,
      account,
    });
    return { Authorization: `Bearer ${response.accessToken}` };
  } catch {
    // Silent acquisition failed — redirect to login
    await msalInstance.acquireTokenRedirect(loginRequest);
    throw new ApiError("AUTH_ERROR", "Token acquisition failed — redirecting to login.");
  }
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  if (authMode === "demo") {
    return getDemoAuthHeaders();
  }
  return getEntraAuthHeaders();
}

// ---------------------------------------------------------------------------
// Error response parsing — uses shared ApiErrorResponseSchema
// ---------------------------------------------------------------------------

function parseErrorResponse(
  body: unknown,
  status: number,
  path: string,
): ApiError {
  const parsed = ApiErrorResponseSchema.safeParse(body);

  if (parsed.success) {
    const errData: ApiErrorResponse = parsed.data;
    const code = mapApiErrorCode(errData.error, status);
    return new ApiError(code, errData.message, status);
  }

  // Fallback: non-standard error body
  const fallbackMsg =
    (body as { message?: string })?.message ??
    `API error ${status} on ${path}`;

  if (status === 401 || status === 403) {
    return new ApiError("AUTH_ERROR", fallbackMsg, status);
  }
  if (status === 404) {
    return new ApiError("NOT_FOUND", fallbackMsg, status);
  }
  if (status >= 500) {
    return new ApiError("SERVER_ERROR", fallbackMsg, status);
  }
  return new ApiError("UNKNOWN", fallbackMsg, status);
}

function mapApiErrorCode(
  serverCode: string,
  status: number,
): ApiErrorCode {
  switch (serverCode) {
    case "UNAUTHORIZED":
      return "AUTH_ERROR";
    case "INVALID_INPUT":
      return "VALIDATION_ERROR";
    case "NOT_FOUND":
      return "NOT_FOUND";
    case "SERVER_ERROR":
      return "SERVER_ERROR";
    default:
      if (status === 401 || status === 403) return "AUTH_ERROR";
      if (status >= 500) return "SERVER_ERROR";
      return "UNKNOWN";
  }
}

// ---------------------------------------------------------------------------
// Generic fetch wrapper — with optional Zod schema validation
// ---------------------------------------------------------------------------

/**
 * Fetch from the API with auto-injected auth headers.
 *
 * @param path - API path (e.g. "/hello")
 * @param options - Standard RequestInit overrides
 * @param schema - Optional Zod schema for runtime response validation
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
  schema?: ZodType<T>,
): Promise<T> {
  const authHeaders = await getAuthHeaders();

  const url = `${BASE_URL}${path}`;
  let response: Response;

  try {
    response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
        ...options.headers,
      },
    });
  } catch (err) {
    throw new ApiError(
      "NETWORK_ERROR",
      `Network error calling ${path}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw parseErrorResponse(body, response.status, path);
  }

  const json: unknown = await response.json();

  // Runtime validation with Zod schema if provided
  if (schema) {
    const result = schema.safeParse(json);
    if (!result.success) {
      throw new ApiError(
        "VALIDATION_ERROR",
        `Invalid response from ${path}: ${result.error.issues.map((i) => i.message).join(", ")}`,
        response.status,
      );
    }
    return result.data;
  }

  return json as T;
}
