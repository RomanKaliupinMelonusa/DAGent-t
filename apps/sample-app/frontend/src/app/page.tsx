"use client";

import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/apiClient";
import { HelloResponseSchema, type HelloResponse } from "@branded/schemas";
import { Button } from "@/components/ui/primitives";

export default function HomePage() {
  const [response, setResponse] = useState<HelloResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function callHello() {
    setError(null);
    setIsLoading(true);
    try {
      const data = await apiFetch<HelloResponse>(
        "/hello?name=Demo",
        {},
        HelloResponseSchema,
      );
      setResponse(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-text-primary">Welcome to Sample App</h1>
      <p className="text-text-secondary">
        You are signed in. This page is protected by the auth gate.
      </p>

      {/* Authenticated API call demo */}
      <div className="rounded-lg border border-border bg-surface-card p-6 transition-colors duration-200">
        <h2 className="mb-3 text-lg font-semibold text-text-primary">Authenticated API Call</h2>
        <p className="mb-4 text-sm text-text-secondary">
          Calls <code className="rounded bg-surface-alt px-1.5 py-0.5 text-xs">GET /hello</code> with
          auth headers injected automatically (X-Demo-Token in demo mode, Bearer JWT in Entra mode).
        </p>
        <Button onClick={callHello} disabled={isLoading} data-testid="call-hello-button">
          {isLoading ? "Calling..." : "Call /hello"}
        </Button>
        {response && (
          <pre className="mt-4 rounded-lg bg-surface-alt p-4 text-sm text-text-secondary" data-testid="hello-response">
            {JSON.stringify(response, null, 2)}
          </pre>
        )}
        {error && (
          <div className="mt-4 rounded-lg border border-danger-border bg-danger-bg px-4 py-3 text-sm text-danger-text" role="alert">
            {error}
          </div>
        )}
      </div>

      {/* Getting started */}
      <div className="rounded-lg border border-border bg-surface-card p-6 transition-colors duration-200">
        <h2 className="mb-3 text-lg font-semibold text-text-primary">Getting Started</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-text-secondary">
          <li>Add your own pages under <code className="rounded bg-surface-alt px-1.5 py-0.5 text-xs">src/app/</code></li>
          <li>Add API endpoints in <code className="rounded bg-surface-alt px-1.5 py-0.5 text-xs">backend/src/functions/</code></li>
          <li>Use <code className="rounded bg-surface-alt px-1.5 py-0.5 text-xs">apiFetch()</code> from <code className="rounded bg-surface-alt px-1.5 py-0.5 text-xs">lib/apiClient.ts</code> for authenticated API calls</li>
          <li>Switch to Entra ID by setting <code className="rounded bg-surface-alt px-1.5 py-0.5 text-xs">NEXT_PUBLIC_AUTH_MODE=entra</code></li>
        </ul>
      </div>
    </div>
  );
}
