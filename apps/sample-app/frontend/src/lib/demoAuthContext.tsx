// =============================================================================
// DemoAuthContext — Simple username/password auth for demo mode
// =============================================================================
// Provides { isAuthenticated, displayName, token, login, logout } context.
// Calls POST /auth/login on the backend to validate credentials and receive
// a demo token. Token is stored in sessionStorage (cleared on tab close).
//
// Used when NEXT_PUBLIC_AUTH_MODE=demo. The Entra ID / MSAL flow is used
// when auth mode is "entra" (default).
// =============================================================================

"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import {
  DemoLoginResponseSchema,
  type DemoLoginResponse,
} from "@branded/schemas";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DemoAuthState {
  isAuthenticated: boolean;
  displayName: string | null;
  token: string | null;
}

interface DemoAuthContextValue extends DemoAuthState {
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

const STORAGE_KEY = "demo_auth";

// ---------------------------------------------------------------------------
// URL construction
// ---------------------------------------------------------------------------

const BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:7071/api";
const AUTH_API_PATH = process.env.NEXT_PUBLIC_AUTH_API_PATH ?? "";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const DemoAuthContext = createContext<DemoAuthContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface DemoAuthProviderProps {
  children: ReactNode;
}

export function DemoAuthProvider({ children }: DemoAuthProviderProps) {
  const [state, setState] = useState<DemoAuthState>({
    isAuthenticated: false,
    displayName: null,
    token: null,
  });

  // Hydrate from sessionStorage on mount
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as {
          token: string;
          displayName: string;
        };
        if (parsed.token) {
          setState({
            isAuthenticated: true,
            displayName: parsed.displayName,
            token: parsed.token,
          });
        }
      }
    } catch {
      // Corrupted storage — ignore
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const login = useCallback(
    async (username: string, password: string): Promise<void> => {
      // Input validation — reject empty strings before hitting the network
      const trimmedUser = username.trim();
      const trimmedPass = password.trim();
      if (!trimmedUser || !trimmedPass) {
        throw new Error("Username and password are required.");
      }

      const response = await fetch(`${BASE_URL}${AUTH_API_PATH}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: trimmedUser, password: trimmedPass }),
      });

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as {
          message?: string;
        };
        throw new Error(
          errorBody.message ?? "Invalid username or password.",
        );
      }

      const json: unknown = await response.json();

      // Runtime validation with shared Zod schema
      const parsed = DemoLoginResponseSchema.safeParse(json);
      if (!parsed.success) {
        throw new Error("Unexpected login response format.");
      }

      const { token, displayName }: DemoLoginResponse = parsed.data;

      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ token, displayName }),
      );

      setState({ isAuthenticated: true, displayName, token });
    },
    [],
  );

  const logout = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setState({ isAuthenticated: false, displayName: null, token: null });
  }, []);

  return (
    <DemoAuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </DemoAuthContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDemoAuth(): DemoAuthContextValue {
  const ctx = useContext(DemoAuthContext);
  if (!ctx) {
    throw new Error("useDemoAuth must be used inside <DemoAuthProvider>");
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Utility — read token from sessionStorage (for apiClient.ts)
// ---------------------------------------------------------------------------

export function getDemoToken(): string | null {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as { token?: string };
    return parsed.token ?? null;
  } catch {
    return null;
  }
}
