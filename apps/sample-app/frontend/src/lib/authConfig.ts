// =============================================================================
// MSAL Authentication Configuration — Entra ID (Single-Tenant SPA)
// =============================================================================
// Configures @azure/msal-browser for Entra ID redirect-based login.
// Used when NEXT_PUBLIC_AUTH_MODE=entra (the production default).
//
// To enable Entra ID auth:
//   1. Create an Entra ID app registration in Azure Portal
//   2. Set NEXT_PUBLIC_ENTRA_CLIENT_ID and NEXT_PUBLIC_ENTRA_TENANT_ID
//   3. Set NEXT_PUBLIC_AUTH_MODE=entra (or remove it — entra is default)
//
// Defense-in-depth chain:
//   MSAL token → APIM validate-jwt → Function Key → Function authLevel:"function"
// =============================================================================

import {
  PublicClientApplication,
  type Configuration,
  LogLevel,
} from "@azure/msal-browser";

// ---------------------------------------------------------------------------
// MSAL Configuration
// ---------------------------------------------------------------------------

const clientId = process.env.NEXT_PUBLIC_ENTRA_CLIENT_ID ?? "";         // TODO: Set from your Entra ID app registration
const tenantId = process.env.NEXT_PUBLIC_ENTRA_TENANT_ID ?? "";         // TODO: Set from your Azure tenant
const redirectUri =
  process.env.NEXT_PUBLIC_ENTRA_REDIRECT_URI ?? "http://localhost:3000/";

export const msalConfig: Configuration = {
  auth: {
    clientId,
    // Single-tenant authority — NOT "common" or "organizations"
    authority: `https://login.microsoftonline.com/${tenantId}`,
    redirectUri,
    postLogoutRedirectUri: redirectUri,
  },
  cache: {
    // localStorage persists across tabs/refreshes; sessionStorage is per-tab
    cacheLocation: "localStorage",
  },
  system: {
    loggerOptions: {
      logLevel: LogLevel.Warning,
      piiLoggingEnabled: false,
    },
  },
};

// ---------------------------------------------------------------------------
// Login Request — scopes for the API
// ---------------------------------------------------------------------------

export const loginRequest = {
  scopes: ["api://sample-app-dev/user_impersonation"],                   // TODO: Match your Entra ID app's oauth2_permission_scope
};

// ---------------------------------------------------------------------------
// MSAL Instance (singleton)
// ---------------------------------------------------------------------------

export const msalInstance = new PublicClientApplication(msalConfig);
