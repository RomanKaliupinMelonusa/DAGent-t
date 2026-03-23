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
// =============================================================================

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
// Generic fetch wrapper
// ---------------------------------------------------------------------------

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
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
    const message =
      (body as { message?: string }).message ??
      `API error ${response.status} on ${path}`;

    if (response.status === 401 || response.status === 403) {
      throw new ApiError("AUTH_ERROR", message, response.status);
    }
    if (response.status === 404) {
      throw new ApiError("NOT_FOUND", message, response.status);
    }
    if (response.status >= 500) {
      throw new ApiError("SERVER_ERROR", message, response.status);
    }
    throw new ApiError("UNKNOWN", message, response.status);
  }

  return (await response.json()) as T;
}
