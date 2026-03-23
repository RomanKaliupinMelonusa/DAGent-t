// =============================================================================
// Providers — Dual-mode auth provider (demo + Entra ID)
// =============================================================================
// Controlled by NEXT_PUBLIC_AUTH_MODE:
//   - "demo": Simple username/password login via DemoAuthContext
//   - "entra" (default): MSAL v5 redirect-based Entra ID login
// =============================================================================

"use client";

import { type ReactNode, useEffect, useState } from "react";
import { DemoAuthProvider, useDemoAuth } from "@/lib/demoAuthContext";
import DemoLoginForm from "@/components/DemoLoginForm";

const authMode = process.env.NEXT_PUBLIC_AUTH_MODE ?? "entra";

// ---------------------------------------------------------------------------
// Auth Error Fallback — shown when redirect-based login fails
// ---------------------------------------------------------------------------

function AuthError() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div
        className="rounded-lg border border-danger-border bg-danger-bg px-4 py-3 text-sm text-danger-text transition-colors duration-200"
        role="alert"
      >
        <div className="flex items-start gap-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="mt-0.5 h-4 w-4 shrink-0"
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
              clipRule="evenodd"
            />
          </svg>
          <p>Session expired — please sign in again.</p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading Fallback — shown during MSAL redirect/initialization
// ---------------------------------------------------------------------------

function AuthLoading() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="flex items-center justify-center gap-3 text-sm text-text-muted">
        <svg
          className="h-5 w-5 animate-spin"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        <span>Signing in…</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Providers Component — dual-mode auth
// ---------------------------------------------------------------------------

interface ProvidersProps {
  children: ReactNode;
}

export default function Providers({ children }: ProvidersProps) {
  if (authMode === "demo") {
    return <DemoProviders>{children}</DemoProviders>;
  }
  return <EntraProviders>{children}</EntraProviders>;
}

// ---------------------------------------------------------------------------
// Demo Mode — DemoAuthProvider + login gate
// ---------------------------------------------------------------------------

function DemoGate({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useDemoAuth();

  if (!isAuthenticated) {
    return <DemoLoginForm />;
  }

  return <>{children}</>;
}

function DemoProviders({ children }: { children: ReactNode }) {
  return (
    <DemoAuthProvider>
      <DemoGate>{children}</DemoGate>
    </DemoAuthProvider>
  );
}

// ---------------------------------------------------------------------------
// Entra Mode — MSAL Provider + redirect-based auth
// ---------------------------------------------------------------------------

function EntraProviders({ children }: { children: ReactNode }) {
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const { msalInstance } = require("@/lib/authConfig") as typeof import("@/lib/authConfig");
    msalInstance.initialize().then(() => {
      msalInstance.handleRedirectPromise().then((response: { account?: unknown } | null) => {
        if (response?.account) {
          msalInstance.setActiveAccount(response.account as import("@azure/msal-browser").AccountInfo);
        } else if (!msalInstance.getActiveAccount()) {
          const accounts = msalInstance.getAllAccounts();
          if (accounts.length > 0) {
            msalInstance.setActiveAccount(accounts[0]);
          }
        }
        setIsInitialized(true);
      });
    });
  }, []);

  if (!isInitialized) {
    return <AuthLoading />;
  }

  const { MsalProvider, MsalAuthenticationTemplate } = require("@azure/msal-react") as typeof import("@azure/msal-react");
  const { InteractionType } = require("@azure/msal-browser") as typeof import("@azure/msal-browser");
  const { msalInstance, loginRequest } = require("@/lib/authConfig") as typeof import("@/lib/authConfig");

  return (
    <MsalProvider instance={msalInstance}>
      <MsalAuthenticationTemplate
        interactionType={InteractionType.Redirect}
        authenticationRequest={loginRequest}
        errorComponent={AuthError}
        loadingComponent={AuthLoading}
      >
        {children}
      </MsalAuthenticationTemplate>
    </MsalProvider>
  );
}
